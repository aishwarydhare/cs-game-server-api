import { createApp } from './app';
import { env } from './config/env';
import { closeDb, getDb } from './db/client';
import { runMigrations } from './db/migrate';

async function main(): Promise<void> {
  await runMigrations(env.DATABASE_URL);

  const db = getDb(env.DATABASE_URL);
  const app = createApp(db);

  const server = app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`matchmaking API listening on :${env.PORT}`);
  });

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`Received ${signal}, shutting down`);
    server.close(async () => {
      await closeDb();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error', err);
  process.exit(1);
});
