import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { openDb, type DbHandle } from '../src/db/client';
import { seedIfEmpty } from '../src/db/seed';

let handle: DbHandle;
let app: FastifyInstance;
const tokens: Record<string, string> = {};
let catalog: any;

async function call(who: string | null, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) {
  const res = await app.inject({
    method,
    url,
    payload: payload as any,
    headers: who ? { authorization: `Bearer ${tokens[who]}` } : {},
  });
  return { status: res.statusCode, body: res.json() };
}

async function login(employeeId: string, pin: string) {
  const r = await call(null, 'POST', '/api/login', { employeeId, pin });
  expect(r.status).toBe(200);
  tokens[employeeId] = r.body.token;
  return r.body.user;
}

const defect = (code: string) => catalog.defectCodes.find((d: any) => d.code === code).id;

beforeAll(async () => {
  // TEST_DATABASE_URL = run against a real (empty) PostgreSQL; otherwise in-memory embedded PostgreSQL.
  handle = await openDb({ url: process.env.TEST_DATABASE_URL });
  await seedIfEmpty(handle.db, { demo: true });
  app = await buildApp({ db: handle.db, uploadDir: mkdtempSync(join(tmpdir(), 'gamut-photos-')) });
  await login('admin', '1234');
  await login('T001', '1357');
  await login('R001', '2468');
  await login('R002', '3579');
  await login('S001', '4680');
  catalog = (await call('admin', 'GET', '/api/catalog')).body;
});

afterAll(async () => {
  await app.close();
  await handle.close();
});

describe('login', () => {
  it('rejects a wrong PIN and unauthenticated calls', async () => {
    expect((await call(null, 'POST', '/api/login', { employeeId: 'T001', pin: '9998' })).status).toBe(401);
    expect((await call(null, 'GET', '/api/catalog')).status).toBe(401);
  });
  it('keeps roles apart', async () => {
    expect((await call('R001', 'POST', '/api/tests', { serial: 'X1234', result: 'pass' })).status).toBe(403);
    expect((await call('T001', 'GET', '/api/admin/users')).status).toBe(403);
  });
});

