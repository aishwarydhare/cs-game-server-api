import express, { type Express } from 'express';
import { buildContainer } from './container';
import type { Database } from './db/client';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { healthRoutes } from './routes/health.routes';
import { serversRoutes } from './routes/servers.routes';

export function createApp(db: Database): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  const container = buildContainer(db);

  app.use(healthRoutes());
  app.use('/servers', serversRoutes(container.serverController, container.idempotencyService));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
