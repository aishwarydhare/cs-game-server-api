import { Router } from 'express';
import type { ServerController } from '../controllers/server.controller';
import { createServerBodySchema, serverIdParamsSchema } from '../dtos/server.dto';
import { asyncHandler } from '../helpers/asyncHandler';
import { authenticate, requireRole } from '../middleware/auth';
import { idempotency } from '../middleware/idempotency';
import { validate } from '../middleware/validate';
import type { IdempotencyService } from '../services/idempotency.service';

export function serversRoutes(
  controller: ServerController,
  idempotencyService: IdempotencyService,
): Router {
  const router = Router();

  router.use(authenticate, requireRole('player'));

  router.post(
    '/',
    idempotency(idempotencyService),
    validate({ body: createServerBodySchema }),
    asyncHandler(controller.create),
  );

  router.get('/', asyncHandler(controller.list));

  router.get('/:id', validate({ params: serverIdParamsSchema }), asyncHandler(controller.get));

  router.post(
    '/:id/join',
    validate({ params: serverIdParamsSchema }),
    idempotency(idempotencyService),
    asyncHandler(controller.join),
  );

  return router;
}
