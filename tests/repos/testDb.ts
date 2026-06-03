import { sql } from 'drizzle-orm';
import { type NodePgDatabase, drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../../src/db/schema';

export function testDatabaseUrl(): string {
  return (
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    'postgres://postgres:postgres@localhost:5433/matchmaking_test'
  );
}

export type TestDb = NodePgDatabase<typeof schema>;

let pool: Pool | undefined;

export function getTestDb(): TestDb {
  if (!pool) {
    pool = new Pool({ connectionString: testDatabaseUrl() });
  }
  return drizzle(pool, { schema });
}

export async function closeTestPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

export async function truncateAll(db: TestDb): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE memberships, lobbies, idempotency_keys, servers RESTART IDENTITY CASCADE`,
  );
}
