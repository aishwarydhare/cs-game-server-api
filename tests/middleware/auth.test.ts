import type { NextFunction, Request, Response } from 'express';
import { ForbiddenError, UnauthorizedError } from '../../src/errors/AppError';
import { authenticate, requireRole } from '../../src/middleware/auth';

function mockReq(headers: Record<string, string>): Request {
  return {
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

const res = {} as Response;

describe('authenticate', () => {
  it('attaches req.user with default player role', () => {
    const req = mockReq({ 'x-user-id': 'user-1' });
    const next = jest.fn() as NextFunction;

    authenticate(req, res, next);

    expect(req.user).toEqual({ id: 'user-1', role: 'player' });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('throws 401 when x-user-id is missing', () => {
    const req = mockReq({});
    expect(() => authenticate(req, res, jest.fn())).toThrow(UnauthorizedError);
  });

  it('throws 401 for an unknown role', () => {
    const req = mockReq({ 'x-user-id': 'user-1', 'x-user-role': 'wizard' });
    expect(() => authenticate(req, res, jest.fn())).toThrow(UnauthorizedError);
  });
});

describe('requireRole', () => {
  it('passes when the user has an allowed role', () => {
    const req = { user: { id: 'u', role: 'player' } } as Request;
    const next = jest.fn() as NextFunction;
    requireRole('player')(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('throws 403 when the role is not allowed', () => {
    const req = { user: { id: 'u', role: 'player' } } as Request;
    // @ts-expect-error exercising the guard with a role outside the union
    expect(() => requireRole('admin')(req, res, jest.fn())).toThrow(ForbiddenError);
  });

  it('throws 401 when there is no authenticated user', () => {
    const req = {} as Request;
    expect(() => requireRole('player')(req, res, jest.fn())).toThrow(UnauthorizedError);
  });
});
