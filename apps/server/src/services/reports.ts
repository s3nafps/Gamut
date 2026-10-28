import { firstPassYield } from '@gamut/core';
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import type { Db } from '../db/client';
import * as s from '../db/schema';
import { getSettings } from './settings';

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const minutesBetween = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

function countBy<T>(rows: T[], key: (r: T) => number | null | undefined) {
  const m = new Map<number, number>();
  for (const r of rows) {
    const k = key(r);
    if (k != null) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/** All KPIs for a date range [from, to). Names are resolved on screen from the catalog. */
export async function buildReport(db: Db, from: Date, to: Date) {
  const cfg = await getSettings(db);
  const range = (col: any) => and(gte(col, from), lt(col, to));

  // ---- Tests ----
  const tests = await db
    .select({
      id: s.tests.id,
      unitId: s.tests.unitId,
      attemptNo: s.tests.attemptNo,
      result: s.tests.result,
      defectCodeId: s.tests.defectCodeId,
      testedBy: s.tests.testedBy,
      testedAt: s.tests.testedAt,
      ticketId: s.tests.ticketId,
      modelId: s.units.modelId,
      colorId: s.units.colorId,
    })
    .from(s.tests)
    .innerJoin(s.units, eq(s.units.id, s.tests.unitId))
    .where(range(s.tests.testedAt))
    .orderBy(asc(s.tests.testedAt));
  const first = tests.filter((t) => t.attemptNo === 1);
  const retests = tests.filter((t) => t.attemptNo > 1);
  const passedFirst = first.filter((t) => t.result === 'pass').length;

  const group = <K extends string | number>(rows: typeof first, key: (t: (typeof first)[number]) => K | null) => {
    const m = new Map<K, { tested: number; passed: number }>();
    for (const t of rows) {
      const k = key(t);
      if (k == null) continue;
      const g = m.get(k) ?? { tested: 0, passed: 0 };
      g.tested++;
      if (t.result === 'pass') g.passed++;
      m.set(k, g);
    }
    return [...m].map(([k, g]) => ({ key: k, ...g, failed: g.tested - g.passed, fpy: firstPassYield(g.passed, g.tested) }));
  };

  const modelRows = await db.select({ id: s.models.id, fpyTarget: s.models.fpyTarget }).from(s.models);
  const byDay = group(first, (t) => dayKey(new Date(t.testedAt))).sort((a, b) => String(a.key).localeCompare(String(b.key)));
  const byModel = group(first, (t) => t.modelId)
    .map((g) => ({ ...g, target: modelRows.find((m) => m.id === g.key)?.fpyTarget ?? cfg.fpyTarget }))
    .sort((a, b) => b.tested - a.tested);
  const byColor = group(first, (t) => t.colorId).sort((a, b) => b.tested - a.tested);

  const failed = tests.filter((t) => t.result === 'fail');
  const defects = [...countBy(failed, (t) => t.defectCodeId)].map(([id, count]) => ({ defectCodeId: id, count })).sort((a, b) => b.count - a.count);
  let running = 0;
  const pareto = defects.map((d) => {
    running += d.count;
    return { ...d, cumulativePct: Math.round((running / Math.max(1, failed.length)) * 1000) / 10 };
  });

  // ---- Repairs ----
  const actions = await db
    .select({
      id: s.repairActions.id,
      ticketId: s.repairActions.ticketId,
      userId: s.repairActions.userId,
      componentId: s.repairActions.componentId,
      actionTypeId: s.repairActions.actionTypeId,
      durationMin: s.repairActions.durationMin,
    })
    .from(s.repairActions)
    .where(range(s.repairActions.createdAt));

  const componentMap = new Map<string, { componentId: number; actionTypeId: number; count: number }>();
  for (const a of actions) {
    const k = `${a.componentId}-${a.actionTypeId}`;
    const g = componentMap.get(k) ?? { componentId: a.componentId, actionTypeId: a.actionTypeId, count: 0 };
    g.count++;
    componentMap.set(k, g);
  }
  const components = [...componentMap.values()].sort((a, b) => b.count - a.count);

  const actionIds = actions.map((a) => a.id);
  const used = actionIds.length
    ? await db.select().from(s.partsUsed).where(inArray(s.partsUsed.repairActionId, actionIds))
    : [];
  const partsMap = new Map<number, number>();
  for (const u of used) partsMap.set(u.partId, (partsMap.get(u.partId) ?? 0) + u.quantity);
  const partsUsed = [...partsMap].map(([partId, quantity]) => ({ partId, quantity })).sort((a, b) => b.quantity - a.quantity);

  const closed = await db
    .select()
    .from(s.tickets)
    .where(and(range(s.tickets.closedAt), eq(s.tickets.outcome, 'repaired')));
  const closedIds = closed.map((t) => t.id);
  const closedActions = closedIds.length
    ? await db.select({ ticketId: s.repairActions.ticketId, durationMin: s.repairActions.durationMin }).from(s.repairActions).where(inArray(s.repairActions.ticketId, closedIds))
    : [];
  const handsOn = closed.map((t) => closedActions.filter((a) => a.ticketId === t.id).reduce((n, a) => n + (a.durationMin ?? 0), 0));

  // Time a repaired unit waited for the test room: from "sent to test" to the next test.
  const retestTicketIds = [...new Set(retests.map((t) => t.ticketId).filter((x): x is number => !!x))];
  const sentEvents = retestTicketIds.length
    ? await db
        .select({ ticketId: s.events.ticketId, createdAt: s.events.createdAt })
        .from(s.events)
        .where(and(inArray(s.events.ticketId, retestTicketIds), eq(s.events.type, 'status_changed'), eq(s.events.toStatus, 'waiting_retest')))
    : [];
  const waits: number[] = [];
  for (const t of retests) {
    const sent = sentEvents.filter((e) => e.ticketId === t.ticketId && e.createdAt <= t.testedAt).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (sent) waits.push(minutesBetween(sent.createdAt, t.testedAt));
  }

  // ---- People ----
  const ticketOwners = retestTicketIds.length
    ? await db.select({ id: s.tickets.id, assignedTo: s.tickets.assignedTo }).from(s.tickets).where(inArray(s.tickets.id, retestTicketIds))
    : [];
  const repairmen = new Map<number, { userId: number; units: Set<number>; actions: number; minutes: number; retests: number; retestFails: number }>();
  const rm = (id: number) => {
    let g = repairmen.get(id);
    if (!g) repairmen.set(id, (g = { userId: id, units: new Set(), actions: 0, minutes: 0, retests: 0, retestFails: 0 }));
    return g;
  };
  for (const a of actions) {
    const g = rm(a.userId);
    g.units.add(a.ticketId);
    g.actions++;
    g.minutes += a.durationMin ?? 0;
  }
  for (const t of retests) {
    const owner = ticketOwners.find((o) => o.id === t.ticketId)?.assignedTo;
    if (!owner) continue;
    const g = rm(owner);
    g.retests++;
    if (t.result === 'fail') g.retestFails++;
  }
  const testers = new Map<number, { userId: number; tests: number; fails: number }>();
  for (const t of tests) {
    const g = testers.get(t.testedBy) ?? { userId: t.testedBy, tests: 0, fails: 0 };
    g.tests++;
    if (t.result === 'fail') g.fails++;
    testers.set(t.testedBy, g);
  }

  // ---- Scrap & repeat repairs ----
  const scrapped = await db
    .select({ unitId: s.events.unitId, userId: s.events.userId, data: s.events.data, createdAt: s.events.createdAt, serial: s.units.serial, modelId: s.units.modelId })
    .from(s.events)
    .innerJoin(s.units, eq(s.units.id, s.events.unitId))
    .where(and(eq(s.events.type, 'scrapped'), range(s.events.createdAt)));

  const openedInRange = await db.select({ unitId: s.tickets.unitId }).from(s.tickets).where(range(s.tickets.openedAt));
  const unitIds = [...new Set(openedInRange.map((t) => t.unitId))];
  const allTicketsOfThose = unitIds.length ? await db.select({ unitId: s.tickets.unitId }).from(s.tickets).where(inArray(s.tickets.unitId, unitIds)) : [];
  const repeatCounts = countBy(allTicketsOfThose, (t) => t.unitId);
  const repeatIds = [...repeatCounts].filter(([, n]) => n > 1).map(([id]) => id);
  const repeatUnits = repeatIds.length
    ? (await db.select({ id: s.units.id, serial: s.units.serial, modelId: s.units.modelId }).from(s.units).where(inArray(s.units.id, repeatIds))).map((u) => ({
        ...u,
        repairs: repeatCounts.get(u.id) ?? 0,
      }))
    : [];

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    target: cfg.fpyTarget,
    summary: {
      tested: first.length,
      passedFirst,
      failedFirst: first.length - passedFirst,
      fpy: firstPassYield(passedFirst, first.length),
      retests: retests.length,
      retestFails: retests.filter((t) => t.result === 'fail').length,
      repaired: closed.length,
      scrapped: scrapped.length,
      avgRepairMinutes: avg(closed.map((t) => minutesBetween(t.openedAt, t.closedAt!))),
      avgHandsOnMinutes: avg(handsOn),
      avgWaitRetestMinutes: avg(waits),
    },
    byDay,
    byModel,
    byColor,
    defects: pareto,
    components,
    partsUsed,
    repairmen: [...repairmen.values()]
      .map((g) => ({ userId: g.userId, units: g.units.size, actions: g.actions, minutes: g.minutes, retests: g.retests, retestFails: g.retestFails }))
      .sort((a, b) => b.units - a.units),
    testers: [...testers.values()].sort((a, b) => b.tests - a.tests),
    scrapped: scrapped.map((e) => ({ serial: e.serial, modelId: e.modelId, userId: e.userId, reason: (e.data as { reason?: string }).reason ?? '', at: e.createdAt })),
    repeatUnits: repeatUnits.sort((a, b) => b.repairs - a.repairs),
  };
}