describe('test room → repair → retest', () => {
  it('reads model and color from the serial and passes a good unit', async () => {
    const scan = await call('T001', 'POST', '/api/scan', { serial: ' wm8fw2610000001 ' });
    expect(scan.status).toBe(200);
    expect(scan.body.mode).toBe('first_test');
    expect(scan.body.serial).toBe('WM8FW2610000001');
    const wm8f = catalog.models.find((m: any) => m.code === 'WM8F');
    const white = catalog.colors.find((c: any) => c.code === 'W');
    expect(scan.body.suggestedModelId).toBe(wm8f.id);
    expect(scan.body.suggestedColorId).toBe(white.id);

    const r = await call('T001', 'POST', '/api/tests', { serial: 'WM8FW2610000001', result: 'pass' });
    expect(r.status).toBe(200);
    expect(r.body.ticket).toBeNull();
    const h = await call('S001', 'GET', '/api/units/WM8FW2610000001/history');
    expect(h.body.unit.status).toBe('passed');
    expect(h.body.unit.firstPass).toBe(true);
    expect(h.body.unit.productionYear).toBe(2026);
  });

  it('requires a model when the serial cannot be decoded', async () => {
    const scan = await call('T001', 'POST', '/api/scan', { serial: 'ABC-999' });
    expect(scan.body.suggestedModelId).toBeNull();
    const r = await call('T001', 'POST', '/api/tests', { serial: 'ABC-999', result: 'pass' });
    expect(r.body.error).toBe('model_required');
    const model = catalog.models[0];
    const ok = await call('T001', 'POST', '/api/tests', { serial: 'ABC-999', result: 'pass', modelId: model.id });
    expect(ok.status).toBe(200);
  });

  it('flags an unknown model code', async () => {
    const r = await call('T001', 'POST', '/api/tests', { serial: 'WM5ZW2610000001', result: 'pass' });
    expect(r.body.error).toBe('unknown_model_code');
    expect(r.body.details.code).toBe('WM5Z');
  });

  it('runs the full repair loop', async () => {
    const serial = 'WM9FS2610000002';
    // Fail without a defect → refused
    expect((await call('T001', 'POST', '/api/tests', { serial, result: 'fail' })).body.error).toBe('defect_required');

    const checklist = catalog.checklistItems;
    const fail = await call('T001', 'POST', '/api/tests', {
      serial,
      result: 'fail',
      defectCodeId: defect('WM-LK01'),
      checks: [
        { itemId: checklist[0].id, ok: true },
        { itemId: checklist[8].id, ok: false },
      ],
      notes: 'water under the door',
    });
    expect(fail.status).toBe(200);
    const ticket = fail.body.ticket;
    expect(ticket.status).toBe('waiting_repair');
    expect(ticket.number).toMatch(/^R-\d{4}-\d{6}$/);

    // Unit is in repair → test room cannot test it
    expect((await call('T001', 'POST', '/api/tests', { serial, result: 'pass' })).body.error).toBe('unit_in_repair');
    expect((await call('T001', 'POST', '/api/scan', { serial })).body.mode).toBe('in_repair');

    // Appears in the open tickets list
    const open = await call('R001', 'GET', '/api/tickets');
    expect(open.body.find((t: any) => t.id === ticket.id).lastDefectCodeId).toBe(defect('WM-LK01'));

    // Cannot log work before claiming; cannot send without an action
    const comp = catalog.components[1].id;
    const act = catalog.actionTypes[0].id;
    expect((await call('R001', 'POST', `/api/tickets/${ticket.id}/actions`, { componentId: comp, actionTypeId: act })).status).toBe(409);
    expect((await call('R001', 'POST', `/api/tickets/${ticket.id}/claim`)).body.status).toBe('in_repair');
    expect((await call('R002', 'POST', `/api/tickets/${ticket.id}/claim`)).body.error).toBe('already_claimed');
    expect((await call('R001', 'POST', `/api/tickets/${ticket.id}/send-to-test`)).body.error).toBe('no_repair_action');
    // Another repairman cannot log on my ticket
    expect((await call('R002', 'POST', `/api/tickets/${ticket.id}/actions`, { componentId: comp, actionTypeId: act })).body.error).toBe('not_assigned');

    expect((await call('R001', 'POST', `/api/tickets/${ticket.id}/diagnoses`, { defectCodeId: defect('WM-LK01'), notes: 'seal torn' })).status).toBe(200);
    expect((await call('R001', 'POST', `/api/tickets/${ticket.id}/parts`, { waiting: true })).body.status).toBe('waiting_parts');
    expect((await call('R001', 'POST', `/api/tickets/${ticket.id}/parts`, { waiting: false })).body.status).toBe('in_repair');
    const a = await call('R001', 'POST', `/api/tickets/${ticket.id}/actions`, {
      componentId: comp,
      actionTypeId: act,
      description: 'new door seal',
      parts: 'SEAL-123 x1',
      durationMin: 25,
    });
    expect(a.status).toBe(200);
    expect((await call('R001', 'POST', `/api/tickets/${ticket.id}/send-to-test`)).body.status).toBe('waiting_retest');

    // Retest queue + scan mode
    const summary = await call('T001', 'GET', '/api/quality/summary');
    expect(summary.body.retestQueue.map((r: any) => r.ticketId)).toContain(ticket.id);
    expect((await call('T001', 'POST', '/api/scan', { serial })).body.mode).toBe('retest');

    // Retest fails → back to the same repairman
    const refail = await call('T001', 'POST', '/api/tests', { serial, result: 'fail', defectCodeId: defect('WM-LK01') });
    expect(refail.body.ticket.status).toBe('in_repair');
    expect(refail.body.ticket.assignedTo).toBe(catalog.users.find((u: any) => u.employeeId === 'R001').id);
    expect(refail.body.ticket.retestFails).toBe(1);
    expect(refail.body.attemptNo).toBe(2);

    await call('R001', 'POST', `/api/tickets/${ticket.id}/actions`, { componentId: comp, actionTypeId: act, description: 'tightened clamp' });
    await call('R001', 'POST', `/api/tickets/${ticket.id}/send-to-test`);

    const pass = await call('T001', 'POST', '/api/tests', { serial, result: 'pass' });
    expect(pass.body.ticket.status).toBe('closed');
    expect(pass.body.ticket.outcome).toBe('repaired');

    const h = await call('S001', 'GET', `/api/units/${serial}/history`);
    expect(h.body.unit.status).toBe('passed');
    expect(h.body.unit.firstPass).toBe(false);
    expect(h.body.tests).toHaveLength(3);
    expect(h.body.tests[0].checks).toHaveLength(2);
    expect(h.body.actions).toHaveLength(2);
    expect(h.body.diagnoses).toHaveLength(1);
    expect(h.body.events.map((e: any) => e.type)).toContain('retest_failed');

    // Repairman's activity page
    const r001 = catalog.users.find((u: any) => u.employeeId === 'R001').id;
    const act2 = await call('S001', 'GET', `/api/people/${r001}/activity?from=2000-01-01&to=2100-01-01`);
    expect(act2.body.actions).toHaveLength(2);
    expect(act2.body.actions[0].serial).toBe(serial);
  });

  it('never lets someone pass a unit they repaired', async () => {
    const serial = 'WM7TB2610000003';
    const fail = await call('S001', 'POST', '/api/tests', { serial, result: 'fail', defectCodeId: defect('WM-DR01') });
    const id = fail.body.ticket.id;
    await call('S001', 'POST', `/api/tickets/${id}/claim`);
    await call('S001', 'POST', `/api/tickets/${id}/actions`, { componentId: catalog.components[10].id, actionTypeId: catalog.actionTypes[3].id });
    await call('S001', 'POST', `/api/tickets/${id}/send-to-test`);
    expect((await call('S001', 'POST', '/api/tests', { serial, result: 'pass' })).body.error).toBe('own_repair');
    expect((await call('T001', 'POST', '/api/tests', { serial, result: 'pass' })).status).toBe(200);
  });

  it('raises an alert after too many failed retests and supports scrap', async () => {
    const serial = 'WM7TW2610000004';
    const fail = await call('T001', 'POST', '/api/tests', { serial, result: 'fail', defectCodeId: defect('WM-NV01') });
    const id = fail.body.ticket.id;
    await call('R002', 'POST', `/api/tickets/${id}/claim`);
    let last: any;
    for (let i = 0; i < 3; i++) {
      await call('R002', 'POST', `/api/tickets/${id}/actions`, { componentId: catalog.components[5].id, actionTypeId: catalog.actionTypes[0].id });
      await call('R002', 'POST', `/api/tickets/${id}/send-to-test`);
      last = await call('T001', 'POST', '/api/tests', { serial, result: 'fail', defectCodeId: defect('WM-NV01') });
    }
    expect(last.body.ticket.retestFails).toBe(3);
    expect(last.body.ticket.alert).toBe(true);

    expect((await call('R002', 'POST', `/api/units/${last.body.unitId}/scrap`, { reason: 'drum cracked' })).status).toBe(403);
    expect((await call('S001', 'POST', `/api/units/${last.body.unitId}/scrap`, { reason: 'drum cracked' })).status).toBe(200);
    expect((await call('T001', 'POST', '/api/tests', { serial, result: 'pass' })).body.error).toBe('unit_scrapped');
  });

  it('feeds the production line dashboard', async () => {
    const d = await call(null, 'GET', '/api/public/dashboard');
    expect(d.status).toBe(200);
    // first tests today: 0001 pass, ABC-999 pass, 0002 fail, 0003 fail, 0004 fail
    expect(d.body.tested).toBe(5);
    expect(d.body.passedFirst).toBe(2);
    expect(d.body.failedFirst).toBe(3);
    expect(d.body.fpy).toBe(40);
    expect(d.body.repairedPassed).toBe(2);
    expect(d.body.scrapped).toBe(1);
    expect(d.body.topDefects[0].code).toBe('WM-NV01');
    expect(d.body.topDefects[0].count).toBe(4);
    expect(d.body.inRepair).toBe(0);
    expect(d.body.hourly.reduce((n: number, h: any) => n + h.tested, 0)).toBe(5);
  });
});

