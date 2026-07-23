import {
  absoluteDayLabel,
  entryDayKey,
  entryDurationMs,
  formatClock,
  formatDuration,
  formatDurationShort,
  mergedDurationMs,
  rootId,
} from '@/shared/tasks';
import type { TimeEntry } from '@/shared/types';

/** Export file formats offered for a time-tracking report. */
export type ReportFormat = 'txt' | 'csv' | 'json';

/** One task's aggregated time within a single day (re-runs of a lineage merged). */
export interface ReportTask {
  title: string;
  tag: string;
  /** Total logged ms across every run of this task that day. */
  durationMs: number;
  /** How many runs (start/re-run) the task had that day. */
  runs: number;
  /** Earliest start that day (epoch ms). */
  start: number;
  /** Latest end that day (epoch ms), or null if a run is still open. */
  end: number | null;
}

/** One day of a report: its tasks plus summed and net (overlaps-merged) totals. */
export interface ReportDay {
  date: string; // YYYY-MM-DD
  label: string; // e.g. "Mon 20 Jul 2026"
  totalMs: number; // sum of task durations (concurrent timers add up)
  netMs: number; // wall-clock: overlapping time counted once
  tasks: ReportTask[]; // ascending by start
}

/** A time-tracking report over an inclusive date range. */
export interface TrackReport {
  from: string; // YYYY-MM-DD (normalized: from <= to)
  to: string; // YYYY-MM-DD
  generatedAt: string; // ISO timestamp
  days: ReportDay[]; // ascending by date
  totalMs: number; // grand total (sum across days)
  netMs: number; // grand net (overlaps merged across the whole range)
  taskCount: number; // number of day-task rows
}

/** Order two day-keys so the smaller is `lo`. String compare works on YYYY-MM-DD. */
function normalizeRange(from: string, to: string): { lo: string; hi: string } {
  return from <= to ? { lo: from, hi: to } : { lo: to, hi: from };
}

/** Entries whose filed day falls within the inclusive [from, to] range. */
export function entriesInRange(entries: TimeEntry[], from: string, to: string): TimeEntry[] {
  const { lo, hi } = normalizeRange(from, to);
  return entries.filter((e) => {
    const key = entryDayKey(e);
    return key >= lo && key <= hi;
  });
}

/** Earliest and latest day-keys among `entries`; `fallback` for both when empty. */
export function entriesDateSpan(
  entries: TimeEntry[],
  fallback: string
): { from: string; to: string } {
  const keys = entries.map(entryDayKey).sort();
  return { from: keys[0] ?? fallback, to: keys[keys.length - 1] ?? fallback };
}

/**
 * Build a structured report for the inclusive [from, to] range. Entries are
 * grouped by day, then by task lineage within each day (re-runs merged), exactly
 * as the Track list shows them. Open intervals accrue up to `now`.
 */
export function buildTrackReport(
  entries: TimeEntry[],
  from: string,
  to: string,
  now: number,
  generatedAt: string
): TrackReport {
  const { lo, hi } = normalizeRange(from, to);
  const inRange = entriesInRange(entries, lo, hi);
  // Resolve a lineage's display title/tag from the root entry, even when the root
  // itself was started outside the range (a re-run today of last week's task).
  const byId = new Map(entries.map((e) => [e.id, e]));

  const byDay = new Map<string, Map<string, TimeEntry[]>>();
  for (const entry of inRange) {
    const date = entryDayKey(entry);
    let roots = byDay.get(date);
    if (!roots) {
      roots = new Map();
      byDay.set(date, roots);
    }
    const root = rootId(entry);
    const bucket = roots.get(root);
    if (bucket) bucket.push(entry);
    else roots.set(root, [entry]);
  }

  const days: ReportDay[] = [];
  for (const [date, roots] of [...byDay.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  )) {
    const dayEntries: TimeEntry[] = [];
    const tasks: ReportTask[] = [];
    for (const [root, runs] of roots) {
      dayEntries.push(...runs);
      const starts = runs.map((e) => e.intervals[0]?.start ?? e.createdAt);
      const ends = runs.map((e) => e.intervals[e.intervals.length - 1]?.end ?? null);
      const head = byId.get(root) ?? runs[0]!;
      tasks.push({
        title: head.title,
        tag: head.tag,
        durationMs: runs.reduce((sum, e) => sum + entryDurationMs(e, now), 0),
        runs: runs.length,
        start: Math.min(...starts),
        end: ends.some((e) => e === null)
          ? null
          : Math.max(...ends.filter((e): e is number => e !== null)),
      });
    }
    tasks.sort((a, b) => a.start - b.start);
    days.push({
      date,
      label: absoluteDayLabel(date),
      totalMs: tasks.reduce((sum, t) => sum + t.durationMs, 0),
      netMs: mergedDurationMs(dayEntries, now),
      tasks,
    });
  }

  return {
    from: lo,
    to: hi,
    generatedAt,
    days,
    totalMs: days.reduce((sum, d) => sum + d.totalMs, 0),
    netMs: mergedDurationMs(inRange, now),
    taskCount: days.reduce((sum, d) => sum + d.tasks.length, 0),
  };
}

