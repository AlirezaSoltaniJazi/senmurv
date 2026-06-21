/**
 * Strip a leading `javascript:` and URL-decode a bookmarklet into runnable JS.
 * Used by the "Import / decode bookmarklet" action in the Scripts tab.
 */
export function decodeBookmarklet(input: string): string {
  const trimmed = input.trim();
  const body = trimmed.toLowerCase().startsWith('javascript:')
    ? trimmed.slice('javascript:'.length)
    : trimmed;
  try {
    return decodeURIComponent(body);
  } catch {
    // Not percent-encoded (e.g. a plain bookmarklet) — return as-is.
    return body;
  }
}
