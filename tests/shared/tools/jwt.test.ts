import { describe, expect, it } from 'vitest';
import { decodeJwt, describeClaim, isDateClaim, jwtTimeStatus } from '@/shared/tools/jwt';

/** base64url-encode a JSON object the way a real JWT segment is built. */
function seg(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function makeToken(header: unknown, payload: unknown, signature = 'sig'): string {
  return `${seg(header)}.${seg(payload)}.${signature}`;
}

// The canonical jwt.io example token.
const CANONICAL =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

describe('decodeJwt', () => {
  it('decodes the canonical header, payload and signature', () => {
    const res = decodeJwt(CANONICAL);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(res.value.payload).toEqual({ sub: '1234567890', name: 'John Doe', iat: 1516239022 });
    expect(res.value.signature).toBe('SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
  });

  it('strips a Bearer prefix and surrounding whitespace', () => {
    const res = decodeJwt(`  Bearer ${CANONICAL}  `);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.raw).toBe(CANONICAL);
  });

  it('decodes a UTF-8 payload (non-ASCII names)', () => {
    const token = makeToken({ alg: 'HS256', typ: 'JWT' }, { name: 'José 你好', exp: 2000000000 });
    const res = decodeJwt(token);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.payload.name).toBe('José 你好');
  });

  it('handles base64url segments that need padding', () => {
    // A one-key payload whose base64 length is not a multiple of 4.
    const token = makeToken({ alg: 'none' }, { a: 1 });
    const res = decodeJwt(token);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.payload).toEqual({ a: 1 });
  });

  it('rejects a token without three parts', () => {
    const res = decodeJwt('abc.def');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/three/);
  });

  it('rejects an empty token', () => {
    expect(decodeJwt('   ').ok).toBe(false);
  });

  it('rejects a segment that is not valid JSON', () => {
    const token = `${Buffer.from('not json').toString('base64url')}.${seg({ a: 1 })}.sig`;
    const res = decodeJwt(token);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Header/);
  });

  it('rejects a payload that decodes to a JSON array, not an object', () => {
    const token = makeToken({ alg: 'HS256' }, [1, 2, 3]);
    const res = decodeJwt(token);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not a JSON object/);
  });
});

describe('jwtTimeStatus', () => {
  it('reports an expired token', () => {
    const status = jwtTimeStatus({ exp: 1000, iat: 500 }, 2000);
    expect(status.expired).toBe(true);
    expect(status.expiresInSec).toBe(-1000);
    expect(status.ageSec).toBe(1500);
  });

  it('reports a still-valid token', () => {
    const status = jwtTimeStatus({ exp: 3000 }, 2000);
    expect(status.expired).toBe(false);
    expect(status.expiresInSec).toBe(1000);
    expect(status.notYetValid).toBe(null);
  });

  it('reports a not-yet-valid token via nbf', () => {
    const status = jwtTimeStatus({ nbf: 3000, exp: 4000 }, 2000);
    expect(status.notYetValid).toBe(true);
    expect(status.validInSec).toBe(1000);
    expect(status.expired).toBe(false);
  });

  it('returns nulls when the temporal claims are absent or non-numeric', () => {
    const status = jwtTimeStatus({ exp: 'soon' }, 2000);
    expect(status.expired).toBe(null);
    expect(status.expiresInSec).toBe(null);
    expect(status.ageSec).toBe(null);
  });

  it('treats exp exactly at now as expired (>= boundary)', () => {
    expect(jwtTimeStatus({ exp: 2000 }, 2000).expired).toBe(true);
  });
});

describe('claim metadata', () => {
  it('describes registered claims and returns null for unknown ones', () => {
    expect(describeClaim('iss')).toBe('Issuer');
    expect(describeClaim('exp')).toBe('Expiration time');
    expect(describeClaim('custom_field')).toBe(null);
  });

  it('flags the NumericDate claims', () => {
    expect(isDateClaim('exp')).toBe(true);
    expect(isDateClaim('nbf')).toBe(true);
    expect(isDateClaim('iat')).toBe(true);
    expect(isDateClaim('sub')).toBe(false);
  });
});
