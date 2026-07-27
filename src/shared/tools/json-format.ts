import type { Result } from '@/shared/types';

/**
 * Pure JSON helpers for the JSON Formatter tool. Chrome-free and DOM-free (only
 * `JSON`), so they unit-test cleanly. Parsing / pretty-printing / minifying a
 * string; the collapsible tree is built by the UI from {@link parseJson}'s value.
 */

/** Parse JSON, returning the value or a human-readable error (never throws). */
export function parseJson(text: string): Result<unknown> {
  if (text.trim() === '') return { ok: false, error: 'Nothing to parse — paste some JSON.' };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON.' };
  }
}

/** Pretty-print JSON with `indent`-space indentation (default 2), or an error. */
export function formatJson(text: string, indent = 2): Result<string> {
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;
  return { ok: true, value: JSON.stringify(parsed.value, null, indent) };
}

/** Collapse JSON onto a single line (no whitespace), or an error. */
export function minifyJson(text: string): Result<string> {
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;
  return { ok: true, value: JSON.stringify(parsed.value) };
}

/** The JSON value kinds the tree renderer distinguishes. */
export type JsonKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

/** Classify a parsed JSON value for the tree view. */
export function jsonKind(value: unknown): JsonKind {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'object') return 'object';
  if (t === 'number') return 'number';
  if (t === 'boolean') return 'boolean';
  return 'string';
}