describe('admin', () => {
  it('adds models manually and rejects duplicates and bad serial rules', async () => {
    const wm = catalog.categories[0].id;
    const r = await call('admin', 'POST', '/api/admin/models', { categoryId: wm, code: 'wm5z', name: '5 kg compact' });
    expect(r.status).toBe(200);
    expect(r.body.code).toBe('WM5Z');
    expect((await call('admin', 'POST', '/api/admin/models', { categoryId: wm, code: 'WM5Z', name: 'dup' })).body.error).toBe('duplicate');
    // Now the earlier unknown code works
    expect((await call('T001', 'POST', '/api/tests', { serial: 'WM5ZW2610000001', result: 'pass' })).status).toBe(200);

    const bad = await call('admin', 'POST', '/api/admin/serialRules', { categoryId: wm, label: 'x', pattern: '^(.{4})' });
    expect(bad.body.error).toBe('invalid_input');
    const t = await call('admin', 'POST', '/api/admin/serial-test', { pattern: '^(?<model>.{4})(?<color>.)', serial: 'abcdq' });
    expect(t.body.decoded.modelCode).toBe('ABCD');
    expect(t.body.decoded.colorCode).toBe('Q');
  });

  it('creates users with a PIN and never returns the PIN hash', async () => {
    const r = await call('admin', 'POST', '/api/admin/users', { employeeId: 'T002', fullName: 'Tester 2', roles: ['tester'], pin: '5678' });
    expect(r.status).toBe(200);
    expect(r.body.pinHash).toBeUndefined();
    const list = await call('admin', 'GET', '/api/admin/users');
    expect(list.body.every((u: any) => u.pinHash === undefined)).toBe(true);
    await login('T002', '5678');
  });

  it('updates settings', async () => {
    const r = await call('admin', 'PUT', '/api/admin/settings', { fpyTarget: 97, maxRetestFails: 2, idleLockMinutes: 10 });
    expect(r.body.fpyTarget).toBe(97);
    expect((await call(null, 'GET', '/api/public/dashboard')).body.target).toBe(97);
  });
});

