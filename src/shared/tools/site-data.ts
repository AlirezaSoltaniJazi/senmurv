import type { ClearTypeId, Result } from '@/shared/types';

/**
 * The Site-data safety kernel. Every invariant that stops an unrecoverable
 * mistake lives here, with zero `chrome.*`, so it tests cleanly.
 *
 * SCOPE, DELIBERATELY: this clears the CURRENT ORIGIN only, from the page
 * itself, and asks for no new permission. It cannot touch the HTTP disk cache —
 * no extension API reads or clears that per-origin — so the honest substitute
 * is a cache-bypassing reload. Nothing here can wipe another site.
 */

/** Everything clearable from the page, in the order the UI lists it. */
export const CLEAR_TYPES: readonly ClearTypeId[] = [
  'cacheStorage',
  'serviceWorkers',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'cookies',
];

export const CLEAR_TYPE_LABELS: Record<ClearTypeId, string> = {
  cacheStorage: 'Cache Storage',
  serviceWorkers: 'Service workers',
  localStorage: 'Local storage',
  sessionStorage: 'Session storage',
  indexedDB: 'IndexedDB',
  cookies: 'Cookies',
};

/** Re-fetch the app's assets without losing your session. */
export const PRESET_BUST_CACHE: readonly ClearTypeId[] = ['cacheStorage', 'serviceWorkers'];

/** Everything — the first-run / onboarding flow. Logs you out. */
export const PRESET_FRESH_VISITOR: readonly ClearTypeId[] = CLEAR_TYPES;

/** Types that end the user's session or lose entered data — these arm the confirm. */
const SESSION_DESTROYING: readonly ClearTypeId[] = [
  'cookies',
  'localStorage',
  'indexedDB',
  'sessionStorage',
];

/** Does this selection risk logging the user out or losing local data? */
export function isSessionDestroying(types: readonly ClearTypeId[]): boolean {
  return types.some((t) => SESSION_DESTROYING.includes(t));
}

/** What actually gets cleared, after validation. */
export interface ClearPlan {
  readonly origin: string;
  readonly types: readonly ClearTypeId[];
}

const CLEAR_TYPE_SET = new Set<string>(CLEAR_TYPES);

/**
 * Validate a clear request. Rejects an empty selection and anything not in
 * CLEAR_TYPES, so an unknown type can never reach the injected function.
 */
export function buildClearPlan(origin: string, types: readonly ClearTypeId[]): Result<ClearPlan> {
  const normalized = normalizeOrigin(origin);
  if (!normalized.ok) return normalized;
  if (types.length === 0) return { ok: false, error: 'Pick at least one kind of data to clear.' };

  const unknown = types.filter((t) => !CLEAR_TYPE_SET.has(t));
  if (unknown.length > 0) {
    return { ok: false, error: `Cannot clear: ${unknown.join(', ')}.` };
  }
  // Preserve CLEAR_TYPES order and drop duplicates, so the plan is canonical.
  return {
    ok: true,
    value: { origin: normalized.value, types: CLEAR_TYPES.filter((t) => types.includes(t)) },
  };
}

/**
 * Allowlist by PROTOCOL, never by testing `.origin === 'null'` — a blob: or
 * sandboxed document's `.origin` differs between Chrome and happy-dom, so an
 * origin test passes locally and behaves differently in the browser.
 */
export function normalizeOrigin(input: string): Result<string> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, error: 'That is not a valid page URL.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      ok: false,
      error: `Site data can only be cleared on http/https pages (got ${url.protocol}).`,
    };
  }
  return { ok: true, value: url.origin };
}

/**
 * The sentence the user reads before destroying something. Unit-tested verbatim
 * because it is the last line of defence — the two surprises below belong here,
 * not in a footnote nobody opens.
 */
export function describePlan(plan: ClearPlan): string {
  const names = plan.types.map((t) => CLEAR_TYPE_LABELS[t]).join(', ');
  const parts = [`Clear ${names} for ${plan.origin}.`];

  if (plan.types.includes('cookies')) {
    parts.push(
      'Cookies marked HttpOnly cannot be removed from the page and will be left behind — they are invisible to any script.'
    );
  }
  if (isSessionDestroying(plan.types)) {
    parts.push('This will most likely sign you out of this site.');
  }
  parts.push(
    'The browser HTTP cache is not touched: Chrome exposes no way for an extension to clear it for one origin. Use Clear + hard reload to bypass it instead.'
  );
  return parts.join(' ');
}

/** Human byte size. Uses KB/MB/GB (1024-based), matching what DevTools shows. */
export function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return 'unknown';
  if (bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
