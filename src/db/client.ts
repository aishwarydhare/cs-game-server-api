import { type NodePgDatabase, drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

let pool: Pool | undefined;
let db: Database | undefined;

export function createPool(connectionString: string): Pool {
  return new Pool({ connectionString });
}

export function getPool(connectionString?: string): Pool {
  if (!pool) {
    const url = connectionString ?? process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    pool = createPool(url);
  }
  return pool;
}

export function getDb(connectionString?: string): Database {
  if (!db) {
    db = drizzle(getPool(connectionString), { schema });
  }
  return db;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
    db = undefined;
  }
}

export { schema };
