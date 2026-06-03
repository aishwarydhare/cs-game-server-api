import { IdempotencyRepo } from '../../src/repos/idempotency.repo';
import { type TestDb, closeTestPool, getTestDb, truncateAll } from './testDb';

let db: TestDb;
let repo: IdempotencyRepo;

beforeAll(() => {
  db = getTestDb();
  repo = new IdempotencyRepo(db);
});

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await closeTestPool();
});

describe('IdempotencyRepo', () => {
  it('claims a key once and returns undefined on a conflicting second claim', async () => {
    const first = await repo.tryClaim('user-1', 'key-1', 'fp-1');
    expect(first).toBeDefined();
    expect(first?.state).toBe('in_progress');

    const second = await repo.tryClaim('user-1', 'key-1', 'fp-different');
    expect(second).toBeUndefined();
  });

  it('scopes keys per user (same key, different user both claim)', async () => {
    expect(await repo.tryClaim('user-1', 'key-1', 'fp')).toBeDefined();
    expect(await repo.tryClaim('user-2', 'key-1', 'fp')).toBeDefined();
  });

  it('persists and reads back a completed response verbatim', async () => {
    await repo.tryClaim('user-1', 'key-1', 'fp-1');
    const raw = '{"id":"srv-1","name":"Dust2"}';
    await repo.complete('user-1', 'key-1', 201, raw, 'application/json; charset=utf-8');

    const row = await repo.get('user-1', 'key-1');
    expect(row?.state).toBe('completed');
    expect(row?.responseStatus).toBe(201);
    expect(row?.responseBody).toBe(raw);
    expect(row?.responseContentType).toBe('application/json; charset=utf-8');
  });

  it('releases a claim so the key can be reused', async () => {
    await repo.tryClaim('user-1', 'key-1', 'fp-1');
    await repo.release('user-1', 'key-1');
    expect(await repo.get('user-1', 'key-1')).toBeUndefined();
    expect(await repo.tryClaim('user-1', 'key-1', 'fp-2')).toBeDefined();
  });
});
