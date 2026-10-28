import { loadConfig } from '../config';
import { openDb } from './client';
import { seedIfEmpty } from './seed';

const config = loadConfig();
const handle = await openDb({ url: config.databaseUrl, dataDir: config.dataDir });
const seeded = await seedIfEmpty(handle.db, { demo: config.demo });
console.log(seeded ? 'Database seeded.' : 'Database already has data — nothing done.');
await handle.close();
