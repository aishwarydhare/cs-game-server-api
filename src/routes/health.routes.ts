import { Router } from 'express';
import { success } from '../helpers/apiResponse';

export function healthRoutes(): Router {
  const router = Router();
  router.get('/healthz', (_req, res) => {
    res.status(200).json(success({ status: 'ok' }));
  });
  return router;
}
