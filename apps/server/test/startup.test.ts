import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openDb } from '../src/db/client';
import { seedIfEmpty } from '../src/db/seed';

it('starts on a new PC where the data folder does not exist yet', async () => {
  const base = mkdtempSync(join(tmpdir(), 'gamut-start-'));
  const dataDir = join(base, 'data', 'pglite'); // two missing levels, like a fresh clone
  const handle = await openDb({ dataDir });
  expect(await seedIfEmpty(handle.db, { demo: false })).toBe(true);
  await handle.close();
  // Second start reuses the same data.
  const again = await openDb({ dataDir });
  expect(await seedIfEmpty(again.db, { demo: false })).toBe(false);
  await again.close();
  rmSync(base, { recursive: true, force: true });
});
