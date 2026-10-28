import {
  AppError,
  IN_REPAIR_TICKET_STATUSES,
  OPEN_TICKET_STATUSES,
  canTransition,
  decodeSerial,
  isValidSerial,
  normalizeSerial,
  scanModeFor,
  type RecordTestInput,
  type ScanMode,
  type TicketStatus,
} from '@gamut/core';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db, DbOrTx, Tx } from '../db/client';
import * as s from '../db/schema';
import { getSettings } from './settings';

export type Actor = { id: number; roles: string[] };

async function logEvent(
  tx: DbOrTx,
  e: {
    unitId?: number | null;
    ticketId?: number | null;
    type: string;
    from?: string | null;
    to?: string | null;
    userId: number | null;
    data?: Record<string, unknown>;
  },
) {
  await tx.insert(s.events).values({
    unitId: e.unitId ?? null,
    ticketId: e.ticketId ?? null,
    type: e.type,
    fromStatus: e.from ?? null,
    toStatus: e.to ?? null,
    userId: e.userId,
    data: e.data ?? {},
  });
}

async function openTicketFor(tx: DbOrTx, unitId: number, lock = false) {
  const q = tx
    .select()
    .from(s.tickets)
    .where(and(eq(s.tickets.unitId, unitId), inArray(s.tickets.status, [...OPEN_TICKET_STATUSES])))
    .orderBy(desc(s.tickets.id))
    .limit(1);
  const rows = lock ? await q.for('update') : await q;
  return rows[0] ?? null;
}

type FromSerial = {
  decoded: ReturnType<typeof decodeSerial>;
  model: typeof s.models.$inferSelect | null;
  color: typeof s.colors.$inferSelect | null;
};

async function resolveFromSerial(db: DbOrTx, serial: string): Promise<FromSerial> {
  const rules = await db.select().from(s.serialRules).where(eq(s.serialRules.active, true));
  const decoded = decodeSerial(serial, rules);
  if (!decoded) return { decoded: null, model: null, color: null };
  const [model] = decoded.modelCode
    ? await db
        .select()
        .from(s.models)
        .where(and(eq(s.models.categoryId, decoded.categoryId), eq(s.models.code, decoded.modelCode)))
    : [];
  const [color] = decoded.colorCode ? await db.select().from(s.colors).where(eq(s.colors.code, decoded.colorCode)) : [];
  return { decoded, model: model ?? null, color: color ?? null };
}

/** What the test room sees right after scanning. Does not change anything. */
export async function lookupScan(db: Db, rawSerial: string) {
  const serial = normalizeSerial(rawSerial);
  if (!isValidSerial(serial)) throw new AppError('invalid_serial');
  const [unit] = await db.select().from(s.units).where(eq(s.units.serial, serial));
  const ticket = unit ? await openTicketFor(db, unit.id) : null;
  const mode: ScanMode = scanModeFor(unit ? { status: unit.status as never } : null, (ticket?.status as TicketStatus) ?? null);
  const fromSerial = unit ? null : await resolveFromSerial(db, serial);
  const [{ value: attempts }] = unit
    ? await db.select({ value: count() }).from(s.tests).where(eq(s.tests.unitId, unit.id))
    : [{ value: 0 }];
  const repairs = ticket
    ? await db
        .select()
        .from(s.repairActions)
        .where(eq(s.repairActions.ticketId, ticket.id))
        .orderBy(asc(s.repairActions.id))
    : [];
  const [{ value: pastTickets }] = unit
    ? await db.select({ value: count() }).from(s.tickets).where(eq(s.tickets.unitId, unit.id))
    : [{ value: 0 }];
  const decodedModel = fromSerial?.decoded?.modelCode ?? null;
  const decodedColor = fromSerial?.decoded?.colorCode ?? null;
  return {
    serial,
    mode,
    unit: unit ?? null,
    ticket,
    repairs,
    attempts: Number(attempts),
    pastTickets: Number(pastTickets),
    decoded: fromSerial?.decoded ?? null,
    suggestedModelId: unit?.modelId ?? fromSerial?.model?.id ?? null,
    suggestedColorId: unit?.colorId ?? fromSerial?.color?.id ?? null,
    suggestedCategoryId: unit?.categoryId ?? fromSerial?.decoded?.categoryId ?? null,
    unknownModelCode: decodedModel && !fromSerial?.model ? decodedModel : null,
    unknownColorCode: decodedColor && !fromSerial?.color ? decodedColor : null,
  };
}

