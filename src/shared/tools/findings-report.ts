import { csvField } from '@/shared/csv';
import type { A11yReport, TabOrderScan, TabStop } from '@/shared/types';

/**
 * Export a tab-order scan. Mirrors `report.ts`'s render/filename/mime API rather
 * than reusing it — that module is entirely time-tracking-shaped — so the
 * Blob → createObjectURL → download flow transfers unchanged.
 */

export type ReportFormat = 'txt' | 'csv' | 'json';

const ISSUE_LABELS: Record<string, string> = {
  'positive-tabindex': 'positive tabindex',
  'no-accessible-name': 'no accessible name',
  offscreen: 'offscreen',
  'order-mismatch': 'tab order ≠ visual order',
};

function issuesText(stop: TabStop): string {
  return stop.issues.map((i) => ISSUE_LABELS[i] ?? i).join(', ');
}

function toTxt(scan: TabOrderScan): string {
  const lines = ['Senmurv — Tab order', `Stops: ${scan.stops.length}`, ''];
  for (const stop of scan.stops) {
    const name = stop.name ? ` “${stop.name}”` : '';
    const ti = stop.tabindex > 0 ? ` [tabindex ${stop.tabindex}]` : '';
    const issues = stop.issues.length > 0 ? `  — ${issuesText(stop)}` : '';
    lines.push(`${stop.index}. <${stop.tag}>${name}${ti}${issues}`);
  }
  if (scan.warnings.length > 0) {
    lines.push('', 'Notes:');
    for (const w of scan.warnings) lines.push(`  - ${w}`);
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

const CSV_HEADER = ['Order', 'Tag', 'Name', 'Role', 'Tabindex', 'Issues'] as const;

function toCsv(scan: TabOrderScan): string {
  const rows = [CSV_HEADER.join(',')];
  for (const stop of scan.stops) {
    rows.push(
      [stop.index, stop.tag, stop.name, stop.role, stop.tabindex, issuesText(stop)]
        .map(csvField)
        .join(',')
    );
  }
  return `${rows.join('\r\n')}\r\n`;
}

/** Render a tab-order scan in the requested format. */
export function renderTabOrderReport(scan: TabOrderScan, format: ReportFormat): string {
  if (format === 'csv') return toCsv(scan);
  if (format === 'json') {
    return JSON.stringify({ app: 'senmurv', type: 'tab-order', ...scan }, null, 2);
  }
  return toTxt(scan);
}

export function tabOrderFilename(format: ReportFormat): string {
  return `senmurv-tab-order.${format}`;
}

export function reportMimeType(format: ReportFormat): string {
  if (format === 'csv') return 'text/csv';
  if (format === 'json') return 'application/json';
  return 'text/plain';
}

// ---------------------------------------------------------------------------
// Accessibility report
// ---------------------------------------------------------------------------

function a11yToTxt(report: A11yReport): string {
  const lines = ['Senmurv — Accessibility', `Findings: ${report.findings.length}`, ''];
  for (const f of report.findings) {
    const flag = f.confidence === 'needs-review' ? ' (needs review)' : '';
    lines.push(`[${f.level} · ${f.sc}] ${f.ruleId}${flag} — ${f.target}`);
    lines.push(`    ${f.message}`);
    lines.push(`    Fix: ${f.howToFix}`);
    lines.push(`    ${f.helpUrl}`);
    lines.push('');
  }
  if (report.warnings.length > 0) {
    lines.push('Notes:');
    for (const w of report.warnings) lines.push(`  - ${w}`);
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

const A11Y_CSV_HEADER = [
  'Rule',
  'SC',
  'Level',
  'Impact',
  'Confidence',
  'Target',
  'Message',
  'Help',
] as const;

function a11yToCsv(report: A11yReport): string {
  const rows = [A11Y_CSV_HEADER.join(',')];
  for (const f of report.findings) {
    rows.push(
      [f.ruleId, f.sc, f.level, f.impact, f.confidence, f.target, f.message, f.helpUrl]
        .map(csvField)
        .join(',')
    );
  }
  return `${rows.join('\r\n')}\r\n`;
}

/** Render an accessibility report in the requested format. */
export function renderA11yReport(report: A11yReport, format: ReportFormat): string {
  if (format === 'csv') return a11yToCsv(report);
  if (format === 'json') {
    return JSON.stringify({ app: 'senmurv', type: 'accessibility', ...report }, null, 2);
  }
  return a11yToTxt(report);
}

export function a11yFilename(format: ReportFormat): string {
  return `senmurv-accessibility.${format}`;
}
