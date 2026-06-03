import { MembershipRepo } from '../../src/repos/membership.repo';
import { ServerRepo } from '../../src/repos/server.repo';
import { type TestDb, closeTestPool, getTestDb, truncateAll } from './testDb';

let db: TestDb;
let serverRepo: ServerRepo;
let membershipRepo: MembershipRepo;

beforeAll(() => {
  db = getTestDb();
  serverRepo = new ServerRepo(db);
  membershipRepo = new MembershipRepo(db);
});

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await closeTestPool();
});

async function makeServer(requiredPlayers: number, name = 'Dust2') {
  return serverRepo.createWithLobby({
    name,
    requiredPlayers,
    gameType: 'bomb_defusal',
    createdBy: 'owner',
  });
}

describe('ServerRepo.createWithLobby', () => {
  it('creates a server and an associated lobby', async () => {
    const { server, lobby } = await makeServer(4);
    expect(server.id).toBeTruthy();
    expect(server.currentPlayers).toBe(0);
    expect(server.status).toBe('open');
    expect(lobby.serverId).toBe(server.id);
  });
});

describe('ServerRepo.listOpen', () => {
  it('returns only servers with status open', async () => {
    const a = await makeServer(2, 'A');
    await makeServer(4, 'B');

    // Fill server A (requiredPlayers=2) so it flips to full.
    await serverRepo.joinServer(a.server.id, 'u1');
    await serverRepo.joinServer(a.server.id, 'u2');

    const open = await serverRepo.listOpen();
    const names = open.map((s) => s.name);
    expect(names).toContain('B');
    expect(names).not.toContain('A');
  });
});

describe('ServerRepo.joinServer', () => {
  it('returns not_found for an unknown server', async () => {
    const result = await serverRepo.joinServer('11111111-1111-1111-1111-111111111111', 'u1');
    expect(result.status).toBe('not_found');
  });

  it('joins a user and increments the count', async () => {
    const { server } = await makeServer(4);
    const result = await serverRepo.joinServer(server.id, 'u1');
    expect(result.status).toBe('joined');
    if (result.status === 'joined') {
      expect(result.server.currentPlayers).toBe(1);
    }
  });

  it('rejects a duplicate join with already_joined and does not double-count', async () => {
    const { server } = await makeServer(4);
    await serverRepo.joinServer(server.id, 'u1');
    const second = await serverRepo.joinServer(server.id, 'u1');
    expect(second.status).toBe('already_joined');

    const fresh = await serverRepo.findById(server.id);
    expect(fresh?.currentPlayers).toBe(1);
    expect(await membershipRepo.countByServer(server.id)).toBe(1);
  });

  it('flips status to full on the last seat and rejects further joins', async () => {
    const { server } = await makeServer(2);
    await serverRepo.joinServer(server.id, 'u1');
    const last = await serverRepo.joinServer(server.id, 'u2');
    expect(last.status).toBe('joined');

    const fresh = await serverRepo.findById(server.id);
    expect(fresh?.status).toBe('full');

    const overflow = await serverRepo.joinServer(server.id, 'u3');
    expect(overflow.status).toBe('server_full');
    expect(await membershipRepo.countByServer(server.id)).toBe(2);
  });

  it('never overfills under high concurrency (no queue)', async () => {
    const capacity = 8;
    const attempts = 40;
    const { server } = await makeServer(capacity);

    const results = await Promise.all(
      Array.from({ length: attempts }, (_, i) => serverRepo.joinServer(server.id, `user-${i}`)),
    );

    const joined = results.filter((r) => r.status === 'joined').length;
    const full = results.filter((r) => r.status === 'server_full').length;

    expect(joined).toBe(capacity);
    expect(full).toBe(attempts - capacity);

    const fresh = await serverRepo.findById(server.id);
    expect(fresh?.currentPlayers).toBe(capacity);
    expect(fresh?.status).toBe('full');
    expect(await membershipRepo.countByServer(server.id)).toBe(capacity);
  });
});