async function nextTicketNumber(tx: Tx): Promise<string> {
  const res = await tx.execute(sql`select nextval('ticket_number_seq') as n`);
  const row = (res as unknown as { rows: Array<{ n: string | number }> }).rows[0];
  return `R-${new Date().getFullYear()}-${String(row.n).padStart(6, '0')}`;
}

const isUniqueViolation = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === '23505' || err?.cause?.code === '23505';
};

/** Test room: record PASS or FAIL for a scanned unit. */
export async function recordTest(db: Db, input: RecordTestInput, actor: Actor) {
  try {
    return await recordTestOnce(db, input, actor);
  } catch (e) {
    // Two PCs created the same new serial at the same moment: retry once, the unit now exists.
    if (isUniqueViolation(e)) return recordTestOnce(db, input, actor);
    throw e;
  }
}

async function recordTestOnce(db: Db, input: RecordTestInput, actor: Actor) {
  const serial = normalizeSerial(input.serial);
  if (!isValidSerial(serial)) throw new AppError('invalid_serial');
  if (input.result === 'fail' && !input.defectCodeId) throw new AppError('defect_required');
  const cfg = await getSettings(db);

  return db.transaction(async (tx) => {
    let [unit] = await tx.select().from(s.units).where(eq(s.units.serial, serial)).for('update');

    if (!unit) {
      const fromSerial = await resolveFromSerial(tx, serial);
      if (fromSerial.decoded?.modelCode && !fromSerial.model && !input.modelId)
        throw new AppError('unknown_model_code', 400, { code: fromSerial.decoded.modelCode });
      if (fromSerial.decoded?.colorCode && !fromSerial.color && !input.colorId)
        throw new AppError('unknown_color_code', 400, { code: fromSerial.decoded.colorCode });
      const modelId = input.modelId ?? fromSerial.model?.id ?? null;
      if (!modelId) throw new AppError('model_required');
      const [model] = await tx.select().from(s.models).where(eq(s.models.id, modelId));
      if (!model) throw new AppError('model_required');
      [unit] = await tx
        .insert(s.units)
        .values({
          serial,
          categoryId: model.categoryId,
          modelId: model.id,
          colorId: input.colorId ?? fromSerial.color?.id ?? null,
          productionYear: fromSerial.decoded?.productionYear ?? null,
          productionMonth: fromSerial.decoded?.productionMonth ?? null,
          status: 'passed', // replaced below
          createdBy: actor.id,
        })
        .returning();
      await logEvent(tx, { unitId: unit.id, type: 'unit_created', userId: actor.id, data: { serial } });
    }

    if (unit.status === 'scrapped') throw new AppError('unit_scrapped', 409);

    const ticket = await openTicketFor(tx, unit.id, true);
    if (ticket && IN_REPAIR_TICKET_STATUSES.includes(ticket.status as TicketStatus))
      throw new AppError('unit_in_repair', 409, { ticket: ticket.number });

    // Separation rule: nobody tests a unit they repaired themselves.
    if (ticket) {
      const [own] = await tx
        .select({ id: s.repairActions.id })
        .from(s.repairActions)
        .where(and(eq(s.repairActions.ticketId, ticket.id), eq(s.repairActions.userId, actor.id)))
        .limit(1);
      if (own) throw new AppError('own_repair', 403);
    }

    const [{ value: previous }] = await tx.select({ value: count() }).from(s.tests).where(eq(s.tests.unitId, unit.id));
    const attemptNo = Number(previous) + 1;

    const [test] = await tx
      .insert(s.tests)
      .values({
        unitId: unit.id,
        attemptNo,
        result: input.result,
        defectCodeId: input.result === 'fail' ? input.defectCodeId! : null,
        notes: input.notes ?? '',
        testedBy: actor.id,
        stationId: input.stationId ?? null,
        ticketId: ticket?.id ?? null,
      })
      .returning();
    if (input.checks.length) {
      await tx
        .insert(s.checkResults)
        .values(input.checks.map((c) => ({ testId: test.id, itemId: c.itemId, ok: c.ok, value: c.value ?? null })));
    }

    const firstPass = attemptNo === 1 ? input.result === 'pass' : unit.firstPass;
    let resultTicket = ticket;

    if (input.result === 'pass') {
      if (ticket) {
        [resultTicket] = await tx
          .update(s.tickets)
          .set({ status: 'closed', outcome: 'repaired', closedAt: new Date(), version: sql`${s.tickets.version} + 1` })
          .where(eq(s.tickets.id, ticket.id))
          .returning();
        await logEvent(tx, { unitId: unit.id, ticketId: ticket.id, type: 'ticket_closed', from: ticket.status, to: 'closed', userId: actor.id });
      }
      await tx
        .update(s.units)
        .set({ status: 'passed', firstPass, releasedAt: new Date() })
        .where(eq(s.units.id, unit.id));
    } else if (ticket) {
      // Repaired unit failed again: back to the same repairman.
      const fails = ticket.retestFails + 1;
      [resultTicket] = await tx
        .update(s.tickets)
        .set({
          status: 'in_repair',
          retestFails: fails,
          alert: fails >= cfg.maxRetestFails,
          version: sql`${s.tickets.version} + 1`,
        })
        .where(eq(s.tickets.id, ticket.id))
        .returning();
      await logEvent(tx, {
        unitId: unit.id,
        ticketId: ticket.id,
        type: 'retest_failed',
        from: ticket.status,
        to: 'in_repair',
        userId: actor.id,
        data: { retestFails: fails },
      });
      await tx.update(s.units).set({ status: 'in_repair', firstPass, releasedAt: null }).where(eq(s.units.id, unit.id));
    } else {
      const number = await nextTicketNumber(tx);
      [resultTicket] = await tx
        .insert(s.tickets)
        .values({ number, unitId: unit.id, openedByTestId: test.id, status: 'waiting_repair' })
        .returning();
      await tx.update(s.tests).set({ ticketId: resultTicket.id }).where(eq(s.tests.id, test.id));
      await logEvent(tx, { unitId: unit.id, ticketId: resultTicket.id, type: 'ticket_opened', to: 'waiting_repair', userId: actor.id });
      await tx.update(s.units).set({ status: 'in_repair', firstPass, releasedAt: null }).where(eq(s.units.id, unit.id));
    }

    await logEvent(tx, {
      unitId: unit.id,
      ticketId: resultTicket?.id ?? null,
      type: input.result === 'pass' ? 'test_passed' : 'test_failed',
      userId: actor.id,
      data: { attemptNo, testId: test.id },
    });

    return { unitId: unit.id, serial, test, ticket: resultTicket, attemptNo };
  });
}

