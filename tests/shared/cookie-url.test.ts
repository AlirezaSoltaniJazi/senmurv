import { describe, expect, it } from 'vitest';
import {
  cookieWriteWarning,
  describeExpiry,
  matchesQuery,
  parseCookieUrl,
  SAME_SITE_OPTIONS,
  urlForPath,
} from '@/shared/cookie-url';

describe('parseCookieUrl', () => {
  it('accepts http and https pages', () => {
    expect(parseCookieUrl('https://example.com/app').ok).toBe(true);
    expect(parseCookieUrl('http://localhost:3000/').ok).toBe(true);
  });

  it('rejects pages with no addressable cookie store', () => {
    for (const url of ['chrome://extensions', 'about:blank', 'file:///tmp/x.html']) {
      const res = parseCookieUrl(url);
      expect(res.ok, url).toBe(false);
      if (!res.ok) expect(res.error.length).toBeGreaterThan(0);
    }
  });

  it('rejects a malformed / empty URL rather than throwing', () => {
    expect(parseCookieUrl('').ok).toBe(false);
    expect(parseCookieUrl('not a url').ok).toBe(false);
  });
});

describe('urlForPath', () => {
  const base = new URL('https://example.com/some/page?q=1#frag');

  it('defaults to the origin root', () => {
    expect(urlForPath(base)).toBe('https://example.com/');
  });

  it('targets a specific path so path-scoped cookies are reachable', () => {
    // Chrome matches a cookie's path as a PREFIX: querying "/" would never
    // return a cookie scoped to /api/admin/.
    expect(urlForPath(base, '/api/admin/')).toBe('https://example.com/api/admin/');
  });

  it('tolerates a path without a leading slash, and drops query/hash', () => {
    expect(urlForPath(base, 'api')).toBe('https://example.com/api');
    expect(urlForPath(base, '/x')).not.toContain('?');
    expect(urlForPath(base, '/x')).not.toContain('#');
  });
});

describe('cookieWriteWarning', () => {
  const https = new URL('https://example.com/');
  const http = new URL('http://example.com/');
  const base = { name: 'a', secure: false, sameSite: 'lax' as const, path: '/' };

  it('passes a plain valid cookie', () => {
    expect(cookieWriteWarning(base, https)).toBeNull();
  });

  it('requires a name', () => {
    expect(cookieWriteWarning({ ...base, name: '  ' }, https)).toContain('name');
  });

  it('enforces SameSite=None ⇒ Secure', () => {
    const w = cookieWriteWarning({ ...base, sameSite: 'no_restriction' }, https);
    expect(w).toContain('SameSite=None');
    expect(
      cookieWriteWarning({ ...base, sameSite: 'no_restriction', secure: true }, https)
    ).toBeNull();
  });

  it('rejects a Secure cookie on an http page', () => {
    expect(cookieWriteWarning({ ...base, secure: true }, http)).toContain('https');
  });

  it('enforces the __Secure- and __Host- name prefixes', () => {
    expect(cookieWriteWarning({ ...base, name: '__Secure-x' }, https)).toContain('Secure');
    expect(cookieWriteWarning({ ...base, name: '__Host-x' }, https)).toContain('Secure');
    // __Host- also demands path "/"
    expect(
      cookieWriteWarning({ ...base, name: '__Host-x', secure: true, path: '/api' }, https)
    ).toContain('path');
    expect(
      cookieWriteWarning({ ...base, name: '__Host-x', secure: true, path: '/' }, https)
    ).toBeNull();
  });
});

describe('describeExpiry', () => {
  const now = 1_700_000_000_000; // ms

  it('labels a session cookie', () => {
    expect(describeExpiry({ expirationDate: null }, now)).toBe('session');
  });

  it('labels an already-expired cookie', () => {
    expect(describeExpiry({ expirationDate: now / 1000 - 60 }, now)).toBe('expired');
  });

  it('picks the coarsest useful unit', () => {
    expect(describeExpiry({ expirationDate: now / 1000 + 2 * 86400 }, now)).toBe('2d');
    expect(describeExpiry({ expirationDate: now / 1000 + 3 * 3600 }, now)).toBe('3h');
    expect(describeExpiry({ expirationDate: now / 1000 + 45 * 60 }, now)).toBe('45m');
    // Anything still in the future reads as at least a minute, never "0m".
    expect(describeExpiry({ expirationDate: now / 1000 + 5 }, now)).toBe('1m');
  });
});

describe('matchesQuery', () => {
  const row = { name: 'session_id', value: 'AbC123' };

  it('matches an empty query', () => {
    expect(matchesQuery(row, '')).toBe(true);
    expect(matchesQuery(row, '   ')).toBe(true);
  });

  it('matches name or value, case-insensitively', () => {
    expect(matchesQuery(row, 'SESSION')).toBe(true);
    expect(matchesQuery(row, 'abc')).toBe(true);
    expect(matchesQuery(row, 'nope')).toBe(false);
  });
});

describe('SAME_SITE_OPTIONS', () => {
  it('covers every chrome.cookies SameSite value', () => {
    expect(SAME_SITE_OPTIONS.map((o) => o.value)).toEqual([
      'unspecified',
      'lax',
      'strict',
      'no_restriction',
    ]);
  });
});
