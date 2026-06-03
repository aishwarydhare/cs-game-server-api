import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ConflictError, UnauthorizedError, ValidationError } from '../errors/AppError';
import { requestFingerprint } from '../helpers/fingerprint';
import type { IdempotencyService } from '../services/idempotency.service';

export const IDEMPOTENCY_HEADER = 'idempotency-key';
export const REPLAYED_HEADER = 'IDEMPOTENCY_REPLAYED';

/**
 * Persistent idempotency-key middleware. Must run after `authenticate` (keys
 * are scoped per user). On the first call it claims the key, lets the handler
 * run, and persists the response. Replays return the stored response verbatim
 * with `IDEMPOTENCY_REPLAYED: true`; a key reused with a different body -> 409.
 */
export function idempotency(service: IdempotencyService): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.header(IDEMPOTENCY_HEADER);
    if (!key || key.trim() === '') {
      throw new ValidationError(`Missing ${IDEMPOTENCY_HEADER} header`);
    }
    if (!req.user) {
      throw new UnauthorizedError('Not authenticated');
    }

    const userId = req.user.id;
    const fingerprint = requestFingerprint(req.method, req.path, req.body);

    service
      .begin(userId, key, fingerprint)
      .then((outcome) => {
        switch (outcome.type) {
          // todo: use enums
          case 'mismatch':
            throw new ConflictError(
              'IDEMPOTENCY_KEY_MISMATCH',
              'Idempotency-Key was already used with different request parameters',
            );
          case 'in_progress':
            throw new ConflictError(
              'IDEMPOTENCY_REQUEST_IN_PROGRESS',
              'A request with this Idempotency-Key is still being processed',
            );
          case 'replay':
            res.setHeader(REPLAYED_HEADER, 'true');
            if (outcome.contentType) {
              res.setHeader('Content-Type', outcome.contentType);
            }
            res.status(outcome.status).send(outcome.body ?? '');
            return;
          case 'new':
            captureAndPersist(req, res, service, userId, key);
            next();
            return;
        }
      })
      .catch(next);
  };
}

/**
 * Wraps res.json to capture the response body and, once the response is fully
 * sent, persists it (status < 500) or releases the claim (status >= 500, so the
 * client may safely retry).
 */
function captureAndPersist(
  _req: Request,
  res: Response,
  service: IdempotencyService,
  userId: string,
  key: string,
): void {
  let capturedBody: string | null = null;
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    capturedBody = JSON.stringify(body);
    return originalJson(body);
  };

  res.on('finish', () => {
    const status = res.statusCode;
    const contentType = res.getHeader('Content-Type');
    const persist =
      status < 500
        ? service.complete(
            userId,
            key,
            status,
            capturedBody,
            typeof contentType === 'string' ? contentType : null,
          )
        : service.release(userId, key);
    persist.catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to persist idempotency result', err);
    });
  });
}