describe('several PCs at once', () => {
  it('handles the same new serial scanned twice at the same moment', async () => {
    const serial = 'WM8FW2610000777';
    const [a, b] = await Promise.all([
      call('T001', 'POST', '/api/tests', { serial, result: 'pass' }),
      call('T002', 'POST', '/api/tests', { serial, result: 'pass' }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const h = await call('S001', 'GET', `/api/units/${serial}/history`);
    expect(h.body.tests.map((t: any) => t.attemptNo).sort()).toEqual([1, 2]);
  });

  it('lets only one repairman take a unit', async () => {
    const fail = await call('T001', 'POST', '/api/tests', { serial: 'WM8FW2610000778', result: 'fail', defectCodeId: defect('WM-EL01') });
    const id = fail.body.ticket.id;
    const [a, b] = await Promise.all([call('R001', 'POST', `/api/tickets/${id}/claim`), call('R002', 'POST', `/api/tickets/${id}/claim`)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });
});

describe('login protection', () => {
  it('locks an employee ID after 5 wrong PINs', async () => {
    for (let i = 0; i < 5; i++) expect((await call(null, 'POST', '/api/login', { employeeId: 'R002', pin: '0000' })).status).toBe(401);
    const r = await call(null, 'POST', '/api/login', { employeeId: 'R002', pin: '3579' });
    expect(r.status).toBe(429);
    expect(r.body.error).toBe('too_many_attempts');
  });
});

describe('spare parts', () => {
  it('takes parts out of stock when a repair uses them, and refuses when stock is short', async () => {
    const seal = catalog.parts.find((p: any) => p.partNumber === '41000101');
    const serial = 'WM8FW2610000900';
    const fail = await call('T001', 'POST', '/api/tests', { serial, result: 'fail', defectCodeId: defect('WM-LK01') });
    const id = fail.body.ticket.id;
    await call('R001', 'POST', `/api/tickets/${id}/claim`);
    const base = { componentId: catalog.components[1].id, actionTypeId: catalog.actionTypes[0].id };
    const tooMany = await call('R001', 'POST', `/api/tickets/${id}/actions`, { ...base, partsUsed: [{ partId: seal.id, quantity: 99 }] });
    expect(tooMany.body.error).toBe('not_enough_stock');
    const ok = await call('R001', 'POST', `/api/tickets/${id}/actions`, { ...base, partsUsed: [{ partId: seal.id, quantity: 1 }, { partId: seal.id, quantity: 1 }] });
    expect(ok.status).toBe(200);
    const cat = (await call('admin', 'GET', '/api/catalog')).body;
    expect(cat.parts.find((p: any) => p.id === seal.id).stockQty).toBe(seal.stockQty - 2);
    const h = await call('S001', 'GET', `/api/units/${serial}/history`);
    expect(h.body.actions[0].partsUsed).toEqual([{ partId: seal.id, quantity: 2 }]);
  });

  it('records received and counted stock, and only via those actions', async () => {
    const pump = catalog.parts.find((p: any) => p.partNumber === '41000202');
    expect((await call('R001', 'POST', `/api/parts/${pump.id}/stock`, { mode: 'received', quantity: 10 })).status).toBe(403);
    expect((await call('S001', 'POST', `/api/parts/${pump.id}/stock`, { mode: 'received', quantity: 10, note: 'delivery 42' })).body.stockQty).toBe(14);
    expect((await call('S001', 'POST', `/api/parts/${pump.id}/stock`, { mode: 'count', quantity: 11 })).body.stockQty).toBe(11);
    // Editing the part cannot change stock directly
    expect((await call('admin', 'PUT', `/api/admin/parts/${pump.id}`, { stockQty: 999, minStock: 3 })).body.stockQty).toBe(11);
    const moves = await call('S001', 'GET', `/api/parts/${pump.id}/movements`);
    expect(moves.body.map((m: any) => m.delta)).toEqual([10, -3]);
  });
});

describe('photos', () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex').toString('base64');
  it('stores a photo on a unit and serves it back', async () => {
    const h = await call('S001', 'GET', '/api/units/WM8FW2610000900/history');
    const up = await call('T001', 'POST', `/api/units/${h.body.unit.id}/photos`, { data: png, mime: 'image/png', caption: 'leak', ticketId: h.body.tickets[0].id });
    expect(up.status).toBe(200);
    const res = await app.inject({ method: 'GET', url: `/api/photos/${up.body.id}`, headers: { authorization: `Bearer ${tokens.R001}` } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.rawPayload.toString('base64')).toBe(png);
    const t = await call('R001', 'GET', `/api/tickets/${h.body.tickets[0].id}`);
    expect(t.body.photos).toHaveLength(1);
    expect((await app.inject({ method: 'GET', url: `/api/photos/${up.body.id}` })).statusCode).toBe(401);
  });
  it('rejects a photo linked to another unit', async () => {
    const h = await call('S001', 'GET', '/api/units/WM8FW2610000900/history');
    const other = await call('S001', 'GET', '/api/units/WM8FW2610000001/history');
    const r = await call('T001', 'POST', `/api/units/${other.body.unit.id}/photos`, { data: png, mime: 'image/png', ticketId: h.body.tickets[0].id });
    expect(r.body.error).toBe('invalid_input');
  });
});

describe('reports, change log, texts, PIN', () => {
  it('builds the report for a date range', async () => {
    const r = await call('S001', 'GET', '/api/reports?from=2000-01-01&to=2100-01-01');
    expect(r.status).toBe(200);
    expect(r.body.summary.tested).toBeGreaterThan(5);
    expect(r.body.summary.repaired).toBeGreaterThanOrEqual(2);
    expect(r.body.defects[0].count).toBeGreaterThan(0);
    expect(r.body.defects.at(-1).cumulativePct).toBe(100);
    expect(r.body.repairmen.find((x: any) => x.retestFails > 0)).toBeTruthy();
    expect(r.body.partsUsed[0].quantity).toBe(2);
    expect(r.body.scrapped).toHaveLength(1);
    expect(r.body.byDay).toHaveLength(1);
    expect((await call('T001', 'GET', '/api/reports?from=2000-01-01&to=2100-01-01')).status).toBe(403);
  });

  it('keeps a change log of admin edits', async () => {
    const log = await call('S001', 'GET', '/api/audit?from=2000-01-01&to=2100-01-01&type=admin_change');
    const edit = log.body.find((e: any) => e.data.entity === 'parts' && e.data.action === 'update');
    expect(edit.data.after).toEqual({ minStock: 3 });
    expect(JSON.stringify(log.body)).not.toContain('scrypt$');
  });

  it('lets admins override screen texts', async () => {
    expect((await call('admin', 'PUT', '/api/admin/translations', { lang: 'fr', key: 'quality.pass', value: 'BON' })).status).toBe(200);
    expect((await call(null, 'GET', '/api/public/translations')).body.fr['quality.pass']).toBe('BON');
    await call('admin', 'PUT', '/api/admin/translations', { lang: 'fr', key: 'quality.pass', value: '' });
    expect((await call(null, 'GET', '/api/public/translations')).body.fr['quality.pass']).toBeUndefined();
  });

  it('flags weak PINs and lets people change their own PIN', async () => {
    expect((await call(null, 'POST', '/api/login', { employeeId: 'admin', pin: '1234' })).body.weakPin).toBe(true);
    expect((await call('admin', 'PUT', '/api/me/pin', { currentPin: '9999', newPin: '8302' })).body.error).toBe('wrong_pin');
    expect((await call('admin', 'PUT', '/api/me/pin', { currentPin: '1234', newPin: '1111' })).body.error).toBe('weak_pin');
    expect((await call('admin', 'PUT', '/api/me/pin', { currentPin: '1234', newPin: '8302' })).status).toBe(200);
    const again = await call(null, 'POST', '/api/login', { employeeId: 'admin', pin: '8302' });
    expect(again.body.weakPin).toBe(false);
  });

  it('uses the per-model target on the dashboard', async () => {
    const wm8f = catalog.models.find((m: any) => m.code === 'WM8F');
    await call('admin', 'PUT', `/api/admin/models/${wm8f.id}`, { fpyTarget: 98 });
    const d = await call(null, 'GET', '/api/public/dashboard');
    expect(d.body.byModel.find((m: any) => m.code === 'WM8F').target).toBe(98);
  });
});
