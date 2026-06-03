import type { IdempotencyRow } from '../../src/db/schema';
import type { IdempotencyRepo } from '../../src/repos/idempotency.repo';
import { IdempotencyService } from '../../src/services/idempotency.service';

function row(overrides: Partial<IdempotencyRow> = {}): IdempotencyRow {
  return {
    userId: 'user-1',
    key: 'key-1',
    requestFingerprint: 'fp-1',
    responseStatus: null,
    responseBody: null,
    responseContentType: null,
    state: 'in_progress',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeService(repoOverrides: Partial<IdempotencyRepo>) {
  const repo = {
    tryClaim: jest.fn(),
    get: jest.fn(),
    complete: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    ...repoOverrides,
  } as unknown as IdempotencyRepo;
  return { service: new IdempotencyService(repo), repo };
}

describe('IdempotencyService.begin', () => {
  it('returns "new" when the claim succeeds', async () => {
    const { service } = makeService({ tryClaim: jest.fn().mockResolvedValue(row()) });
    await expect(service.begin('user-1', 'key-1', 'fp-1')).resolves.toEqual({ type: 'new' });
  });

  it('returns "mismatch" when an existing row has a different fingerprint', async () => {
    const { service } = makeService({
      tryClaim: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(row({ requestFingerprint: 'other' })),
    });
    await expect(service.begin('user-1', 'key-1', 'fp-1')).resolves.toEqual({ type: 'mismatch' });
  });

  it('returns "replay" with stored status/body for a completed match', async () => {
    const { service } = makeService({
      tryClaim: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(
        row({
          state: 'completed',
          responseStatus: 201,
          responseBody: '{"id":"x"}',
          responseContentType: 'application/json; charset=utf-8',
        }),
      ),
    });
    await expect(service.begin('user-1', 'key-1', 'fp-1')).resolves.toEqual({
      type: 'replay',
      status: 201,
      body: '{"id":"x"}',
      contentType: 'application/json; charset=utf-8',
    });
  });

  it('returns "in_progress" when a matching row is still processing', async () => {
    const { service } = makeService({
      tryClaim: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(row({ state: 'in_progress' })),
    });
    await expect(service.begin('user-1', 'key-1', 'fp-1')).resolves.toEqual({
      type: 'in_progress',
    });
  });
});
