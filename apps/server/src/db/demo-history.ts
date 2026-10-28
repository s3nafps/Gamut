import { and, eq, gte } from 'drizzle-orm';
import type { Db } from './client';
import * as s from './schema';
import * as flow from '../services/flow';

/**
 * Demo only: fills a new demo database with about a week of realistic activity
 * (tests, fails, repairs, retests, spare parts) so the screens and reports have something to show.
 * Uses the real flow, then moves the timestamps back in time.
 */
export async function generateDemoHistory(db: Db, opts: { days?: number; seed?: number } = {}) {
  const days = opts.days ?? 7;
  let x = opts.seed ?? 42;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = <T>(arr: T[], weights?: number[]) => {
    if (!weights) return arr[Math.floor(rnd() * arr.length)];
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rnd() * total;
    for (let i = 0; i < arr.length; i++) if ((r -= weights[i]) < 0) return arr[i];
    return arr[arr.length - 1];
  };

  const users = await db.select().from(s.users);
  const byEmp = (id: string) => users.find((u) => u.employeeId === id)!;
  const tester = byEmp('T001');
  const supervisor = byEmp('S001');
  const repairmen = [byEmp('R001'), byEmp('R002')];
  const actorOf = (u: typeof tester) => ({ id: u.id, roles: u.roles });
  const models = await db.select().from(s.models);
  const colors = await db.select().from(s.colors);
  const defects = await db.select().from(s.defectCodes);
  const components = await db.select().from(s.components);
  const actionTypes = await db.select().from(s.actionTypes);
  const parts = await db.select().from(s.parts);
  const stations = await db.select().from(s.stations);
  const testRoom = stations.find((st) => st.type === 'quality')?.id ?? null;
  const benches = stations.filter((st) => st.type === 'repair').map((st) => st.id);

  // Typical washing machine failures and what fixes them.
  const scenarios = [
    { defect: 'WM-LK01', comp: 'Door seal', part: '41000101', w: 9 },
    { defect: 'WM-DR01', comp: 'Drain pump', part: '41000202', w: 6 },
    { defect: 'WM-DL01', comp: 'Door lock', part: '41000303', w: 5 },
    { defect: 'WM-NV01', comp: 'Shock absorbers', part: null, w: 5 },
    { defect: 'WM-HT01', comp: 'Heater', part: '41000505', w: 3 },
    { defect: 'WM-SP01', comp: 'Drive belt', part: '41000404', w: 3 },
    { defect: 'WM-EL02', comp: 'Wiring harness', part: null, w: 3 },
    { defect: 'WM-UI01', comp: 'Display / UI board', part: null, w: 2 },
    { defect: 'WM-CS01', comp: 'Cabinet / panels', part: null, w: 4 },
  ];
  const defectId = (code: string) => defects.find((d) => d.code === code)!.id;
  const compId = (en: string) => components.find((c) => c.name.en === en)!.id;
  const partId = (no: string | null) => (no ? parts.find((p) => p.partNumber === no)?.id ?? null : null);
  const action = (en: string) => actionTypes.find((a) => a.name.en === en)!.id;

  const genStart = new Date();
  const now = Date.now();
  // Move every row of this unit created during generation to time T.
  const stamp = async (unitId: number, ticketId: number | null, t: Date) => {
    await db.update(s.events).set({ createdAt: t }).where(and(eq(s.events.unitId, unitId), gte(s.events.createdAt, genStart)));
    await db.update(s.tests).set({ testedAt: t }).where(and(eq(s.tests.unitId, unitId), gte(s.tests.testedAt, genStart)));
    await db.update(s.units).set({ createdAt: t }).where(and(eq(s.units.id, unitId), gte(s.units.createdAt, genStart)));
    await db.update(s.units).set({ releasedAt: t }).where(and(eq(s.units.id, unitId), gte(s.units.releasedAt, genStart)));
    if (ticketId) {
      await db.update(s.tickets).set({ openedAt: t }).where(and(eq(s.tickets.id, ticketId), gte(s.tickets.openedAt, genStart)));
      await db.update(s.tickets).set({ sentToTestAt: t }).where(and(eq(s.tickets.id, ticketId), gte(s.tickets.sentToTestAt, genStart)));
      await db.update(s.tickets).set({ closedAt: t }).where(and(eq(s.tickets.id, ticketId), gte(s.tickets.closedAt, genStart)));
      await db.update(s.repairActions).set({ createdAt: t }).where(and(eq(s.repairActions.ticketId, ticketId), gte(s.repairActions.createdAt, genStart)));
      await db.update(s.diagnoses).set({ createdAt: t }).where(and(eq(s.diagnoses.ticketId, ticketId), gte(s.diagnoses.createdAt, genStart)));
      await db.update(s.stockMovements).set({ createdAt: t }).where(and(eq(s.stockMovements.ticketId, ticketId), gte(s.stockMovements.createdAt, genStart)));
    }
  };

  let counter = 0;
  for (let d = days - 1; d >= 0; d--) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - d);
    const perDay = 38 + Math.floor(rnd() * 20);
    for (let i = 0; i < perDay; i++) {
      // Production from 07:00 to 16:00
      const at = new Date(day.getTime() + (7 * 60 + Math.floor((i / perDay) * 9 * 60) + Math.floor(rnd() * 8)) * 60_000);
      if (at.getTime() > now - 5 * 60_000) break;
      const model = pick(models, [3, 5, 2, 1].slice(0, models.length));
      const color = pick(colors, [6, 3, 1].slice(0, colors.length));
      counter++;
      const serial = `${model.code}${color.code}${String(at.getFullYear()).slice(2)}${String(at.getMonth() + 1).padStart(2, '0')}${String(100000 + counter).slice(1).padStart(6, '0')}`;
      const fails = rnd() < (model.code === 'WM9F' ? 0.14 : 0.08);
      if (!fails) {
        const r = await flow.recordTest(db, { serial, result: 'pass', checks: [], notes: '', stationId: testRoom }, actorOf(tester));
        await stamp(r.unitId, null, at);
        continue;
      }
      const sc = pick(scenarios, scenarios.map((x) => x.w));
      const r = await flow.recordTest(db, { serial, result: 'fail', defectCodeId: defectId(sc.defect), checks: [], notes: '', stationId: testRoom }, actorOf(tester));
      const ticketId = r.ticket!.id;
      await stamp(r.unitId, ticketId, at);

      // Repair timeline
      let t = at.getTime() + (10 + Math.floor(rnd() * 50)) * 60_000;
      if (t > now) continue; // still waiting for a repairman
      const rm = pick(repairmen);
      await flow.claimTicket(db, ticketId, actorOf(rm));
      await stamp(r.unitId, ticketId, new Date(t));
      await flow.addDiagnosis(db, ticketId, { defectCodeId: defectId(sc.defect), notes: '' }, actorOf(rm));
      await stamp(r.unitId, ticketId, new Date(t + 5 * 60_000));
      const dur = 10 + Math.floor(rnd() * 35);
      t += (dur + 5) * 60_000;
      if (t > now) continue; // repair in progress
      const pid = partId(sc.part);
      const stock = pid ? (await db.select({ q: s.parts.stockQty }).from(s.parts).where(eq(s.parts.id, pid)))[0].q : 0;
      await flow.addRepairAction(
        db,
        ticketId,
        {
          componentId: compId(sc.comp),
          actionTypeId: action(pid ? 'Replaced' : pick(['Adjusted', 'Repaired', 'Tightened', 'Re-wired / reconnected'])),
          description: '',
          parts: '',
          durationMin: dur,
          stationId: pick(benches),
          partsUsed: pid && stock > 0 ? [{ partId: pid, quantity: 1 }] : [],
        },
        actorOf(rm),
      );
      await stamp(r.unitId, ticketId, new Date(t));
      t += 2 * 60_000;
      await flow.sendToTest(db, ticketId, actorOf(rm));
      await stamp(r.unitId, ticketId, new Date(t));
      t += (5 + Math.floor(rnd() * 40)) * 60_000;
      if (t > now) continue; // waiting for retest
      const retestOk = rnd() < 0.88;
      await flow.recordTest(db, { serial, result: retestOk ? 'pass' : 'fail', defectCodeId: retestOk ? null : defectId(sc.defect), checks: [], notes: '', stationId: testRoom }, actorOf(tester));
      await stamp(r.unitId, ticketId, new Date(t));
      if (retestOk) continue;
      // Second repair, then pass
      t += (20 + Math.floor(rnd() * 30)) * 60_000;
      if (t > now) continue;
      await flow.addRepairAction(db, ticketId, { componentId: compId(sc.comp), actionTypeId: action('Adjusted'), description: '', parts: '', durationMin: 15, stationId: pick(benches) }, actorOf(rm));
      await flow.sendToTest(db, ticketId, actorOf(rm));
      await stamp(r.unitId, ticketId, new Date(t));
      t += 15 * 60_000;
      if (t > now) continue;
      if (rnd() < 0.15) {
        await flow.scrapUnit(db, r.unitId, 'Tub cracked — not repairable', actorOf(supervisor));
      } else {
        await flow.recordTest(db, { serial, result: 'pass', checks: [], notes: '', stationId: testRoom }, actorOf(tester));
      }
      await stamp(r.unitId, ticketId, new Date(t));
    }
  }
  return counter;
}
