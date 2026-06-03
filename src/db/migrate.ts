import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { closeDb, getDb } from './client';

const MIGRATIONS_FOLDER = path.join(__dirname, 'migrations');

export async function runMigrations(connectionString?: string): Promise<void> {
  const db = getDb(connectionString);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

if (require.main === module) {
  runMigrations()
    .then(async () => {
      // eslint-disable-next-line no-console
      console.log('Migrations applied');
      await closeDb();
      process.exit(0);
    })
    .catch(async (err) => {
      // eslint-disable-next-line no-console
      console.error('Migration failed', err);
      await closeDb();
      process.exit(1);
    });
}
