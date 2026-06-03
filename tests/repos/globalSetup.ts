import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client, Pool } from 'pg';
import * as schema from '../../src/db/schema';
import { testDatabaseUrl } from './testDb';

const MIGRATIONS_FOLDER = path.join(__dirname, '..', '..', 'src', 'db', 'migrations');

async function ensureDatabaseExists(url: string): Promise<void> {
  const parsed = new URL(url);
  const dbName = parsed.pathname.replace(/^\//, '');
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';

  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      dbName,
    ]);
    if (rowCount === 0) {
      await client.query(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await client.end();
  }
}

export default async function globalSetup(): Promise<void> {
  const url = testDatabaseUrl();
  await ensureDatabaseExists(url);

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  await pool.end();
}
