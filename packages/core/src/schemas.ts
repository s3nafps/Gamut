import { z } from 'zod';

export const localizedNameSchema = z.object({
  en: z.string().trim().min(1).max(200),
  fr: z.string().trim().max(200).optional().default(''),
  ar: z.string().trim().max(200).optional().default(''),
});

export const loginSchema = z.object({
  employeeId: z.string().trim().min(1).max(50),
  pin: z.string().regex(/^\d{4,8}$/),
});

export const checkResultSchema = z.object({
  itemId: z.number().int().positive(),
  ok: z.boolean(),
  value: z.number().finite().nullable().optional(),
});

export const recordTestSchema = z.object({
  serial: z.string().min(1).max(100),
  stationId: z.number().int().positive().nullable().optional(),
  // Needed only for a new unit when the serial cannot be decoded.
  categoryId: z.number().int().positive().nullable().optional(),
  modelId: z.number().int().positive().nullable().optional(),
  colorId: z.number().int().positive().nullable().optional(),
  result: z.enum(['pass', 'fail']),
  defectCodeId: z.number().int().positive().nullable().optional(),
  checks: z.array(checkResultSchema).max(200).default([]),
  notes: z.string().max(2000).optional().default(''),
});
export type RecordTestInput = z.infer<typeof recordTestSchema>;

export const diagnosisSchema = z.object({
  defectCodeId: z.number().int().positive(),
  notes: z.string().max(2000).optional().default(''),
});

export const repairActionSchema = z.object({
  componentId: z.number().int().positive(),
  actionTypeId: z.number().int().positive(),
  description: z.string().max(2000).optional().default(''),
  durationMin: z.number().int().min(0).max(24 * 60).nullable().optional(),
  parts: z.string().max(500).optional().default(''),
  stationId: z.number().int().positive().nullable().optional(),
});

export const scrapSchema = z.object({ reason: z.string().trim().min(3).max(500) });
export const assignSchema = z.object({ userId: z.number().int().positive() });
