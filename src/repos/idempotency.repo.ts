import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { type IdempotencyRow, idempotencyKeys } from '../db/schema';

export class IdempotencyRepo {
  constructor(private readonly db: Database) {}

  /**
   * Atomically claims the key for this user. Returns the inserted row on
   * success, or `undefined` if a row already exists (ON CONFLICT DO NOTHING).
   */
  async tryClaim(
    userId: string,
    key: string,
    fingerprint: string,
  ): Promise<IdempotencyRow | undefined> {
    const [row] = await this.db
      .insert(idempotencyKeys)
      .values({ userId, key, requestFingerprint: fingerprint, state: 'in_progress' })
      .onConflictDoNothing()
      .returning();
    return row;
  }

  async get(userId: string, key: string): Promise<IdempotencyRow | undefined> {
    const [row] = await this.db
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key)));
    return row;
  }

  async complete(
    userId: string,
    key: string,
    status: number,
    body: string | null,
    contentType: string | null,
  ): Promise<void> {
    await this.db
      .update(idempotencyKeys)
      .set({
        responseStatus: status,
        responseBody: body,
        responseContentType: contentType,
        state: 'completed',
      })
      .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key)));
  }

  async release(userId: string, key: string): Promise<void> {
    await this.db
      .delete(idempotencyKeys)
      .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key)));
  }
}
