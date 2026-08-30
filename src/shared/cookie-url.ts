import type { CookieRow, CookieSameSite, Result } from '@/shared/types';

/**
 * Pure URL/attribute logic for the Cookies tab. Chrome-free so it unit-tests
 * cleanly; the `browser.cookies` calls themselves live in the service worker.
 */

/** Schemes browser.cookies can address. Anything else has no cookie jar to show. */
const SUPPORTED_SCHEMES = ['http:', 'https:'] as const;

/**
 * Parse a tab URL for cookie work, rejecting pages with no addressable cookie
 * store (chrome://, about:, extension pages, file://) with a message the panel
 * can show verbatim.
 */
export function parseCookieUrl(rawUrl: string): Result<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, error: 'This tab has no address Senmurv can read cookies for.' };
  }
  if (!(SUPPORTED_SCHEMES as readonly string[]).includes(url.protocol)) {
    return {
      ok: false,
      error: `Cookies are only available on http(s) pages — this tab is ${url.protocol}`,
    };
  }
  return { ok: true, value: url };
}

/**
 * The URL to hand `browser.cookies` for a cookie scoped to `path`.
 *
 * Chrome matches a cookie's path as a PREFIX of the request path, so querying
 * `https://site/` never returns a cookie scoped to `/api/admin/`. Rewriting the
 * pathname is what makes such cookies reachable — the same trap phantom-mock hit
 * and regression-tested.
 */
export function urlForPath(base: URL, path?: string): string {
  if (!path) return base.origin + '/';
  const url = new URL(base.toString());
  url.pathname = path.startsWith('/') ? path : `/${path}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

/** SameSite values in the order the editor offers them, with human labels. */
export const SAME_SITE_OPTIONS: { value: CookieSameSite; label: string }[] = [
  { value: 'unspecified', label: 'Unspecified' },
  { value: 'lax', label: 'Lax' },
  { value: 'strict', label: 'Strict' },
  { value: 'no_restriction', label: 'None (cross-site)' },
];

/**
 * Why a cookie write would be rejected by Chrome, or null when it looks valid.
 * These rules are enforced by the browser silently — surfacing them up front
 * turns a mystifying no-op into an explanation.
 */
export function cookieWriteWarning(
  edit: { name: string; secure: boolean; sameSite: CookieSameSite; path: string },
  url: URL
): string | null {
  if (edit.name.trim() === '') return 'Enter a cookie name.';
  if (edit.sameSite === 'no_restriction' && !edit.secure) {
    return 'SameSite=None requires Secure — tick Secure, or choose another SameSite.';
  }
  if (edit.secure && url.protocol !== 'https:') {
    return 'A Secure cookie can only be set on an https page.';
  }
  // Cookie name prefixes are enforced by the browser, not advisory.
  if (edit.name.startsWith('__Secure-') && !edit.secure) {
    return 'A “__Secure-” cookie must have Secure set.';
  }
  if (edit.name.startsWith('__Host-')) {
    if (!edit.secure) return 'A “__Host-” cookie must have Secure set.';
    if (edit.path !== '/') return 'A “__Host-” cookie must use path “/”.';
  }
  return null;
}

/** Compact, human expiry for the table: "session", "expired", "2d", "3h", "45m". */
export function describeExpiry(row: Pick<CookieRow, 'expirationDate'>, nowMs: number): string {
  if (row.expirationDate === null) return 'session';
  const secondsLeft = row.expirationDate - nowMs / 1000;
  if (secondsLeft <= 0) return 'expired';
  const days = Math.floor(secondsLeft / 86400);
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(secondsLeft / 3600);
  if (hours >= 1) return `${hours}h`;
  const mins = Math.max(1, Math.floor(secondsLeft / 60));
  return `${mins}m`;
}

/** Case-insensitive match of a cookie against a search box query. */
export function matchesQuery(row: Pick<CookieRow, 'name' | 'value'>, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return row.name.toLowerCase().includes(q) || row.value.toLowerCase().includes(q);
}
