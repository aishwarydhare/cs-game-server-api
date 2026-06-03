import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { ValidationError } from '../errors/AppError';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

/**
 * Runs the provided Zod schemas against the matching parts of the request,
 * replacing each with its parsed (typed/coerced) value. Throws ValidationError
 * (-> 400) on the first failure.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (!result.success) {
        throw new ValidationError(`Invalid request ${part}`, result.error.flatten());
      }
      req[part] = result.data;
    }
    next();
  };
}
