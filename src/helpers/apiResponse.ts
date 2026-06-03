export interface SuccessEnvelope<T> {
  ok: true;
  data: T;
  message?: string;
}

export interface ErrorEnvelope {
  ok: false;
  data: unknown;
  errorCode: string;
  message: string;
}

export function success<T>(data: T, message?: string): SuccessEnvelope<T> {
  return message === undefined ? { ok: true, data } : { ok: true, data, message };
}

export function failure(errorCode: string, message: string, data: unknown = null): ErrorEnvelope {
  return { ok: false, data, errorCode, message };
}
