import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import { failure } from '../helpers/apiResponse';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json(failure('NOT_FOUND', 'Route not found'));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) {
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json(failure(err.code, err.message, err.details ?? null));
    return;
  }

  // eslint-disable-next-line no-console
  console.error('Unhandled error', err);
  res.status(500).json(failure('INTERNAL_SERVER_ERROR', 'An unexpected error occurred'));
}
