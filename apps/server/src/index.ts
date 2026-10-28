import { fileURLToPath } from 'node:url';
import { buildApp } from './app';
import { loadConfig } from './config';
import { openDb } from './db/client';
import { generateDemoHistory } from './db/demo-history';
import { seedIfEmpty } from './db/seed';

const config = loadConfig();
const handle = await openDb({ url: config.databaseUrl, dataDir: config.dataDir });
const seeded = await seedIfEmpty(handle.db, { demo: config.demo });
// A new demo database also gets a week of example activity, so every screen has something to show.
if (seeded && config.demo) await generateDemoHistory(handle.db);

const webDist = config.webDist ?? fileURLToPath(new URL('../../web/dist', import.meta.url));
const app = await buildApp({ db: handle.db, webDist, logger: true, uploadDir: config.uploadDir });

const shutdown = async () => {
  await app.close();
  await handle.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: config.port, host: config.host });
app.log.info(
  `Gamut server ready on port ${config.port} — database: ${handle.kind}${seeded ? ` (new database, demo data: ${config.demo})` : ''}`,
);
