import { AppError, OPEN_TICKET_STATUSES, firstPassYield, normalizeSerial } from '@gamut/core';
import { and, asc, desc, eq, gte, ilike, inArray, lt } from 'drizzle-orm';
import type { Db } from '../db/client';
import * as s from '../db/schema';
import { getSettings } from './settings';

export function startOfToday(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Everything the production line screen shows. Public (read-only). */
export async function lineDashboard(db: Db, now = new Date()) {
  const from = startOfToday(now);
  const cfg = await getSettings(db);

  const todayTests = await db
    .select({
      id: s.tests.id,
      attemptNo: s.tests.attemptNo,
      result: s.tests.result,
      defectCodeId: s.tests.defectCodeId,
      testedAt: s.tests.testedAt,
      modelId: s.units.modelId,
    })
    .from(s.tests)
    .innerJoin(s.units, eq(s.units.id, s.tests.unitId))
    .where(gte(s.tests.testedAt, from));

  const first = todayTests.filter((t) => t.attemptNo === 1);
  const passedFirst = first.filter((t) => t.result === 'pass').length;
  const failedFirst = first.length - passedFirst;
  const repairedPassed = todayTests.filter((t) => t.attemptNo > 1 && t.result === 'pass').length;

  const hours: Array<{ hour: number; tested: number; failed: number }> = [];
  for (let h = 0; h <= now.getHours(); h++) hours.push({ hour: h, tested: 0, failed: 0 });
  for (const t of first) {
    const h = new Date(t.testedAt).getHours();
    const slot = hours[h];
    if (!slot) continue;
    slot.tested++;
    if (t.result === 'fail') slot.failed++;
  }
  // Show from the first hour with activity (or the last 8 hours) to keep the chart readable.
  const firstActive = hours.findIndex((h) => h.tested > 0);
  const startHour = firstActive === -1 ? Math.max(0, hours.length - 8) : Math.min(firstActive, Math.max(0, hours.length - 8));

  const defectCounts = new Map<number, number>();
  for (const t of todayTests) if (t.result === 'fail' && t.defectCodeId) defectCounts.set(t.defectCodeId, (defectCounts.get(t.defectCodeId) ?? 0) + 1);
  const defectIds = [...defectCounts.keys()];
  const defects = defectIds.length ? await db.select().from(s.defectCodes).where(inArray(s.defectCodes.id, defectIds)) : [];
  const topDefects = defects
    .map((d) => ({ id: d.id, code: d.code, name: d.name, count: defectCounts.get(d.id) ?? 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const modelCounts = new Map<number, { tested: number; failed: number }>();
  for (const t of first) {
    if (!t.modelId) continue;
    const m = modelCounts.get(t.modelId) ?? { tested: 0, failed: 0 };
    m.tested++;
    if (t.result === 'fail') m.failed++;
    modelCounts.set(t.modelId, m);
  }
  const modelIds = [...modelCounts.keys()];
  const modelRows = modelIds.length ? await db.select().from(s.models).where(inArray(s.models.id, modelIds)) : [];
  const byModel = modelRows
    .map((m) => {
      const c = modelCounts.get(m.id)!;
      return { id: m.id, code: m.code, name: m.name, ...c, fpy: firstPassYield(c.tested - c.failed, c.tested), target: m.fpyTarget ?? cfg.fpyTarget };
    })
    .sort((a, b) => b.tested - a.tested);

  const open = await db
    .select({ status: s.tickets.status, openedAt: s.tickets.openedAt, alert: s.tickets.alert })
    .from(s.tickets)
    .where(inArray(s.tickets.status, [...OPEN_TICKET_STATUSES]));
  const inRepair = open.filter((t) => t.status !== 'waiting_retest');
  const oldest = inRepair.reduce<Date | null>((min, t) => (!min || t.openedAt < min ? t.openedAt : min), null);

  const scrappedToday = await db
    .select({ id: s.events.id })
    .from(s.events)
    .where(and(eq(s.events.type, 'scrapped'), gte(s.events.createdAt, from)));

  return {
    now: now.toISOString(),
    target: cfg.fpyTarget,
    tested: first.length,
    passedFirst,
    failedFirst,
    repairedPassed,
    scrapped: scrappedToday.length,
    fpy: firstPassYield(passedFirst, first.length),
    hourly: hours.slice(startHour),
    topDefects,
    byModel,
    inRepair: inRepair.length,
    waitingParts: open.filter((t) => t.status === 'waiting_parts').length,
    waitingRetest: open.filter((t) => t.status === 'waiting_retest').length,
    alerts: open.filter((t) => t.alert).length,
    oldestInRepairSince: oldest ? oldest.toISOString() : null,
  };
}

const unitCols = {
  serial: s.units.serial,
  modelId: s.units.modelId,
  colorId: s.units.colorId,
  categoryId: s.units.categoryId,
};

/** Test room side panels. */
export async function qualitySummary(db: Db, userId: number, now = new Date()) {
  const from = startOfToday(now);
  const firstToday = await db
    .select({ result: s.tests.result })
    .from(s.tests)
    .where(and(gte(s.tests.testedAt, from), eq(s.tests.attemptNo, 1)));
  const retestsToday = await db
    .select({ result: s.tests.result })
    .from(s.tests)
    .where(and(gte(s.tests.testedAt, from), gte(s.tests.attemptNo, 2)));
  const retestQueue = await db
    .select({
      ticketId: s.tickets.id,
      number: s.tickets.number,
      assignedTo: s.tickets.assignedTo,
      sentToTestAt: s.tickets.sentToTestAt,
      retestFails: s.tickets.retestFails,
      ...unitCols,
    })
    .from(s.tickets)
    .innerJoin(s.units, eq(s.units.id, s.tickets.unitId))
    .where(eq(s.tickets.status, 'waiting_retest'))
    .orderBy(asc(s.tickets.sentToTestAt));
  const recent = await db
    .select({
      id: s.tests.id,
      result: s.tests.result,
      attemptNo: s.tests.attemptNo,
      defectCodeId: s.tests.defectCodeId,
      testedAt: s.tests.testedAt,
      ...unitCols,
    })
    .from(s.tests)
    .innerJoin(s.units, eq(s.units.id, s.tests.unitId))
    .where(eq(s.tests.testedBy, userId))
    .orderBy(desc(s.tests.id))
    .limit(20);
  const passed = firstToday.filter((t) => t.result === 'pass').length;
  return {
    today: {
      tested: firstToday.length,
      passed,
      failed: firstToday.length - passed,
      retested: retestsToday.length,
      retestPassed: retestsToday.filter((t) => t.result === 'pass').length,
      fpy: firstPassYield(passed, firstToday.length),
    },
    retestQueue,
    recent,
  };
}

/** All open repair tickets — the repair screen groups them. */
export async function openTickets(db: Db) {
  const rows = await db
    .select({
      id: s.tickets.id,
      number: s.tickets.number,
      status: s.tickets.status,
      assignedTo: s.tickets.assignedTo,
      retestFails: s.tickets.retestFails,
      alert: s.tickets.alert,
      openedAt: s.tickets.openedAt,
      openedByTestId: s.tickets.openedByTestId,
      unitId: s.tickets.unitId,
      ...unitCols,
    })
    .from(s.tickets)
    .innerJoin(s.units, eq(s.units.id, s.tickets.unitId))
    .where(inArray(s.tickets.status, [...OPEN_TICKET_STATUSES]))
    .orderBy(asc(s.tickets.openedAt));
  // Latest failed test per ticket = what the test room found.
  const ticketIds = rows.map((r) => r.id);
  const fails = ticketIds.length
    ? await db
        .select({ ticketId: s.tests.ticketId, defectCodeId: s.tests.defectCodeId, id: s.tests.id })
        .from(s.tests)
        .where(and(inArray(s.tests.ticketId, ticketIds), eq(s.tests.result, 'fail')))
        .orderBy(desc(s.tests.id))
    : [];
  const lastDefect = new Map<number, number | null>();
  for (const f of fails) if (f.ticketId && !lastDefect.has(f.ticketId)) lastDefect.set(f.ticketId, f.defectCodeId);
  return rows.map((r) => ({ ...r, lastDefectCodeId: lastDefect.get(r.id) ?? null }));
}

async function testsWithChecks(db: Db, unitId: number) {
  const tests = await db.select().from(s.tests).where(eq(s.tests.unitId, unitId)).orderBy(asc(s.tests.id));
  const ids = tests.map((t) => t.id);
  const checks = ids.length ? await db.select().from(s.checkResults).where(inArray(s.checkResults.testId, ids)) : [];
  return tests.map((t) => ({ ...t, checks: checks.filter((c) => c.testId === t.id) }));
}

/** Full history of one unit: every test, every ticket, every action, every event. */
export async function unitHistory(db: Db, rawSerial: string) {
  const serial = normalizeSerial(rawSerial);
  const [unit] = await db.select().from(s.units).where(eq(s.units.serial, serial));
  if (!unit) throw new AppError('not_found', 404);
  const tests = await testsWithChecks(db, unit.id);
  const tickets = await db.select().from(s.tickets).where(eq(s.tickets.unitId, unit.id)).orderBy(asc(s.tickets.id));
  const ticketIds = tickets.map((t) => t.id);
  const actions = ticketIds.length
    ? await db.select().from(s.repairActions).where(inArray(s.repairActions.ticketId, ticketIds)).orderBy(asc(s.repairActions.id))
    : [];
  const diagnoses = ticketIds.length
    ? await db.select().from(s.diagnoses).where(inArray(s.diagnoses.ticketId, ticketIds)).orderBy(asc(s.diagnoses.id))
    : [];
  const events = await db.select().from(s.events).where(eq(s.events.unitId, unit.id)).orderBy(asc(s.events.id));
  const actionIds = actions.map((a) => a.id);
  const used = actionIds.length ? await db.select().from(s.partsUsed).where(inArray(s.partsUsed.repairActionId, actionIds)) : [];
  const photos = await db.select().from(s.attachments).where(eq(s.attachments.unitId, unit.id)).orderBy(asc(s.attachments.id));
  return {
    unit,
    tests,
    tickets,
    actions: actions.map((a) => ({ ...a, partsUsed: used.filter((u) => u.repairActionId === a.id).map((u) => ({ partId: u.partId, quantity: u.quantity })) })),
    diagnoses,
    events,
    photos,
  };
}

export async function ticketDetail(db: Db, ticketId: number) {
  const [ticket] = await db.select().from(s.tickets).where(eq(s.tickets.id, ticketId));
  if (!ticket) throw new AppError('not_found', 404);
  const [unit] = await db.select().from(s.units).where(eq(s.units.id, ticket.unitId));
  const history = await unitHistory(db, unit.serial);
  return {
    ticket,
    unit,
    tests: history.tests,
    actions: history.actions.filter((a) => a.ticketId === ticket.id),
    diagnoses: history.diagnoses.filter((d) => d.ticketId === ticket.id),
    events: history.events.filter((e) => e.ticketId === ticket.id),
    otherTickets: history.tickets.filter((t) => t.id !== ticket.id),
    otherActions: history.actions.filter((a) => a.ticketId !== ticket.id),
    photos: history.photos.filter((p) => p.ticketId === ticket.id || (p.testId != null && history.tests.some((t) => t.id === p.testId && t.ticketId === ticket.id))),
  };
}

export async function searchUnits(db: Db, q: string) {
  const term = normalizeSerial(q);
  const base = db.select().from(s.units);
  const rows = term
    ? await base.where(ilike(s.units.serial, `%${term.replace(/[%_\\]/g, '')}%`)).orderBy(desc(s.units.id)).limit(50)
    : await base.orderBy(desc(s.units.id)).limit(50);
  return rows;
}

/** What one person did between two dates. */
export async function personActivity(db: Db, userId: number, from: Date, to: Date) {
  const tests = await db
    .select({ id: s.tests.id, result: s.tests.result, attemptNo: s.tests.attemptNo, defectCodeId: s.tests.defectCodeId, testedAt: s.tests.testedAt, serial: s.units.serial, modelId: s.units.modelId })
    .from(s.tests)
    .innerJoin(s.units, eq(s.units.id, s.tests.unitId))
    .where(and(eq(s.tests.testedBy, userId), gte(s.tests.testedAt, from), lt(s.tests.testedAt, to)))
    .orderBy(desc(s.tests.id));
  const actions = await db
    .select({
      id: s.repairActions.id,
      ticketId: s.repairActions.ticketId,
      componentId: s.repairActions.componentId,
      actionTypeId: s.repairActions.actionTypeId,
      description: s.repairActions.description,
      durationMin: s.repairActions.durationMin,
      createdAt: s.repairActions.createdAt,
      ticketNumber: s.tickets.number,
      serial: s.units.serial,
      modelId: s.units.modelId,
    })
    .from(s.repairActions)
    .innerJoin(s.tickets, eq(s.tickets.id, s.repairActions.ticketId))
    .innerJoin(s.units, eq(s.units.id, s.tickets.unitId))
    .where(and(eq(s.repairActions.userId, userId), gte(s.repairActions.createdAt, from), lt(s.repairActions.createdAt, to)))
    .orderBy(desc(s.repairActions.id));
  return { tests, actions };
}

/** Change log: everything that happened, newest first. */
export async function auditLog(db: Db, opts: { from: Date; to: Date; type?: string; userId?: number; beforeId?: number; limit: number }) {
  const conds = [gte(s.events.createdAt, opts.from), lt(s.events.createdAt, opts.to)];
  if (opts.type) conds.push(eq(s.events.type, opts.type));
  if (opts.userId) conds.push(eq(s.events.userId, opts.userId));
  if (opts.beforeId) conds.push(lt(s.events.id, opts.beforeId));
  const rows = await db
    .select({ event: s.events, serial: s.units.serial, ticketNumber: s.tickets.number })
    .from(s.events)
    .leftJoin(s.units, eq(s.units.id, s.events.unitId))
    .leftJoin(s.tickets, eq(s.tickets.id, s.events.ticketId))
    .where(and(...conds))
    .orderBy(desc(s.events.id))
    .limit(opts.limit);
  return rows.map((r) => ({ ...r.event, serial: r.serial, ticketNumber: r.ticketNumber }));
}
