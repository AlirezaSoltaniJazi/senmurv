import type { Result } from '@/shared/types';
import { newId } from '@/utils/id';

/**
 * Pure URL query-string logic for the Query params tool. Chrome-free and
 * DOM-free (only `URL` / `URLSearchParams`), so it unit-tests cleanly; the tab
 * reads and navigation live in the panel component.
 */

/** One query-string entry. Duplicates are legal, so this is a list, not a map. */
export interface QueryParam {
  readonly name: string;
  readonly value: string;
}

/** A URL split into the parts the builder edits independently. */
export interface ParsedUrl {
  /** Origin + pathname — everything before the `?`. */
  readonly base: string;
  readonly params: QueryParam[];
  /** The `#fragment`, including its `#`, or '' when absent. */
  readonly hash: string;
}

/**
 * Split a URL into base + ordered params + hash. Duplicate names are preserved
 * in order (a query string may legally repeat a key), and values arrive already
 * percent-decoded. Returns a user-facing error rather than throwing.
 */
export function parseUrl(raw: string): Result<ParsedUrl> {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, error: 'Enter a URL first.' };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: `Not a valid URL: ${trimmed}` };
  }
  const params: QueryParam[] = [];
  url.searchParams.forEach((value, name) => {
    params.push({ name, value });
  });
  return { ok: true, value: { base: url.origin + url.pathname, params, hash: url.hash } };
}

/** The value of the first param called `name`, case-insensitively; null if absent. */
export function findParam(params: readonly QueryParam[], name: string): string | null {
  const wanted = name.trim().toLowerCase();
  if (wanted === '') return null;
  return params.find((p) => p.name.toLowerCase() === wanted)?.value ?? null;
}

/**
 * The record-id param — `id` in any casing (`id`, `ID`, `Id`). This is the
 * "Fetch ID" default: Dynamics, and most record-scoped apps, key on `id`.
 */
export function findIdParam(params: readonly QueryParam[]): QueryParam | null {
  return params.find((p) => p.name.toLowerCase() === 'id') ?? null;
}

/**
 * Reassemble a URL. Rows with a blank name are dropped (an empty row in the
 * builder is not a param), but a blank VALUE is kept — `?flag=` is meaningful.
 */
export function buildUrl(base: string, params: readonly QueryParam[], hash = ''): string {
  const search = new URLSearchParams();
  for (const p of params) {
    const name = p.name.trim();
    if (name !== '') search.append(name, p.value);
  }
  const query = search.toString();
  return `${base}${query === '' ? '' : `?${query}`}${hash}`;
}

/** Replace the value of every param named `name` (case-insensitive); immutable. */
export function setParam(params: readonly QueryParam[], name: string, value: string): QueryParam[] {
  const wanted = name.trim().toLowerCase();
  return params.map((p) => (p.name.toLowerCase() === wanted ? { ...p, value } : p));
}

/** Append a blank row for the builder; immutable. */
export function addParam(params: readonly QueryParam[], name = '', value = ''): QueryParam[] {
  return [...params, { name, value }];
}

/** Drop the row at `index`; immutable, and a no-op for an out-of-range index. */
export function removeParam(params: readonly QueryParam[], index: number): QueryParam[] {
  if (index < 0 || index >= params.length) return [...params];
  return params.filter((_, i) => i !== index);
}

/** Replace one row wholesale (the builder edits name and value independently). */
export function updateParam(
  params: readonly QueryParam[],
  index: number,
  patch: Partial<QueryParam>
): QueryParam[] {
  return params.map((p, i) => (i === index ? { ...p, ...patch } : p));
}

/**
 * A saved snapshot of the whole builder — base URL, every param row, and the
 * hash — so a full combination (e.g. "Account record": etn=account,
 * pagetype=entityrecord, appid=...) can be recalled in one click, rather than
 * saving just one param's value at a time.
 */
export interface QueryParamSet {
  readonly id: string;
  readonly name: string;
  readonly base: string;
  readonly params: QueryParam[];
  readonly hash: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** A new named set from the builder's current state. */
export function newQueryParamSet(
  name: string,
  base: string,
  params: readonly QueryParam[],
  hash: string,
  now: number
): QueryParamSet {
  return {
    id: newId('qps_'),
    name,
    base,
    params: [...params],
    hash,
    createdAt: now,
    updatedAt: now,
  };
}
