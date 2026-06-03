import type { LobbyRow, MembershipRow, ServerRow } from '../../src/db/schema';
import { NotFoundError } from '../../src/errors/AppError';
import type { LobbyRepo } from '../../src/repos/lobby.repo';
import type { MembershipRepo } from '../../src/repos/membership.repo';
import type { JoinResult, ServerRepo } from '../../src/repos/server.repo';
import { ServerService } from '../../src/services/server.service';

const user = { id: 'user-1', role: 'player' as const };

function serverRow(overrides: Partial<ServerRow> = {}): ServerRow {
  return {
    id: 'srv-1',
    name: 'Dust2',
    gameType: 'bomb_defusal',
    requiredPlayers: 4,
    currentPlayers: 0,
    status: 'open',
    createdBy: 'user-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function lobbyRow(overrides: Partial<LobbyRow> = {}): LobbyRow {
  return {
    id: 'lob-1',
    serverId: 'srv-1',
    createdBy: 'user-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function membershipRow(overrides: Partial<MembershipRow> = {}): MembershipRow {
  return {
    id: 'mem-1',
    serverId: 'srv-1',
    userId: 'user-1',
    joinedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeService(opts: {
  joinResult?: JoinResult;
  createResult?: { server: ServerRow; lobby: LobbyRow };
  listResult?: ServerRow[];
  findResult?: ServerRow;
  lobby?: LobbyRow;
  memberCount?: number;
}) {
  const serverRepo = {
    createWithLobby: jest.fn().mockResolvedValue(opts.createResult),
    listOpen: jest.fn().mockResolvedValue(opts.listResult ?? []),
    findById: jest.fn().mockResolvedValue(opts.findResult),
    joinServer: jest.fn().mockResolvedValue(opts.joinResult),
  } as unknown as ServerRepo;
  const lobbyRepo = {
    findByServerId: jest.fn().mockResolvedValue(opts.lobby),
  } as unknown as LobbyRepo;
  const membershipRepo = {
    countByServer: jest.fn().mockResolvedValue(opts.memberCount ?? 0),
  } as unknown as MembershipRepo;
  return {
    service: new ServerService(serverRepo, lobbyRepo, membershipRepo),
    serverRepo,
    lobbyRepo,
    membershipRepo,
  };
}

describe('ServerService.createServer', () => {
  // Even/positive enforcement now lives in createServerBodySchema (request layer);
  // see tests/dtos/server.dto.test.ts. The service trusts validated input.
  it('creates a bomb_defusal server with a lobby and returns DTOs', async () => {
    const { service, serverRepo } = makeService({
      createResult: { server: serverRow(), lobby: lobbyRow() },
    });

    const result = await service.createServer(user, { name: 'Dust2', requiredPlayers: 4 });

    expect(serverRepo.createWithLobby).toHaveBeenCalledWith({
      name: 'Dust2',
      requiredPlayers: 4,
      gameType: 'bomb_defusal',
      createdBy: 'user-1',
    });
    expect(result.server.id).toBe('srv-1');
    expect(result.lobby.id).toBe('lob-1');
    expect(result.server.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('ServerService.listOpenServers', () => {
  it('maps repo rows to DTOs', async () => {
    const { service } = makeService({ listResult: [serverRow(), serverRow({ id: 'srv-2' })] });
    const result = await service.listOpenServers();
    expect(result).toHaveLength(2);
    expect(result[1].id).toBe('srv-2');
  });
});

describe('ServerService.getServer', () => {
  it('throws NotFoundError for an unknown server', async () => {
    const { service } = makeService({ findResult: undefined });
    await expect(service.getServer('srv-x')).rejects.toThrow(NotFoundError);
  });

  it('returns server, lobby and member count', async () => {
    const { service } = makeService({
      findResult: serverRow({ currentPlayers: 2 }),
      lobby: lobbyRow(),
      memberCount: 2,
    });
    const result = await service.getServer('srv-1');
    expect(result.server.currentPlayers).toBe(2);
    expect(result.memberCount).toBe(2);
    expect(result.lobby?.id).toBe('lob-1');
  });
});

describe('ServerService.joinServer', () => {
  it('throws NotFoundError when the server does not exist', async () => {
    const { service } = makeService({ joinResult: { status: 'not_found' } });
    await expect(service.joinServer(user, 'srv-x')).rejects.toThrow(NotFoundError);
  });

  it('throws ALREADY_JOINED conflict when the user already joined', async () => {
    const { service } = makeService({ joinResult: { status: 'already_joined' } });
    await expect(service.joinServer(user, 'srv-1')).rejects.toMatchObject({
      code: 'ALREADY_JOINED',
      status: 409,
    });
  });

  it('throws SERVER_FULL conflict when the server is full', async () => {
    const { service } = makeService({ joinResult: { status: 'server_full' } });
    await expect(service.joinServer(user, 'srv-1')).rejects.toMatchObject({
      code: 'SERVER_FULL',
      status: 409,
    });
  });

  it('returns server + membership + lobby on a successful join', async () => {
    const { service } = makeService({
      joinResult: {
        status: 'joined',
        server: serverRow({ currentPlayers: 1 }),
        membership: membershipRow(),
      },
      lobby: lobbyRow(),
    });

    const result = await service.joinServer(user, 'srv-1');

    expect(result.server.currentPlayers).toBe(1);
    expect(result.membership.userId).toBe('user-1');
    expect(result.lobby?.id).toBe('lob-1');
  });
});
