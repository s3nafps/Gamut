import type { DbOrTx } from '../db/client';
import { DEFAULT_SETTINGS } from '../db/seed';
import { settings } from '../db/schema';

export type AppSettings = { fpyTarget: number; maxRetestFails: number; idleLockMinutes: number };

export async function getSettings(db: DbOrTx): Promise<AppSettings> {
  const rows = await db.select().from(settings);
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) merged[r.key] = r.value;
  return merged as AppSettings;
}
