import type { Request, Response } from 'express';
import type { CreateServerBody, ServerIdParams } from '../dtos/server.dto';
import { UnauthorizedError } from '../errors/AppError';
import type { ServerService } from '../services/server.service';

export class ServerController {
  constructor(private readonly service: ServerService) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const body = req.body as CreateServerBody;
    const result = await this.service.createServer(user, body);
    res.status(201).json(result);
  };

  list = async (_req: Request, res: Response): Promise<void> => {
    const servers = await this.service.listOpenServers();
    res.status(200).json({ servers });
  };

  get = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as ServerIdParams;
    const result = await this.service.getServer(id);
    res.status(200).json(result);
  };

  join = async (req: Request, res: Response): Promise<void> => {
    const user = requireUser(req);
    const { id } = req.params as unknown as ServerIdParams;
    const result = await this.service.joinServer(user, id);
    res.status(201).json(result);
  };
}

function requireUser(req: Request) {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }
  return req.user;
}
