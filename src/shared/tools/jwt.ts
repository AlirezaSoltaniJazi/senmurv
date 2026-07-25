import type { Result } from '@/shared/types';

/**
 * Pure JWT decoding for the JWT tool. Chrome-free and DOM-free (only `atob`,
 * `TextDecoder` and `JSON`), so it unit-tests cleanly. This DECODES and inspects
 * a token — it never verifies the signature (that needs the signing key and is
 * a server's job); the tool says so in the UI.
 */

/** A decoded JWT: its two JSON objects, the raw signature segment, and the token. */
export interface DecodedJwt {
  readonly header: Record<string, unknown>;
  readonly payload: Record<string, unknown>;
  /** The third segment, still base64url-encoded. Displayed, never verified. */
  readonly signature: string;
  /** The token with any `Bearer ` prefix and surrounding whitespace stripped. */
  readonly raw: string;
}

/** Time-based standing of a token, computed against an injected `nowSec`. */
export interface JwtTimeStatus {
  /** true/false from `exp`; null when the token has no `exp` claim. */
  readonly expired: boolean | null;
  /** true/false from `nbf`; null when the token has no `nbf` claim. */
  readonly notYetValid: boolean | null;
  /** Seconds until `exp` (negative once past); null without `exp`. */
  readonly expiresInSec: number | null;
  /** Seconds until `nbf` becomes valid; null without `nbf`. */
  readonly validInSec: number | null;
  /** Seconds since `iat`; null without `iat`. */
  readonly ageSec: number | null;
}

/** The registered/common claims we annotate, so the table reads for humans. */
const CLAIM_DESCRIPTIONS: Readonly<Record<string, string>> = {
  // Header (RFC 7515/7519)
  alg: 'Signing algorithm',
  typ: 'Token type',
  cty: 'Content type',
  kid: 'Key ID',
  x5t: 'X.509 certificate thumbprint',
  jku: 'JWK Set URL',
  // Registered payload claims (RFC 7519)
  iss: 'Issuer',
  sub: 'Subject',
  aud: 'Audience',
  exp: 'Expiration time',
  nbf: 'Not valid before',
  iat: 'Issued at',
  jti: 'JWT ID',
  // Common OIDC / OAuth claims
  azp: 'Authorized party',
  scope: 'Scopes',
  scp: 'Scopes',
  roles: 'Roles',
  groups: 'Groups',
  nonce: 'Nonce',
  auth_time: 'Authentication time',
  acr: 'Authentication context class',
  amr: 'Authentication methods',
  sid: 'Session ID',
  name: 'Full name',
  email: 'Email',
  email_verified: 'Email verified',
  preferred_username: 'Preferred username',
  given_name: 'Given name',
  family_name: 'Family name',
  at_hash: 'Access-token hash',
};

/** Claims whose value is a NumericDate (seconds since the Unix epoch). */
const DATE_CLAIMS = new Set(['exp', 'nbf', 'iat', 'auth_time']);

/** Human description of a claim key, or null when we have none to add. */
export function describeClaim(name: string): string | null {
  return CLAIM_DESCRIPTIONS[name] ?? null;
}

/** Is this claim a Unix-seconds timestamp we should render as a date? */
export function isDateClaim(name: string): boolean {
  return DATE_CLAIMS.has(name);
}

/** Decode one base64url segment to a UTF-8 string. */
function decodeSegment(segment: string): Result<string> {
  let b64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const remainder = b64.length % 4;
  if (remainder === 1) return { ok: false, error: 'malformed base64url' };
  if (remainder !== 0) b64 += '='.repeat(4 - remainder);
  let binary: string;
  try {
    binary = atob(b64);
  } catch {
    return { ok: false, error: 'invalid base64' };
  }
  try {
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return { ok: true, value: new TextDecoder().decode(bytes) };
  } catch {
    return { ok: true, value: binary };
  }
}

function parseJsonObject(text: string, label: string): Result<Record<string, unknown>> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: `${label} is not valid JSON.` };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, error: `${label} is not a JSON object.` };
  }
  return { ok: true, value: value as Record<string, unknown> };
}

/** Decode a JWT string into its header, payload and (unverified) signature. */
export function decodeJwt(token: string): Result<DecodedJwt> {
  const raw = token.trim().replace(/^Bearer\s+/i, '');
  if (raw === '') return { ok: false, error: 'Paste a token to decode.' };
  const parts = raw.split('.');
  if (parts.length !== 3) {
    return {
      ok: false,
      error: 'A JWT has three dot-separated parts: header.payload.signature.',
    };
  }
  const [headerSeg = '', payloadSeg = '', signature = ''] = parts;

  const headerText = decodeSegment(headerSeg);
  if (!headerText.ok) return { ok: false, error: `Header: ${headerText.error}.` };
  const payloadText = decodeSegment(payloadSeg);
  if (!payloadText.ok) return { ok: false, error: `Payload: ${payloadText.error}.` };

  const header = parseJsonObject(headerText.value, 'Header');
  if (!header.ok) return header;
  const payload = parseJsonObject(payloadText.value, 'Payload');
  if (!payload.ok) return payload;

  return { ok: true, value: { header: header.value, payload: payload.value, signature, raw } };
}

/** A payload field is a usable timestamp only when it is a finite number. */
function numericClaim(payload: Record<string, unknown>, name: string): number | null {
  const value = payload[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Compute the token's time standing against `nowSec` (Unix seconds). The caller
 * supplies the clock so this stays pure and deterministic under test.
 */
export function jwtTimeStatus(payload: Record<string, unknown>, nowSec: number): JwtTimeStatus {
  const exp = numericClaim(payload, 'exp');
  const nbf = numericClaim(payload, 'nbf');
  const iat = numericClaim(payload, 'iat');
  return {
    expired: exp === null ? null : nowSec >= exp,
    notYetValid: nbf === null ? null : nowSec < nbf,
    expiresInSec: exp === null ? null : Math.round(exp - nowSec),
    validInSec: nbf === null ? null : Math.round(nbf - nowSec),
    ageSec: iat === null ? null : Math.round(nowSec - iat),
  };
}
