export type Config = {
  port: number;
  host: string;
  databaseUrl?: string;
  dataDir?: string;
  demo: boolean;
  webDist?: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 8080),
    host: env.HOST ?? '0.0.0.0',
    databaseUrl: env.DATABASE_URL || undefined,
    // Embedded database folder, used only when DATABASE_URL is empty.
    dataDir: env.DATA_DIR ?? './data/pglite',
    demo: (env.SEED_DEMO ?? (env.DATABASE_URL ? 'false' : 'true')) === 'true',
    webDist: env.WEB_DIST,
  };
}
