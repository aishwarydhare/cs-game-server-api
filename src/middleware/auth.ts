import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ForbiddenError, UnauthorizedError } from '../errors/AppError';

export type Role = 'player';

export interface AuthUser {
  id: string;
  role: Role;
}

const VALID_ROLES: ReadonlySet<string> = new Set<Role>(['player']);

/**
 * Simulated authentication. A real system would verify a signed token; here we
 * trust an `x-user-id` header (identity) and an optional `x-user-role` header
 * (defaults to `player`). Missing identity -> 401, unknown role -> 401.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const userId = req.header('x-user-id');
  if (!userId || userId.trim() === '') {
    throw new UnauthorizedError('Missing x-user-id header');
  }

  const role = (req.header('x-user-role') ?? 'player').trim();
  if (!VALID_ROLES.has(role)) {
    throw new UnauthorizedError(`Unknown role: ${role}`);
  }

  req.user = { id: userId, role: role as Role };
  next();
}

/**
 * RBAC guard factory. Returns middleware that allows the request only if the
 * authenticated user's role is in `allowed`. Role-capable by design even though
 * the system currently exposes a single `player` role.
 */
export function requireRole(...allowed: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      throw new UnauthorizedError('Not authenticated');
    }
    if (!allowed.includes(req.user.role)) {
      throw new ForbiddenError(`Role '${req.user.role}' is not permitted for this action`);
    }
    next();
  };
}