/** A day's "3h 15m (net 3h 00m)" summary; the net suffix appears only when it differs. */
function totalSummary(totalMs: number, netMs: number): string {
  const total = formatDurationShort(totalMs);
  const net = formatDurationShort(netMs);
  // Compare the RENDERED labels (both floored to whole minutes), not raw ms, so a
  // sub-minute overlap trim doesn't print a redundant "(net …)" that reads the same.
  return net !== total && netMs < totalMs ? `${total} (net ${net})` : total;
}

/** A task's "09:00–10:30" span; an open run ends in "…". */
function taskRange(task: ReportTask): string {
  return `${formatClock(task.start)}–${task.end === null ? '…' : formatClock(task.end)}`;
}

/** Human-readable plain-text report. */
export function reportToTxt(report: TrackReport): string {
  const lines: string[] = [
    'Senmurv — Time Tracking Report',
    `Range: ${report.from === report.to ? report.from : `${report.from} to ${report.to}`}`,
    `Generated: ${report.generatedAt}`,
    `Total: ${totalSummary(report.totalMs, report.netMs)}`,
    `Tasks: ${report.taskCount}`,
    '',
  ];
  if (report.days.length === 0) {
    lines.push('No tasks in this range.');
    return `${lines.join('\n')}\n`;
  }
  for (const day of report.days) {
    lines.push(`${day.label} — ${totalSummary(day.totalMs, day.netMs)}`);
    for (const task of day.tasks) {
      const tag = task.tag ? `[${task.tag}] ` : '';
      const runs = task.runs > 1 ? `, ${task.runs} runs` : '';
      lines.push(
        `  • ${tag}${task.title} — ${formatDurationShort(task.durationMs)} (${taskRange(task)}${runs})`
      );
    }
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

const CSV_HEADER = ['Date', 'Title', 'Tag', 'Start', 'End', 'Runs', 'Duration', 'Hours'] as const;

/**
 * Prepare a CSV field: neutralize spreadsheet formula injection, then quote when
 * the value holds a comma, quote, or newline (doubling any inner quotes).
 */
function csvField(value: string | number): string {
  let s = String(value);
  // A cell starting with = + - @ (or a leading control char) is run as a formula
  // by Excel/Sheets; a leading apostrophe forces it to render as literal text.
  // Task titles/tags are the only free-text cells here.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Spreadsheet-friendly CSV (opens directly in Excel/Sheets); one row per day-task. */
export function reportToCsv(report: TrackReport): string {
  const rows: string[] = [CSV_HEADER.join(',')];
  for (const day of report.days) {
    for (const task of day.tasks) {
      rows.push(
        [
          day.date,
          task.title,
          task.tag,
          formatClock(task.start),
          task.end === null ? '' : formatClock(task.end),
          task.runs,
          formatDuration(task.durationMs),
          (task.durationMs / 3_600_000).toFixed(2),
        ]
          .map(csvField)
          .join(',')
      );
    }
  }
  return `${rows.join('\r\n')}\r\n`;
}

/** Structured JSON report, enriched with human-readable duration labels. */
export function reportToJson(report: TrackReport): string {
  return JSON.stringify(
    {
      app: 'senmurv',
      type: 'track-report',
      from: report.from,
      to: report.to,
      generatedAt: report.generatedAt,
      totalMs: report.totalMs,
      totalLabel: formatDurationShort(report.totalMs),
      netMs: report.netMs,
      netLabel: formatDurationShort(report.netMs),
      taskCount: report.taskCount,
      days: report.days.map((day) => ({
        date: day.date,
        label: day.label,
        totalMs: day.totalMs,
        totalLabel: formatDurationShort(day.totalMs),
        netMs: day.netMs,
        netLabel: formatDurationShort(day.netMs),
        tasks: day.tasks.map((task) => ({
          title: task.title,
          tag: task.tag,
          durationMs: task.durationMs,
          durationLabel: formatDurationShort(task.durationMs),
          runs: task.runs,
          start: task.start,
          end: task.end,
        })),
      })),
    },
    null,
    2
  );
}

/** Render a report in the requested format. */
export function renderReport(report: TrackReport, format: ReportFormat): string {
  switch (format) {
    case 'csv':
      return reportToCsv(report);
    case 'json':
      return reportToJson(report);
    default:
      return reportToTxt(report);
  }
}

/** Download filename for a report, e.g. `senmurv-track-2026-07-22.txt`. */
export function reportFilename(from: string, to: string, format: ReportFormat): string {
  const stamp = from === to ? from : `${from}_to_${to}`;
  return `senmurv-track-${stamp}.${format}`;
}

/** MIME type for a report's Blob. */
export function reportMimeType(format: ReportFormat): string {
  switch (format) {
    case 'csv':
      return 'text/csv';
    case 'json':
      return 'application/json';
    default:
      return 'text/plain';
  }
}
