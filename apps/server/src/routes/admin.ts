import { AppError, ROLES, STATION_TYPES, LANGUAGES, decodeSerial, localizedNameSchema, normalizeSerial, validateSerialPattern } from '@gamut/core';
import { eq } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { hashPin } from '../auth';
import type { Db } from '../db/client';
import * as s from '../db/schema';

const id = z.number().int().positive();
const code = z.string().trim().min(1).max(40).transform((v) => v.toUpperCase());
const active = z.boolean().optional().default(true);

const serialPattern = z
  .string()
  .min(1)
  .max(500)
  .superRefine((v, ctx) => {
    const err = validateSerialPattern(v);
    if (err) ctx.addIssue({ code: 'custom', message: err });
  });

type Entity = { table: PgTable & { id: any }; schema: z.ZodTypeAny; prepare?: (data: any, isCreate: boolean) => any };

export const ENTITIES: Record<string, Entity> = {
  categories: { table: s.categories, schema: z.object({ code, name: localizedNameSchema, active }) },
  models: {
    table: s.models,
    schema: z.object({
      categoryId: id,
      code,
      name: z.string().trim().min(1).max(200),
      brand: z.string().trim().max(100).optional().default(''),
      attributes: z.record(z.string().max(200)).optional().default({}),
      active,
    }),
  },
  colors: { table: s.colors, schema: z.object({ code, name: localizedNameSchema, active }) },
  serialRules: {
    table: s.serialRules,
    schema: z.object({
      categoryId: id,
      label: z.string().trim().min(1).max(200),
      pattern: serialPattern,
      example: z.string().trim().max(100).optional().default(''),
      priority: z.number().int().optional().default(0),
      active,
    }),
  },
  defectCodes: { table: s.defectCodes, schema: z.object({ categoryId: id, code, name: localizedNameSchema, active }) },
  components: { table: s.components, schema: z.object({ categoryId: id, name: localizedNameSchema, active }) },
  actionTypes: { table: s.actionTypes, schema: z.object({ name: localizedNameSchema, active }) },
  checklistItems: {
    table: s.checklistItems,
    schema: z.object({
      categoryId: id,
      name: localizedNameSchema,
      kind: z.enum(['ok', 'measure']).default('ok'),
      min: z.number().finite().nullable().optional().default(null),
      max: z.number().finite().nullable().optional().default(null),
      unit: z.string().trim().max(20).optional().default(''),
      sort: z.number().int().optional().default(0),
      active,
    }),
  },
  stations: {
    table: s.stations,
    schema: z.object({
      name: z.string().trim().min(1).max(100),
      type: z.enum(STATION_TYPES),
      language: z.enum(LANGUAGES).default('fr'),
      active,
    }),
  },
  users: {
    table: s.users,
    schema: z.object({
      employeeId: z.string().trim().min(1).max(50),
      fullName: z.string().trim().min(1).max(200),
      roles: z.array(z.enum(ROLES)).min(1),
      language: z.enum(LANGUAGES).default('fr'),
      active,
      pin: z.string().regex(/^\d{4,8}$/).optional(),
    }),
    prepare: (data, isCreate) => {
      const { pin, ...rest } = data;
      if (isCreate && !pin) throw new AppError('invalid_input', 400, { field: 'pin' });
      return pin ? { ...rest, pinHash: hashPin(pin) } : rest;
    },
  },
};

export const settingsSchema = z.object({
  fpyTarget: z.number().min(0).max(100),
  maxRetestFails: z.number().int().min(1).max(20),
  idleLockMinutes: z.number().int().min(1).max(240),
});

function mapUnique(err: unknown): never {
  const e = err as { code?: string; cause?: { code?: string } };
  if (e?.code === '23505' || e?.cause?.code === '23505') throw new AppError('duplicate', 409);
  throw err;
}

export async function createEntity(db: Db, name: string, body: unknown) {
  const ent = ENTITIES[name];
  if (!ent) throw new AppError('not_found', 404);
  const parsed = ent.schema.parse(body);
  const values = ent.prepare ? ent.prepare(parsed, true) : parsed;
  try {
    const [row] = await db.insert(ent.table).values(values).returning();
    return row;
  } catch (err) {
    mapUnique(err);
  }
}

export async function updateEntity(db: Db, name: string, rowId: number, body: unknown) {
  const ent = ENTITIES[name];
  if (!ent) throw new AppError('not_found', 404);
  const parsed = (ent.schema as z.AnyZodObject).partial().parse(body);
  const values = ent.prepare ? ent.prepare(parsed, false) : parsed;
  try {
    const [row] = await db.update(ent.table).set(values).where(eq(ent.table.id, rowId)).returning();
    if (!row) throw new AppError('not_found', 404);
    return row;
  } catch (err) {
    mapUnique(err);
  }
}

export function testSerialPattern(pattern: string, serial: string) {
  const err = validateSerialPattern(pattern);
  if (err) return { error: err, decoded: null };
  return {
    error: null,
    decoded: decodeSerial(normalizeSerial(serial), [{ id: 0, categoryId: 0, pattern, active: true, priority: 0 }]),
  };
}
