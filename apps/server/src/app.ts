import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import {
  AppError,
  assignSchema,
  can,
  changePinSchema,
  isWeakPin,
  photoUploadSchema,
  stockChangeSchema,
  diagnosisSchema,
  loginSchema,
  recordTestSchema,
  repairActionSchema,
  scrapSchema,
  type Permission,
} from '@gamut/core';
import { and, asc, eq, lt } from 'drizzle-orm';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { ZodError, z } from 'zod';
import { hashPin, newToken, verifyPin } from './auth';
import type { Db } from './db/client';
import * as s from './db/schema';
import { LiveHub } from './live';
import { ENTITIES, createEntity, settingsSchema, testSerialPattern, updateEntity } from './routes/admin';
import * as flow from './services/flow';
import { readPhoto, savePhoto } from './services/photos';
import { buildReport } from './services/reports';
import * as q from './services/queries';
import { getSettings } from './services/settings';

const SESSION_HOURS = 14;

type User = typeof s.users.$inferSelect;
declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}

const publicUser = (u: User) => ({
  id: u.id,
  employeeId: u.employeeId,
  fullName: u.fullName,
  roles: u.roles,
  language: u.language,
  active: u.active,
});

export async function buildApp(opts: { db: Db; webDist?: string; logger?: boolean; uploadDir?: string }) {
  const { db } = opts;
  const uploadDir = resolve(opts.uploadDir ?? './data/uploads');
  const app = Fastify({ logger: opts.logger ?? false, disableRequestLogging: true, bodyLimit: 1024 * 1024 });
  const live = new LiveHub();
  app.addHook('onClose', async () => live.close());

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) return reply.status(err.status).send({ error: err.code, details: err.details });
    if (err instanceof ZodError) return reply.status(400).send({ error: 'invalid_input', details: { issues: err.issues } });
    if ((err as { validation?: unknown }).validation) return reply.status(400).send({ error: 'invalid_input' });
    app.log.error(err);
    return reply.status(500).send({ error: 'server_error' });
  });

  // ---------- auth ----------
  async function authenticate(req: FastifyRequest) {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new AppError('unauthorized', 401);
    const [row] = await db
      .select({ user: s.users, lastSeenAt: s.sessions.lastSeenAt })
      .from(s.sessions)
      .innerJoin(s.users, eq(s.users.id, s.sessions.userId))
      .where(eq(s.sessions.token, token));
    if (!row || !row.user.active || Date.now() - row.lastSeenAt.getTime() > SESSION_HOURS * 3600_000)
      throw new AppError('unauthorized', 401);
    await db.update(s.sessions).set({ lastSeenAt: new Date() }).where(eq(s.sessions.token, token));
    req.user = row.user;
  }

  const requireAuth = (permission?: Permission) => async (req: FastifyRequest) => {
    await authenticate(req);
    if (permission && !can(req.user!.roles, permission)) throw new AppError('forbidden', 403);
  };

  const actor = (req: FastifyRequest): flow.Actor => ({ id: req.user!.id, roles: req.user!.roles });
  const idParam = (req: FastifyRequest) => z.coerce.number().int().positive().parse((req.params as { id: string }).id);
  const changed = (topic: string) => live.broadcast(topic);

  // ---------- public ----------
  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/public/stations', async () =>
    db.select().from(s.stations).where(eq(s.stations.active, true)).orderBy(asc(s.stations.id)),
  );

  app.get('/api/public/dashboard', async () => q.lineDashboard(db));

  app.get('/api/live', (req, reply: FastifyReply) => {
    reply.hijack();
    live.add(reply.raw);
  });

  // After 5 wrong PINs, that employee ID is locked for 5 minutes.
  const failedLogins = new Map<string, { count: number; first: number; until: number }>();
  app.post('/api/login', async (req) => {
    const body = loginSchema.safeParse(req.body);
    if (!body.success) throw new AppError('invalid_login', 401);
    const key = body.data.employeeId.toLowerCase();
    const f = failedLogins.get(key);
    if (f && f.until > Date.now()) throw new AppError('too_many_attempts', 429);
    const [u] = await db.select().from(s.users).where(eq(s.users.employeeId, body.data.employeeId));
    if (!u || !u.active || !verifyPin(body.data.pin, u.pinHash)) {
      const now = Date.now();
      const fresh = !f || now - f.first > 300_000; // count failures within 5 minutes
      const count = fresh ? 1 : f.count + 1;
      failedLogins.set(key, { count, first: fresh ? now : f.first, until: count >= 5 ? now + 300_000 : 0 });
      throw new AppError('invalid_login', 401);
    }
    failedLogins.delete(key);
    const token = newToken();
    await db.insert(s.sessions).values({ token, userId: u.id });
    // Housekeeping: drop expired sessions.
    await db.delete(s.sessions).where(lt(s.sessions.lastSeenAt, new Date(Date.now() - SESSION_HOURS * 3600_000)));
    // weakPin: the screen asks the person to choose a better PIN (e.g. admin still on 1234).
    return { token, user: publicUser(u), weakPin: isWeakPin(body.data.pin) };
  });

  // ---------- signed in ----------
  app.post('/api/logout', { preHandler: requireAuth() }, async (req) => {
    const token = (req.headers.authorization ?? '').slice(7);
    await db.delete(s.sessions).where(eq(s.sessions.token, token));
    return { ok: true };
  });

  app.get('/api/me', { preHandler: requireAuth() }, async (req) => publicUser(req.user!));

  app.put('/api/me/pin', { preHandler: requireAuth() }, async (req) => {
    const { currentPin, newPin } = changePinSchema.parse(req.body);
    if (!verifyPin(currentPin, req.user!.pinHash)) throw new AppError('wrong_pin', 400);
    if (isWeakPin(newPin)) throw new AppError('weak_pin', 400);
    await db.update(s.users).set({ pinHash: hashPin(newPin) }).where(eq(s.users.id, req.user!.id));
    await db.insert(s.events).values({ type: 'pin_changed', userId: req.user!.id });
    return { ok: true };
  });

  app.put('/api/me/language', { preHandler: requireAuth() }, async (req) => {
    const { language } = z.object({ language: z.enum(['fr', 'ar', 'en']) }).parse(req.body);
    await db.update(s.users).set({ language }).where(eq(s.users.id, req.user!.id));
    return { ok: true };
  });

  /** All lists the screens need to show names (includes inactive rows for history). */
  app.get('/api/catalog', { preHandler: requireAuth() }, async () => {
    const [categories, models, colors, serialRules, defectCodes, components, actionTypes, checklistItems, stations, users, settings, parts] =
      await Promise.all([
        db.select().from(s.categories).orderBy(asc(s.categories.id)),
        db.select().from(s.models).orderBy(asc(s.models.code)),
        db.select().from(s.colors).orderBy(asc(s.colors.code)),
        db.select().from(s.serialRules).orderBy(asc(s.serialRules.id)),
        db.select().from(s.defectCodes).orderBy(asc(s.defectCodes.code)),
        db.select().from(s.components).orderBy(asc(s.components.id)),
        db.select().from(s.actionTypes).orderBy(asc(s.actionTypes.id)),
        db.select().from(s.checklistItems).orderBy(asc(s.checklistItems.sort), asc(s.checklistItems.id)),
        db.select().from(s.stations).orderBy(asc(s.stations.id)),
        db.select().from(s.users).orderBy(asc(s.users.fullName)),
        getSettings(db),
        db.select().from(s.parts).orderBy(asc(s.parts.partNumber)),
      ]);
    return {
      categories,
      models,
      colors,
      serialRules,
      defectCodes,
      components,
      actionTypes,
      checklistItems,
      stations,
      users: users.map(publicUser),
      settings,
      parts,
    };
  });

  // ---------- test room ----------
  app.post('/api/scan', { preHandler: requireAuth('test') }, async (req) => {
    const { serial } = z.object({ serial: z.string().max(100) }).parse(req.body);
    return flow.lookupScan(db, serial);
  });

  app.post('/api/tests', { preHandler: requireAuth('test') }, async (req) => {
    const res = await flow.recordTest(db, recordTestSchema.parse(req.body), actor(req));
    changed('tests');
    return res;
  });

  app.get('/api/quality/summary', { preHandler: requireAuth('test') }, async (req) => q.qualitySummary(db, req.user!.id));

  // ---------- repair ----------
  app.get('/api/tickets', { preHandler: requireAuth() }, async () => q.openTickets(db));
  app.get('/api/tickets/:id', { preHandler: requireAuth() }, async (req) => q.ticketDetail(db, idParam(req)));

  app.post('/api/tickets/:id/claim', { preHandler: requireAuth('repair') }, async (req) => {
    const t = await flow.claimTicket(db, idParam(req), actor(req));
    changed('tickets');
    return t;
  });

  app.post('/api/tickets/:id/assign', { preHandler: requireAuth('supervise') }, async (req) => {
    const t = await flow.assignTicket(db, idParam(req), assignSchema.parse(req.body).userId, actor(req));
    changed('tickets');
    return t;
  });

  app.post('/api/tickets/:id/diagnoses', { preHandler: requireAuth('repair') }, async (req) => {
    const d = await flow.addDiagnosis(db, idParam(req), diagnosisSchema.parse(req.body), actor(req));
    changed('tickets');
    return d;
  });

  app.post('/api/tickets/:id/actions', { preHandler: requireAuth('repair') }, async (req) => {
    const a = await flow.addRepairAction(db, idParam(req), repairActionSchema.parse(req.body), actor(req));
    changed('tickets');
    return a;
  });

  app.post('/api/tickets/:id/parts', { preHandler: requireAuth('repair') }, async (req) => {
    const { waiting } = z.object({ waiting: z.boolean() }).parse(req.body);
    const t = await flow.setWaitingParts(db, idParam(req), waiting, actor(req));
    changed('tickets');
    return t;
  });

  app.post('/api/tickets/:id/send-to-test', { preHandler: requireAuth('repair') }, async (req) => {
    const t = await flow.sendToTest(db, idParam(req), actor(req));
    changed('tickets');
    return t;
  });

  // ---------- units & people ----------
  app.get('/api/units', { preHandler: requireAuth() }, async (req) => {
    const { q: term } = z.object({ q: z.string().max(100).optional().default('') }).parse(req.query);
    return q.searchUnits(db, term);
  });

  app.get('/api/units/:serial/history', { preHandler: requireAuth() }, async (req) =>
    q.unitHistory(db, (req.params as { serial: string }).serial),
  );

  app.post('/api/units/:id/scrap', { preHandler: requireAuth('supervise') }, async (req) => {
    const res = await flow.scrapUnit(db, idParam(req), scrapSchema.parse(req.body).reason, actor(req));
    changed('units');
    return res;
  });

  app.get('/api/people/:id/activity', { preHandler: requireAuth() }, async (req) => {
    const userId = idParam(req);
    if (userId !== req.user!.id && !can(req.user!.roles, 'supervise')) throw new AppError('forbidden', 403);
    const { from, to } = z.object({ from: z.coerce.date(), to: z.coerce.date() }).parse(req.query);
    return q.personActivity(db, userId, from, to);
  });

  // ---------- spare parts ----------
  app.post('/api/parts/:id/stock', { preHandler: requireAuth('supervise') }, async (req) => {
    const part = await flow.changeStock(db, idParam(req), stockChangeSchema.parse(req.body), actor(req));
    changed('parts');
    return part;
  });

  app.get('/api/parts/:id/movements', { preHandler: requireAuth('supervise') }, async (req) =>
    db.select().from(s.stockMovements).where(eq(s.stockMovements.partId, idParam(req))).orderBy(asc(s.stockMovements.id)),
  );

  // ---------- photos ----------
  app.post('/api/units/:id/photos', { preHandler: requireAuth(), bodyLimit: 10 * 1024 * 1024 }, async (req) => {
    if (!can(req.user!.roles, 'test') && !can(req.user!.roles, 'repair')) throw new AppError('forbidden', 403);
    const row = await savePhoto(db, uploadDir, idParam(req), photoUploadSchema.parse(req.body), req.user!.id);
    changed('photos');
    return row;
  });

  app.get('/api/photos/:id', { preHandler: requireAuth() }, async (req, reply) => {
    const { row, data } = await readPhoto(db, uploadDir, idParam(req));
    return reply.header('Content-Type', row.mime).header('Cache-Control', 'private, max-age=86400').send(data);
  });

  // ---------- reports & change log ----------
  const rangeQuery = z.object({ from: z.coerce.date(), to: z.coerce.date() });
  app.get('/api/reports', { preHandler: requireAuth('supervise') }, async (req) => {
    const { from, to } = rangeQuery.parse(req.query);
    return buildReport(db, from, to);
  });

  app.get('/api/audit', { preHandler: requireAuth('supervise') }, async (req) => {
    const qy = rangeQuery
      .extend({
        type: z.string().max(40).optional(),
        userId: z.coerce.number().int().positive().optional(),
        beforeId: z.coerce.number().int().positive().optional(),
        limit: z.coerce.number().int().min(1).max(500).default(100),
      })
      .parse(req.query);
    return q.auditLog(db, qy);
  });

  // ---------- screen texts (admins can change any wording, in any language) ----------
  app.get('/api/public/translations', async () => {
    const rows = await db.select().from(s.translations);
    const out: Record<string, Record<string, string>> = { fr: {}, ar: {}, en: {} };
    for (const r of rows) (out[r.lang] ??= {})[r.key] = r.value;
    return out;
  });

  app.put('/api/admin/translations', { preHandler: requireAuth('admin') }, async (req) => {
    const { lang, key, value } = z
      .object({ lang: z.enum(['fr', 'ar', 'en']), key: z.string().min(1).max(200), value: z.string().max(1000) })
      .parse(req.body);
    if (value.trim() === '') {
      // Empty = go back to the built-in text.
      await db.delete(s.translations).where(and(eq(s.translations.lang, lang), eq(s.translations.key, key)));
    } else {
      await db
        .insert(s.translations)
        .values({ lang, key, value })
        .onConflictDoUpdate({ target: [s.translations.lang, s.translations.key], set: { value, updatedAt: new Date() } });
    }
    await db.insert(s.events).values({ type: 'translation_changed', userId: req.user!.id, data: { lang, key, value } });
    changed('translations');
    return { ok: true };
  });

  // ---------- admin ----------
  app.get('/api/admin/:entity', { preHandler: requireAuth('admin') }, async (req) => {
    const ent = ENTITIES[(req.params as { entity: string }).entity];
    if (!ent) throw new AppError('not_found', 404);
    const rows = await db.select().from(ent.table).orderBy(asc(ent.table.id));
    return rows.map((r: Record<string, unknown>) => {
      const { pinHash: _drop, ...rest } = r;
      return rest;
    });
  });

  app.post('/api/admin/:entity', { preHandler: requireAuth('admin') }, async (req) => {
    const row = await createEntity(db, (req.params as { entity: string }).entity, req.body, req.user!.id);
    changed('catalog');
    const { pinHash: _drop, ...rest } = row as Record<string, unknown>;
    return rest;
  });

  app.put('/api/admin/:entity/:id', { preHandler: requireAuth('admin') }, async (req) => {
    const row = await updateEntity(db, (req.params as { entity: string }).entity, idParam(req), req.body, req.user!.id);
    changed('catalog');
    const { pinHash: _drop, ...rest } = row as Record<string, unknown>;
    return rest;
  });

  app.put('/api/admin/settings', { preHandler: requireAuth('admin') }, async (req) => {
    const values = settingsSchema.parse(req.body);
    await db.transaction(async (tx) => {
      for (const [key, value] of Object.entries(values)) {
        await tx.insert(s.settings).values({ key, value }).onConflictDoUpdate({ target: s.settings.key, set: { value } });
      }
      await tx.insert(s.events).values({ type: 'settings_changed', userId: req.user!.id, data: values });
    });
    changed('catalog');
    return getSettings(db);
  });

  app.post('/api/admin/serial-test', { preHandler: requireAuth('admin') }, async (req) => {
    const { pattern, serial } = z.object({ pattern: z.string().max(500), serial: z.string().max(100) }).parse(req.body);
    return testSerialPattern(pattern, serial);
  });

  // ---------- desktop / browser UI ----------
  const webDist = opts.webDist ? resolve(opts.webDist) : undefined;
  if (webDist && existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: 'not_found' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}