// ---------- Repair side ----------

async function lockTicket(tx: Tx, ticketId: number) {
  const [t] = await tx.select().from(s.tickets).where(eq(s.tickets.id, ticketId)).for('update');
  if (!t) throw new AppError('not_found', 404);
  return t;
}

function assertAssigneeOrSupervisor(ticket: { assignedTo: number | null }, actor: Actor) {
  const supervisor = actor.roles.includes('supervisor') || actor.roles.includes('admin');
  if (!supervisor && ticket.assignedTo !== actor.id) throw new AppError('not_assigned', 403);
}

async function moveTicket(tx: Tx, ticket: typeof s.tickets.$inferSelect, to: TicketStatus, actor: Actor, extra: Partial<typeof s.tickets.$inferInsert> = {}) {
  if (!canTransition(ticket.status as TicketStatus, to)) throw new AppError('invalid_transition', 409, { from: ticket.status, to });
  const [updated] = await tx
    .update(s.tickets)
    .set({ ...extra, status: to, version: sql`${s.tickets.version} + 1` })
    .where(eq(s.tickets.id, ticket.id))
    .returning();
  await logEvent(tx, { unitId: ticket.unitId, ticketId: ticket.id, type: 'status_changed', from: ticket.status, to, userId: actor.id });
  return updated;
}

export async function claimTicket(db: Db, ticketId: number, actor: Actor) {
  return db.transaction(async (tx) => {
    const t = await lockTicket(tx, ticketId);
    if (t.status !== 'waiting_repair') throw new AppError('already_claimed', 409);
    return moveTicket(tx, t, 'in_repair', actor, { assignedTo: actor.id });
  });
}

