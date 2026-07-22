import { useState } from 'react';
import type { ReactElement } from 'react';
import {
  buildTrackReport,
  entriesInRange,
  renderReport,
  reportFilename,
  reportMimeType,
} from '@/shared/report';
import type { ReportFormat } from '@/shared/report';
import { dayKey, entryDayKey } from '@/shared/tasks';
import type { TimeEntry } from '@/shared/types';

interface Props {
  entries: TimeEntry[];
  /** Current clock — open intervals accrue up to here in the report. */
  now: number;
}

type Preset = 'today' | 'week' | 'month' | 'all';

const FORMATS: { id: ReportFormat; label: string }[] = [
  { id: 'txt', label: 'Text (.txt)' },
  { id: 'csv', label: 'Excel / CSV (.csv)' },
  { id: 'json', label: 'JSON (.json)' },
];

/** ISO timestamp for the report header — wrapped so the clock read stays out of render. */
function nowIso(): string {
  return new Date().toISOString();
}

/** Export a Track report over a chosen date range as a .txt, .csv, or .json file. */
export function TrackExport({ entries, now }: Props): ReactElement {
  const today = dayKey(now);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [format, setFormat] = useState<ReportFormat>('txt');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applyPreset(preset: Preset): void {
    setError(null);
    setStatus(null);
    if (preset === 'today') {
      setFrom(today);
      setTo(today);
      return;
    }
    if (preset === 'week') {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      setFrom(dayKey(start.getTime()));
      setTo(today);
      return;
    }
    if (preset === 'month') {
      const d = new Date(now);
      setFrom(dayKey(new Date(d.getFullYear(), d.getMonth(), 1).getTime()));
      setTo(today);
      return;
    }
    // 'all' — span the earliest and latest days that have entries.
    const keys = entries.map(entryDayKey).sort();
    setFrom(keys[0] ?? today);
    setTo(keys[keys.length - 1] ?? today);
  }

  function doExport(): void {
    setError(null);
    setStatus(null);
    if (entriesInRange(entries, from, to).length === 0) {
      setError('No tasks in the selected date range.');
      return;
    }
    const report = buildTrackReport(entries, from, to, now, nowIso());
    const blob = new Blob([renderReport(report, format)], { type: reportMimeType(format) });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = reportFilename(report.from, report.to, format);
    a.click();
    URL.revokeObjectURL(url);
    setStatus(`Exported ${report.taskCount} task(s) across ${report.days.length} day(s).`);
  }

  return (
    <details className="export-panel">
      <summary>Export report</summary>
      <div className="export-body">
        <div className="row">
          <label className="export-field">
            <span className="field-label">From</span>
            <input
              type="date"
              className="datetime-input"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="export-field">
            <span className="field-label">To</span>
            <input
              type="date"
              className="datetime-input"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        <div className="chips">
          <button type="button" className="chip" onClick={() => applyPreset('today')}>
            Today
          </button>
          <button type="button" className="chip" onClick={() => applyPreset('week')}>
            Last 7 days
          </button>
          <button type="button" className="chip" onClick={() => applyPreset('month')}>
            This month
          </button>
          <button type="button" className="chip" onClick={() => applyPreset('all')}>
            All
          </button>
        </div>
        <div className="row">
          <select
            className="export-format"
            value={format}
            onChange={(e) => setFormat(e.target.value as ReportFormat)}
            aria-label="Export format"
          >
            {FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <button type="button" className="primary" onClick={doExport}>
            ⭳ Export
          </button>
        </div>
        {status && <p className="status">{status}</p>}
        {error && <p className="error">{error}</p>}
      </div>
    </details>
  );
}
