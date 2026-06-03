import type { IdempotencyRepo } from '../repos/idempotency.repo';

export type BeginOutcome =
  | { type: 'new' }
  | { type: 'replay'; status: number; body: string | null; contentType: string | null }
  | { type: 'mismatch' }
  | { type: 'in_progress' };

export class IdempotencyService {
  constructor(private readonly repo: IdempotencyRepo) {}

  /**
   * Decides how an incoming idempotent request should be handled:
   * - `new`         : first time we've seen this (user, key); caller proceeds.
   * - `replay`      : a completed response exists with a matching fingerprint.
   * - `mismatch`    : key reused with a different request body/path -> 409.
   * - `in_progress` : the original request is still running -> 409.
   */
  async begin(userId: string, key: string, fingerprint: string): Promise<BeginOutcome> {
    const claimed = await this.repo.tryClaim(userId, key, fingerprint);
    if (claimed) {
      return { type: 'new' };
    }

    const existing = await this.repo.get(userId, key);
    if (!existing) {
      // Extremely rare race: row vanished between claim and read. Treat as new.
      // todo: when can this happen, check if tests exist for it
      return { type: 'new' };
    }

    if (existing.requestFingerprint !== fingerprint) {
      return { type: 'mismatch' };
    }

    if (existing.state === 'completed' && existing.responseStatus != null) {
      return {
        type: 'replay',
        status: existing.responseStatus,
        body: existing.responseBody,
        contentType: existing.responseContentType,
      };
    }

    return { type: 'in_progress' };
  }

  async complete(
    userId: string,
    key: string,
    status: number,
    body: string | null,
    contentType: string | null,
  ): Promise<void> {
    await this.repo.complete(userId, key, status, body, contentType);
  }

  async release(userId: string, key: string): Promise<void> {
    await this.repo.release(userId, key);
  }
}
