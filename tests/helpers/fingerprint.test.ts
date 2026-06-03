import { requestFingerprint, stableStringify } from '../../src/helpers/fingerprint';

describe('stableStringify', () => {
  it('produces identical output regardless of key order', () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });

  it('handles nested objects and arrays deterministically', () => {
    const a = stableStringify({ x: [{ b: 1, a: 2 }], y: null });
    const b = stableStringify({ y: null, x: [{ a: 2, b: 1 }] });
    expect(a).toBe(b);
  });
});

describe('requestFingerprint', () => {
  it('is stable for equivalent requests', () => {
    const fp1 = requestFingerprint('POST', '/servers', { name: 'a', requiredPlayers: 4 });
    const fp2 = requestFingerprint('post', '/servers', { requiredPlayers: 4, name: 'a' });
    expect(fp1).toBe(fp2);
  });

  it('differs when the body differs', () => {
    const fp1 = requestFingerprint('POST', '/servers', { name: 'a', requiredPlayers: 4 });
    const fp2 = requestFingerprint('POST', '/servers', { name: 'a', requiredPlayers: 6 });
    expect(fp1).not.toBe(fp2);
  });

  it('differs when the path differs', () => {
    const fp1 = requestFingerprint('POST', '/servers', {});
    const fp2 = requestFingerprint('POST', '/servers/x/join', {});
    expect(fp1).not.toBe(fp2);
  });
});
