import { createHash } from 'node:crypto';

/**
 * Deterministically serializes a value with object keys sorted, so that two
 * structurally-equal request bodies always produce the same string regardless
 * of key ordering.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`);
  return `{${entries.join(',')}}`;
}

/**
 * sha256 fingerprint of an idempotent request: method + path + stable body.
 */
export function requestFingerprint(method: string, path: string, body: unknown): string {
  const payload = `${method.toUpperCase()} ${path} ${stableStringify(body)}`;
  return createHash('sha256').update(payload).digest('hex');
}
