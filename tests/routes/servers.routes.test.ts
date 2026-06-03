import express, { type Express } from 'express';
import request from 'supertest';
import { ServerController } from '../../src/controllers/server.controller';
import { ConflictError } from '../../src/errors/AppError';
import { errorHandler, notFoundHandler } from '../../src/middleware/errorHandler';
import { serversRoutes } from '../../src/routes/servers.routes';
import type { IdempotencyService } from '../../src/services/idempotency.service';
import type { ServerService } from '../../src/services/server.service';

// Idempotency is exercised in its own suite; here it always lets the request through.
const passthroughIdempotency = {
  begin: jest.fn().mockResolvedValue({ type: 'new' }),
  complete: jest.fn().mockResolvedValue(undefined),
  release: jest.fn().mockResolvedValue(undefined),
} as unknown as IdempotencyService;

function buildApp(service: ServerService): Express {
  const app = express();
  app.use(express.json());
  const controller = new ServerController(service);
  app.use('/servers', serversRoutes(controller, passthroughIdempotency));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const auth = { 'x-user-id': 'user-1', 'idempotency-key': 'k-1' };

describe('servers routes — exception propagation', () => {
  it('propagates an unexpected service error from GET /servers as 500', async () => {
    const service = {
      listOpenServers: jest.fn().mockRejectedValue(new Error('db exploded')),
    } as unknown as ServerService;

    const res = await request(buildApp(service)).get('/servers').set('x-user-id', 'user-1');

    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
    expect(res.body.errorCode).toBe('INTERNAL_SERVER_ERROR');
  });

  it('propagates an unexpected service error from POST /servers as 500', async () => {
    const service = {
      createServer: jest.fn().mockRejectedValue(new Error('boom')),
    } as unknown as ServerService;

    const res = await request(buildApp(service))
      .post('/servers')
      .set(auth)
      .send({ name: 'Dust2', requiredPlayers: 4 });

    expect(res.status).toBe(500);
    expect(service.createServer).toHaveBeenCalled();
  });

  it('maps a thrown AppError (SERVER_FULL) from join to its status code', async () => {
    const service = {
      joinServer: jest.fn().mockRejectedValue(new ConflictError('SERVER_FULL', 'full')),
    } as unknown as ServerService;

    const res = await request(buildApp(service))
      .post('/servers/11111111-1111-1111-1111-111111111111/join')
      .set(auth)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('SERVER_FULL');
  });

  it('rejects unauthenticated requests with 401 before reaching the service', async () => {
    const service = { listOpenServers: jest.fn() } as unknown as ServerService;
    const res = await request(buildApp(service)).get('/servers');
    expect(res.status).toBe(401);
    expect(service.listOpenServers).not.toHaveBeenCalled();
  });

  it('rejects an invalid requiredPlayers (odd) at the validation layer with 400', async () => {
    const service = { createServer: jest.fn() } as unknown as ServerService;
    const res = await request(buildApp(service))
      .post('/servers')
      .set(auth)
      .send({ name: 'Dust2', requiredPlayers: 5 });

    expect(res.status).toBe(400);
    expect(service.createServer).not.toHaveBeenCalled();
  });
});
