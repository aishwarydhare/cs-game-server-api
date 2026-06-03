import {
  type CreateServerResponse,
  type JoinServerResponse,
  type ServerDetailResponse,
  toLobbyDTO,
  toMembershipDTO,
  toServerDTO,
} from '../dtos/server.dto';
import { ConflictError, NotFoundError } from '../errors/AppError';
import type { AuthUser } from '../middleware/auth';
import type { LobbyRepo } from '../repos/lobby.repo';
import type { MembershipRepo } from '../repos/membership.repo';
import type { ServerRepo } from '../repos/server.repo';

const GAME_TYPE_BOMB_DEFUSAL = 'bomb_defusal';

export class ServerService {
  constructor(
    private readonly serverRepo: ServerRepo,
    private readonly lobbyRepo: LobbyRepo,
    private readonly membershipRepo: MembershipRepo,
  ) {}

  async getServer(serverId: string): Promise<ServerDetailResponse> {
    const server = await this.serverRepo.findById(serverId);
    if (!server) {
      throw new NotFoundError('Server not found');
    }
    const [lobby, memberCount] = await Promise.all([
      this.lobbyRepo.findByServerId(serverId),
      this.membershipRepo.countByServer(serverId),
    ]);
    return {
      server: toServerDTO(server),
      lobby: lobby ? toLobbyDTO(lobby) : null,
      memberCount,
    };
  }

  async createServer(
    user: AuthUser,
    input: { name: string; requiredPlayers: number },
  ): Promise<CreateServerResponse> {
    const { server, lobby } = await this.serverRepo.createWithLobby({
      name: input.name,
      requiredPlayers: input.requiredPlayers,
      gameType: GAME_TYPE_BOMB_DEFUSAL,
      createdBy: user.id,
    });

    return { server: toServerDTO(server), lobby: toLobbyDTO(lobby) };
  }

  async listOpenServers() {
    const rows = await this.serverRepo.listOpen();
    return rows.map(toServerDTO);
  }

  async joinServer(user: AuthUser, serverId: string): Promise<JoinServerResponse> {
    const result = await this.serverRepo.joinServer(serverId, user.id);

    switch (result.status) {
      case 'not_found':
        throw new NotFoundError('Server not found');
      case 'already_joined':
        throw new ConflictError('ALREADY_JOINED', 'User has already joined this server');
      case 'server_full':
        throw new ConflictError('SERVER_FULL', 'Server is already full');
      case 'joined': {
        const lobby = await this.lobbyRepo.findByServerId(serverId);
        return {
          server: toServerDTO(result.server),
          membership: toMembershipDTO(result.membership),
          lobby: lobby ? toLobbyDTO(lobby) : null,
        };
      }
    }
  }
}
