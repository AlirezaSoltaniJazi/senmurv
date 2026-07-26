/**
 * CSV field escaping, shared by every report exporter.
 *
 * This is a SECURITY control, not formatting. Exported reports carry
 * page-derived text — element markup, accessible names, URLs, task titles —
 * all of which a hostile page can influence, and a cell starting with
 * `= + - @` is executed as a formula by Excel and Google Sheets.
 */

/**
 * Prepare a CSV field: neutralize spreadsheet formula injection, then quote
 * when the value holds a comma, quote, or newline (doubling any inner quotes).
 */
export function csvField(value: string | number): string {
  let s = String(value);
  // A cell starting with = + - @ (or a leading control char) is run as a formula
  // by Excel/Sheets; a leading apostrophe forces it to render as literal text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
