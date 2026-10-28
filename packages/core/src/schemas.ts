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
  /** Spare parts from the catalog: stock goes down automatically. */
  partsUsed: z
    .array(z.object({ partId: z.number().int().positive(), quantity: z.number().int().min(1).max(100) }))
    .max(20)
    .optional()
    .default([]),
  stationId: z.number().int().positive().nullable().optional(),
});

export const stockChangeSchema = z.object({
  /** received: add to stock · count: set the counted quantity */
  mode: z.enum(['received', 'count']),
  quantity: z.number().int().min(0).max(1_000_000),
  note: z.string().max(500).optional().default(''),
});

export const PHOTO_MAX_BYTES = 6 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const photoUploadSchema = z.object({
  data: z.string().min(10), // base64, no data: prefix
  mime: z.enum(PHOTO_TYPES),
  caption: z.string().max(300).optional().default(''),
  ticketId: z.number().int().positive().nullable().optional(),
  testId: z.number().int().positive().nullable().optional(),
});

export const changePinSchema = z.object({
  currentPin: z.string().regex(/^\d{4,8}$/),
  newPin: z.string().regex(/^\d{4,8}$/),
});

/** PINs anyone could guess: all the same digit, or a straight run like 1234 / 4321. */
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true;
  const d = pin.split('').map(Number);
  const up = d.every((x, i) => i === 0 || x === (d[i - 1] + 1) % 10);
  const down = d.every((x, i) => i === 0 || x === (d[i - 1] + 9) % 10);
  return up || down;
}

export const scrapSchema = z.object({ reason: z.string().trim().min(3).max(500) });
export const assignSchema = z.object({ userId: z.number().int().positive() });
