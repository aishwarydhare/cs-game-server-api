import { ServerController } from './controllers/server.controller';
import type { Database } from './db/client';
import { IdempotencyRepo } from './repos/idempotency.repo';
import { LobbyRepo } from './repos/lobby.repo';
import { MembershipRepo } from './repos/membership.repo';
import { ServerRepo } from './repos/server.repo';
import { IdempotencyService } from './services/idempotency.service';
import { ServerService } from './services/server.service';

export interface Container {
  serverController: ServerController;
  idempotencyService: IdempotencyService;
}

export function buildContainer(db: Database): Container {
  const serverRepo = new ServerRepo(db);
  const lobbyRepo = new LobbyRepo(db);
  const membershipRepo = new MembershipRepo(db);
  const idempotencyRepo = new IdempotencyRepo(db);

  const serverService = new ServerService(serverRepo, lobbyRepo, membershipRepo);
  const idempotencyService = new IdempotencyService(idempotencyRepo);

  return {
    serverController: new ServerController(serverService),
    idempotencyService,
  };
}
