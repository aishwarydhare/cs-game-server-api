import express, { type Express } from 'express';
import request from 'supertest';
import { errorHandler } from '../../src/middleware/errorHandler';
import { idempotency } from '../../src/middleware/idempotency';
import type { BeginOutcome, IdempotencyService } from '../../src/services/idempotency.service';

function buildApp(service: IdempotencyService, handler = defaultHandler): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'user-1', role: 'player' };
    next();
  });
  app.post('/things', idempotency(service), handler);
  app.use(errorHandler);
  return app;
}

const defaultHandler = (_req: express.Request, res: express.Response) => {
  res.status(201).json({ created: true });
};

function fakeService(
  outcome: BeginOutcome,
  overrides: Partial<IdempotencyService> = {},
): IdempotencyService {
  return {
    begin: jest.fn().mockResolvedValue(outcome),
    complete: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as IdempotencyService;
}

describe('idempotency middleware', () => {
  it('returns 400 when the Idempotency-Key header is missing', async () => {
    const service = fakeService({ type: 'new' });
    const res = await request(buildApp(service)).post('/things').send({ a: 1 });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    expect(service.begin).not.toHaveBeenCalled();
  });

  it('passes through on first use and persists the captured response', async () => {
    const service = fakeService({ type: 'new' });
    const res = await request(buildApp(service))
      .post('/things')
      .set('Idempotency-Key', 'key-1')
      .send({ a: 1 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ created: true });
    expect(res.headers.idempotency_replayed).toBeUndefined();
    expect(service.complete).toHaveBeenCalledWith(
      'user-1',
      'key-1',
      201,
      JSON.stringify({ created: true }),
      expect.stringContaining('application/json'),
    );
  });

  it('replays the stored response verbatim with IDEMPOTENCY_REPLAYED header', async () => {
    const stored = JSON.stringify({ created: true, id: 'x' });
    const service = fakeService({
      type: 'replay',
      status: 201,
      body: stored,
      contentType: 'application/json; charset=utf-8',
    });
    const res = await request(buildApp(service))
      .post('/things')
      .set('Idempotency-Key', 'key-1')
      .send({ a: 1 });

    expect(res.status).toBe(201);
    expect(res.text).toBe(stored);
    expect(res.body).toEqual({ created: true, id: 'x' });
    expect(res.headers.idempotency_replayed).toBe('true');
    expect(service.complete).not.toHaveBeenCalled();
  });

  it('returns 409 when the same key is reused with different parameters', async () => {
    const service = fakeService({ type: 'mismatch' });
    const res = await request(buildApp(service))
      .post('/things')
      .set('Idempotency-Key', 'key-1')
      .send({ a: 2 });

    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('IDEMPOTENCY_KEY_MISMATCH');
  });

  it('returns 409 while the original request is still in progress', async () => {
    const service = fakeService({ type: 'in_progress' });
    const res = await request(buildApp(service))
      .post('/things')
      .set('Idempotency-Key', 'key-1')
      .send({ a: 1 });

    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('IDEMPOTENCY_REQUEST_IN_PROGRESS');
  });

  it('releases the claim (allows retry) when the handler returns 5xx', async () => {
    const service = fakeService({ type: 'new' });
    const failing = (_req: express.Request, res: express.Response) => {
      res.status(500).json({ error: 'boom' });
    };
    await request(buildApp(service, failing))
      .post('/things')
      .set('Idempotency-Key', 'key-1')
      .send({ a: 1 });

    expect(service.release).toHaveBeenCalledWith('user-1', 'key-1');
    expect(service.complete).not.toHaveBeenCalled();
  });
});