export async function assignTicket(db: Db, ticketId: number, userId: number, actor: Actor) {
  return db.transaction(async (tx) => {
    const t = await lockTicket(tx, ticketId);
    const [u] = await tx.select().from(s.users).where(eq(s.users.id, userId));
    if (!u || !u.active) throw new AppError('not_found', 404);
    if (t.status === 'waiting_repair') return moveTicket(tx, t, 'in_repair', actor, { assignedTo: userId });
    if (!['in_repair', 'waiting_parts'].includes(t.status)) throw new AppError('invalid_transition', 409);
    const [updated] = await tx
      .update(s.tickets)
      .set({ assignedTo: userId, version: sql`${s.tickets.version} + 1` })
      .where(eq(s.tickets.id, t.id))
      .returning();
    await logEvent(tx, { unitId: t.unitId, ticketId: t.id, type: 'assigned', userId: actor.id, data: { from: t.assignedTo, to: userId } });
    return updated;
  });
}

function assertWorkable(ticket: { status: string }) {
  if (!['in_repair', 'waiting_parts'].includes(ticket.status)) throw new AppError('invalid_transition', 409);
}

export async function addDiagnosis(db: Db, ticketId: number, input: { defectCodeId: number; notes: string }, actor: Actor) {
  return db.transaction(async (tx) => {
    const t = await lockTicket(tx, ticketId);
    assertWorkable(t);
    assertAssigneeOrSupervisor(t, actor);
    const [d] = await tx.insert(s.diagnoses).values({ ticketId, defectCodeId: input.defectCodeId, notes: input.notes, userId: actor.id }).returning();
    await logEvent(tx, { unitId: t.unitId, ticketId, type: 'diagnosis_added', userId: actor.id, data: { defectCodeId: input.defectCodeId } });
    return d;
  });
}

export async function addRepairAction(
  db: Db,
  ticketId: number,
  input: { componentId: number; actionTypeId: number; description: string; parts: string; durationMin?: number | null; stationId?: number | null },
  actor: Actor,
) {
  return db.transaction(async (tx) => {
    const t = await lockTicket(tx, ticketId);
    assertWorkable(t);
    assertAssigneeOrSupervisor(t, actor);
    const [a] = await tx
      .insert(s.repairActions)
      .values({
        ticketId,
        userId: actor.id,
        stationId: input.stationId ?? null,
        componentId: input.componentId,
        actionTypeId: input.actionTypeId,
        description: input.description,
        parts: input.parts,
        durationMin: input.durationMin ?? null,
      })
      .returning();
    await logEvent(tx, { unitId: t.unitId, ticketId, type: 'repair_action_added', userId: actor.id, data: { actionId: a.id } });
    return a;
  });
}

export async function setWaitingParts(db: Db, ticketId: number, waiting: boolean, actor: Actor) {
  return db.transaction(async (tx) => {
    const t = await lockTicket(tx, ticketId);
    assertAssigneeOrSupervisor(t, actor);
    return moveTicket(tx, t, waiting ? 'waiting_parts' : 'in_repair', actor);
  });
}

export async function sendToTest(db: Db, ticketId: number, actor: Actor) {
  return db.transaction(async (tx) => {
    const t = await lockTicket(tx, ticketId);
    assertAssigneeOrSupervisor(t, actor);
    const [{ value: n }] = await tx.select({ value: count() }).from(s.repairActions).where(eq(s.repairActions.ticketId, t.id));
    if (Number(n) === 0) throw new AppError('no_repair_action');
    const updated = await moveTicket(tx, t, 'waiting_retest', actor, { sentToTestAt: new Date() });
    await tx.update(s.units).set({ status: 'waiting_retest' }).where(eq(s.units.id, t.unitId));
    return updated;
  });
}

export async function scrapUnit(db: Db, unitId: number, reason: string, actor: Actor) {
  return db.transaction(async (tx) => {
    const [u] = await tx.select().from(s.units).where(eq(s.units.id, unitId)).for('update');
    if (!u) throw new AppError('not_found', 404);
    if (u.status === 'scrapped') throw new AppError('unit_scrapped', 409);
    const t = await openTicketFor(tx, unitId, true);
    if (t) {
      await tx
        .update(s.tickets)
        .set({ status: 'scrapped', outcome: 'scrapped', closedAt: new Date(), version: sql`${s.tickets.version} + 1` })
        .where(eq(s.tickets.id, t.id));
    }
    await tx.update(s.units).set({ status: 'scrapped', releasedAt: null }).where(eq(s.units.id, unitId));
    await logEvent(tx, { unitId, ticketId: t?.id ?? null, type: 'scrapped', from: u.status, to: 'scrapped', userId: actor.id, data: { reason } });
    return { ok: true };
  });
}
