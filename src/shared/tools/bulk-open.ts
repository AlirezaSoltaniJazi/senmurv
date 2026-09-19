import type { Result } from '@/shared/types';

/**
 * Pure URL parsing for the Bulk Open tool. Chrome-free and DOM-free, so it
 * unit-tests cleanly and needs no in-page mode — like the JWT decoder and
 * JSON Formatter, this tool never touches the page; it only ever reads the
 * pasted text and hands back tabs.create()-ready URLs.
 */

/** One parsed line from the bulk-open textarea. */
export interface BulkOpenUrl {
  raw: string;
  url: string | null;
  error: string | null;
}

/** Prepend https:// to a bare host (e.g. "example.com") — same idiom as
 *  Accounts' address field: a scheme is required to open a tab. */
function normalizeUrl(input: string): Result<string> {
  // A real host/path never contains a literal space — reject it before
  // `new URL()` even sees it. Verified directly against real Chrome (not
  // assumed): unlike Node's URL implementation (what happy-dom/Vitest run
  // on), which throws on a space in the host, Chrome's own `new URL()` is
  // lenient and silently percent-encodes it (`new URL('https://not a url')`
  // succeeds as `https://not%20a%20url/`) — so `new URL()` alone cannot be
  // trusted to reject typo'd text pasted into this box.
  if (/\s/.test(input)) {
    return { ok: false, error: 'Not a valid URL.' };
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`;
  try {
    new URL(withScheme);
  } catch {
    return { ok: false, error: 'Not a valid URL.' };
  }
  return { ok: true, value: withScheme };
}

/**
 * Parse one URL per line: trims each line and drops blanks, then normalizes
 * and validates every remaining line independently, so one bad line doesn't
 * block the rest — the caller decides whether to open only the valid ones.
 * Duplicate lines are kept as separate entries (a QA engineer may genuinely
 * want the same URL opened twice, e.g. two independent sessions).
 */
export function parseBulkUrls(text: string): BulkOpenUrl[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((raw) => {
      const normalized = normalizeUrl(raw);
      return normalized.ok
        ? { raw, url: normalized.value, error: null }
        : { raw, url: null, error: normalized.error };
    });
}

/** Type guard narrowing a `BulkOpenUrl` to one with a real `url`. */
export function hasUrl(entry: BulkOpenUrl): entry is BulkOpenUrl & { url: string } {
  return entry.url !== null;
}
