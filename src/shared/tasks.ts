import type { TimeEntry, TimeInterval } from '@/shared/types';

// ---------------------------------------------------------------------------
// Task state (derived — nothing about running/paused/done is stored directly)
// ---------------------------------------------------------------------------

/** The last (most recent) interval, or undefined for an interval-less entry. */
function lastInterval(entry: TimeEntry): TimeInterval | undefined {
  return entry.intervals[entry.intervals.length - 1];
}

/** Running: not stopped, and the latest interval is still open. */
export function isRunning(entry: TimeEntry): boolean {
  if (entry.stoppedAt !== null) return false;
  const last = lastInterval(entry);
  return last !== undefined && last.end === null;
}

/** Paused: not stopped, but no interval is currently open. */
export function isPaused(entry: TimeEntry): boolean {
  return entry.stoppedAt === null && !isRunning(entry);
}

/** Active: not stopped (running or paused) — shown in the "current tasks" list. */
export function isActive(entry: TimeEntry): boolean {
  return entry.stoppedAt === null;
}

/** Total logged milliseconds; open intervals accrue up to `now`. Clamped ≥ 0. */
export function entryDurationMs(entry: TimeEntry, now: number): number {
  let total = 0;
  for (const interval of entry.intervals) {
    const end = interval.end ?? now;
    const span = end - interval.start;
    if (span > 0) total += span;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Duration formatting
// ---------------------------------------------------------------------------

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Live stopwatch format, e.g. "0:00:05", "1:02:05", "10:00:00". */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${pad2(minutes)}:${pad2(seconds)}`;
}

/** Compact total format for day headers / calendar cells, e.g. "1h 23m", "5m". */
export function formatDurationShort(ms: number): string {
  const totalMinutes = Math.floor(Math.max(0, ms) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

// ---------------------------------------------------------------------------
// Local-time day keys & labels (never UTC — evening entries must not roll over)
// ---------------------------------------------------------------------------

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Local calendar day of a timestamp as "YYYY-MM-DD". */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** The day a task is filed under: the start of its first interval. */
export function entryDayKey(entry: TimeEntry): string {
  return dayKey(entry.intervals[0]?.start ?? entry.createdAt);
}

/** "Today" / "Yesterday" / "Mon 20 Jul 2026" for a "YYYY-MM-DD" key. */
export function dayLabel(key: string, now: number): string {
  const today = new Date(now);
  if (key === dayKey(now)) return 'Today';
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (key === dayKey(yesterday.getTime())) return 'Yesterday';
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y!, m! - 1, d!);
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

// ---------------------------------------------------------------------------
// Grouping & totals
// ---------------------------------------------------------------------------

/** One day's worth of entries with its summed total. */
export interface DayGroup {
  key: string;
  entries: TimeEntry[];
  totalMs: number;
}

/** Group entries by day (newest day first; newest entry first within a day). */
export function groupEntriesByDay(entries: TimeEntry[], now: number): DayGroup[] {
  const byDay = new Map<string, TimeEntry[]>();
  for (const entry of entries) {
    const key = entryDayKey(entry);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(entry);
    else byDay.set(key, [entry]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([key, dayEntries]) => {
      const sorted = [...dayEntries].sort(
        (a, b) => (b.intervals[0]?.start ?? b.createdAt) - (a.intervals[0]?.start ?? a.createdAt)
      );
      const totalMs = sorted.reduce((sum, e) => sum + entryDurationMs(e, now), 0);
      return { key, entries: sorted, totalMs };
    });
}

/** Per-day total milliseconds, keyed by "YYYY-MM-DD" (for the calendar). */
export function totalsByDay(entries: TimeEntry[], now: number): Map<string, number> {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    const key = entryDayKey(entry);
    totals.set(key, (totals.get(key) ?? 0) + entryDurationMs(entry, now));
  }
  return totals;
}

// ---------------------------------------------------------------------------
// Month grid (Monday-first, fixed 6×7 for stable panel height)
// ---------------------------------------------------------------------------

/** One calendar cell; `inMonth` is false for leading/trailing padding days. */
export interface MonthCell {
  date: Date;
  key: string;
  inMonth: boolean;
}

/** A month laid out as 6 weeks of 7 days. `month` is 0-based (JS convention). */
export interface MonthGrid {
  year: number;
  month: number;
  weeks: MonthCell[][];
}

const MONTHS_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Human month header, e.g. "July 2026". `month` is 0-based. */
export function monthLabel(year: number, month: number): string {
  return `${MONTHS_FULL[month]} ${year}`;
}

/** Build a Monday-first 6×7 grid for the given year and 0-based month. */
export function buildMonthGrid(year: number, month: number): MonthGrid {
  const firstOfMonth = new Date(year, month, 1);
  const leading = (firstOfMonth.getDay() + 6) % 7; // days before the 1st, Monday-first
  const weeks: MonthCell[][] = [];
  for (let week = 0; week < 6; week += 1) {
    const cells: MonthCell[] = [];
    for (let dow = 0; dow < 7; dow += 1) {
      const offset = week * 7 + dow - leading;
      const date = new Date(year, month, 1 + offset);
      cells.push({ date, key: dayKey(date.getTime()), inMonth: date.getMonth() === month });
    }
    weeks.push(cells);
  }
  return { year, month, weeks };
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

/** Distinct non-empty tags across entries, alphabetically sorted. */
export function distinctTags(entries: TimeEntry[]): string[] {
  const tags = new Set<string>();
  for (const entry of entries) {
    const tag = entry.tag.trim();
    if (tag) tags.add(tag);
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

/** Distinct non-empty tags used on a given day (for calendar cell dots). */
export function dayTags(entries: TimeEntry[], key: string): string[] {
  return distinctTags(entries.filter((e) => entryDayKey(e) === key));
}

/** Number of stable tag colors defined in styles.css (.tag-c0 … .tag-c7). */
export const TAG_COLOR_COUNT = 8;

/**
 * Map a tag to a stable CSS class so colors stay consistent across views
 * without inline styles. Empty tag → the neutral `tag-none` class.
 */
export function tagColorClass(tag: string): string {
  if (tag.trim() === '') return 'tag-none';
  let hash = 0;
  for (let i = 0; i < tag.length; i += 1) {
    hash = (hash * 31 + tag.charCodeAt(i)) | 0;
  }
  return `tag-c${Math.abs(hash) % TAG_COLOR_COUNT}`;
}

// ---------------------------------------------------------------------------
// datetime-local <-> epoch ms (local time), for the edit form
// ---------------------------------------------------------------------------

/** Epoch ms → "YYYY-MM-DDTHH:mm" in local time for an <input type="datetime-local">. */
export function toLocalInputValue(ts: number): string {
  const d = new Date(ts);
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  );
}

/** "YYYY-MM-DDTHH:mm" (local) → epoch ms. Returns NaN for a malformed value. */
export function fromLocalInputValue(value: string): number {
  const [datePart, timePart] = value.split('T');
  if (!datePart || !timePart) return NaN;
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi] = timePart.split(':').map(Number);
  if ([y, mo, d, h, mi].some((n) => n === undefined || Number.isNaN(n))) return NaN;
  return new Date(y!, mo! - 1, d!, h!, mi!).getTime();
}
