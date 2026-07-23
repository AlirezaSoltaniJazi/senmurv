import { describe, expect, it } from 'vitest';
import {
  buildTrackReport,
  entriesDateSpan,
  entriesInRange,
  renderReport,
  reportFilename,
  reportMimeType,
  reportToCsv,
  reportToJson,
  reportToTxt,
} from '@/shared/report';
import type { TrackReport } from '@/shared/report';
import type { TimeEntry } from '@/shared/types';

/** Local epoch ms; `month` is 0-based (JS Date convention). */
function at(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return new Date(year, month, day, hour, minute).getTime();
}

function makeEntry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: 'tsk_1',
    title: 'Write Test Case',
    tag: 'My Company',
    intervals: [{ start: at(2026, 6, 20, 9, 0), end: at(2026, 6, 20, 10, 0) }],
    stoppedAt: at(2026, 6, 20, 10, 0),
    createdAt: at(2026, 6, 20, 9, 0),
    updatedAt: at(2026, 6, 20, 10, 0),
    ...overrides,
  };
}

const GEN_AT = '2026-07-22T12:00:00.000Z';
const NOW = at(2026, 6, 22, 18, 0);

describe('entriesInRange', () => {
  const entries = [
    makeEntry({
      id: 'a',
      intervals: [{ start: at(2026, 6, 19, 9, 0), end: at(2026, 6, 19, 10, 0) }],
    }),
    makeEntry({
      id: 'b',
      intervals: [{ start: at(2026, 6, 20, 9, 0), end: at(2026, 6, 20, 10, 0) }],
    }),
    makeEntry({
      id: 'c',
      intervals: [{ start: at(2026, 6, 21, 9, 0), end: at(2026, 6, 21, 10, 0) }],
    }),
  ];

  it('includes both bounds', () => {
    const ids = entriesInRange(entries, '2026-07-19', '2026-07-21').map((e) => e.id);
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('excludes days outside the range', () => {
    expect(entriesInRange(entries, '2026-07-20', '2026-07-20').map((e) => e.id)).toEqual(['b']);
  });

  it('normalizes a reversed range', () => {
    expect(entriesInRange(entries, '2026-07-21', '2026-07-19').map((e) => e.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});

describe('entriesDateSpan', () => {
  it('spans the earliest and latest entry days', () => {
    const entries = [
      makeEntry({ intervals: [{ start: at(2026, 6, 21, 9, 0), end: at(2026, 6, 21, 10, 0) }] }),
      makeEntry({ intervals: [{ start: at(2026, 6, 19, 9, 0), end: at(2026, 6, 19, 10, 0) }] }),
      makeEntry({ intervals: [{ start: at(2026, 6, 20, 9, 0), end: at(2026, 6, 20, 10, 0) }] }),
    ];
    expect(entriesDateSpan(entries, '2026-07-22')).toEqual({
      from: '2026-07-19',
      to: '2026-07-21',
    });
  });

  it('falls back to the given day when there are no entries', () => {
    expect(entriesDateSpan([], '2026-07-22')).toEqual({ from: '2026-07-22', to: '2026-07-22' });
  });
});

describe('buildTrackReport', () => {
  it('groups by day (ascending) and sums totals', () => {
    const entries = [
      makeEntry({
        id: 'c',
        intervals: [{ start: at(2026, 6, 21, 9, 0), end: at(2026, 6, 21, 9, 30) }],
      }),
      makeEntry({
        id: 'a',
        intervals: [{ start: at(2026, 6, 19, 9, 0), end: at(2026, 6, 19, 10, 0) }],
      }),
    ];
    const report = buildTrackReport(entries, '2026-07-19', '2026-07-21', NOW, GEN_AT);
    expect(report.days.map((d) => d.date)).toEqual(['2026-07-19', '2026-07-21']);
    expect(report.taskCount).toBe(2);
    expect(report.totalMs).toBe(60 * 60_000 + 30 * 60_000); // 1h + 30m
    expect(report.from).toBe('2026-07-19');
    expect(report.to).toBe('2026-07-21');
    expect(report.generatedAt).toBe(GEN_AT);
  });

  it('merges re-runs of one lineage that day into a single task', () => {
    const root = makeEntry({
      id: 'r',
      title: 'Deploy',
      tag: 'Ops',
      intervals: [{ start: at(2026, 6, 20, 9, 0), end: at(2026, 6, 20, 10, 0) }],
    });
    const rerun = makeEntry({
      id: 'r2',
      parentId: 'r',
      title: 'Deploy',
      tag: 'Ops',
      intervals: [{ start: at(2026, 6, 20, 11, 0), end: at(2026, 6, 20, 11, 30) }],
    });
    const report = buildTrackReport([root, rerun], '2026-07-20', '2026-07-20', NOW, GEN_AT);
    expect(report.days).toHaveLength(1);
    const [task] = report.days[0]!.tasks;
    expect(task).toMatchObject({
      title: 'Deploy',
      tag: 'Ops',
      runs: 2,
      durationMs: 90 * 60_000, // 1h + 30m
      start: at(2026, 6, 20, 9, 0),
      end: at(2026, 6, 20, 11, 30),
    });
  });

  it('reports net (merged) below total when timers overlap', () => {
    const entries = [
      makeEntry({
        id: 'a',
        intervals: [{ start: at(2026, 6, 20, 9, 0), end: at(2026, 6, 20, 11, 0) }],
      }),
      makeEntry({
        id: 'b',
        intervals: [{ start: at(2026, 6, 20, 9, 30), end: at(2026, 6, 20, 10, 0) }],
      }),
    ];
    const report = buildTrackReport(entries, '2026-07-20', '2026-07-20', NOW, GEN_AT);
    expect(report.totalMs).toBe(150 * 60_000); // 2h + 30m summed
    expect(report.netMs).toBe(120 * 60_000); // 2h wall-clock (overlap merged)
  });

  it('leaves a running task open (end null) and accrues to `now`', () => {
    const running = makeEntry({
      id: 'run',
      intervals: [{ start: at(2026, 6, 22, 17, 0), end: null }],
      stoppedAt: null,
    });
    const report = buildTrackReport([running], '2026-07-22', '2026-07-22', NOW, GEN_AT);
    const [task] = report.days[0]!.tasks;
    expect(task!.end).toBeNull();
    expect(task!.durationMs).toBe(60 * 60_000); // 17:00 → 18:00 (NOW)
  });

  it('is empty for a range with no entries', () => {
    const report = buildTrackReport([makeEntry()], '2026-08-01', '2026-08-31', NOW, GEN_AT);
    expect(report.days).toEqual([]);
    expect(report.taskCount).toBe(0);
    expect(report.totalMs).toBe(0);
  });
});

describe('reportToTxt', () => {
  it('renders a header, day sections, and task lines', () => {
    const report = buildTrackReport([makeEntry()], '2026-07-20', '2026-07-20', NOW, GEN_AT);
    const txt = reportToTxt(report);
    expect(txt).toContain('Senmurv — Time Tracking Report');
    expect(txt).toContain('Range: 2026-07-20');
    expect(txt).toContain('Mon 20 Jul 2026');
    expect(txt).toContain('[My Company] Write Test Case');
    expect(txt).toContain('09:00–10:00');
  });

  it('states when the range has no tasks', () => {
    const report = buildTrackReport([], '2026-07-20', '2026-07-21', NOW, GEN_AT);
    expect(reportToTxt(report)).toContain('No tasks in this range.');
  });

  it('renders the net suffix and run count when timers overlap and a task re-runs', () => {
    // Task X: two runs (9–11 + 11–11:30) = 2h30m; Task Y: 9:30–10 overlaps X.
    // Summed total 3h; wall-clock net 2h30m (union 9:00–11:30).
    const xRoot = makeEntry({
      id: 'x',
      title: 'Build',
      tag: 'Ops',
      intervals: [{ start: at(2026, 6, 20, 9, 0), end: at(2026, 6, 20, 11, 0) }],
    });
    const xRerun = makeEntry({
      id: 'x2',
      parentId: 'x',
      title: 'Build',
      tag: 'Ops',
      intervals: [{ start: at(2026, 6, 20, 11, 0), end: at(2026, 6, 20, 11, 30) }],
    });
    const y = makeEntry({
      id: 'y',
      title: 'Review',
      tag: 'Ops',
      intervals: [{ start: at(2026, 6, 20, 9, 30), end: at(2026, 6, 20, 10, 0) }],
    });
    const txt = reportToTxt(
      buildTrackReport([xRoot, xRerun, y], '2026-07-20', '2026-07-20', NOW, GEN_AT)
    );
    expect(txt).toContain('Total: 3h 0m (net 2h 30m)');
    expect(txt).toContain(', 2 runs');
  });

  it('renders an open range ("…") for a still-running task', () => {
    const running = makeEntry({
      id: 'run',
      intervals: [{ start: at(2026, 6, 22, 17, 0), end: null }],
      stoppedAt: null,
    });
    expect(
      reportToTxt(buildTrackReport([running], '2026-07-22', '2026-07-22', NOW, GEN_AT))
    ).toContain('17:00–…');
  });
});

describe('reportToCsv', () => {
  it('emits a header plus one CRLF-terminated row per task with decimal hours', () => {
    const report = buildTrackReport([makeEntry()], '2026-07-20', '2026-07-20', NOW, GEN_AT);
    const csv = reportToCsv(report);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe('Date,Title,Tag,Start,End,Runs,Duration,Hours');
    expect(lines[1]).toBe('2026-07-20,Write Test Case,My Company,09:00,10:00,1,1:00:00,1.00');
  });

  it('quotes fields containing commas or quotes', () => {
    const report = buildTrackReport(
      [makeEntry({ title: 'Fix, "now"', tag: 'A,B' })],
      '2026-07-20',
      '2026-07-20',
      NOW,
      GEN_AT
    );
    const row = reportToCsv(report).trimEnd().split('\r\n')[1]!;
    expect(row).toContain('"Fix, ""now"""');
    expect(row).toContain('"A,B"');
  });

  it('leaves the End cell empty for a still-running task', () => {
    const running = makeEntry({
      intervals: [{ start: at(2026, 6, 22, 17, 0), end: null }],
      stoppedAt: null,
    });
    const row = reportToCsv(buildTrackReport([running], '2026-07-22', '2026-07-22', NOW, GEN_AT))
      .trimEnd()
      .split('\r\n')[1]!;
    // …,Start,End,… → End (5th column) is blank while the task is running.
    expect(row.split(',')[4]).toBe('');
  });

  it('neutralizes spreadsheet formula injection in title/tag', () => {
    const report = buildTrackReport(
      [makeEntry({ title: '=1+1', tag: '+cmd' })],
      '2026-07-20',
      '2026-07-20',
      NOW,
      GEN_AT
    );
    const row = reportToCsv(report).trimEnd().split('\r\n')[1]!;
    expect(row).toContain("'=1+1");
    expect(row).toContain("'+cmd");
  });
});

describe('reportToJson', () => {
  it('produces a parseable, tagged bundle with enriched labels', () => {
    const report = buildTrackReport([makeEntry()], '2026-07-20', '2026-07-20', NOW, GEN_AT);
    const parsed = JSON.parse(reportToJson(report));
    expect(parsed).toMatchObject({ app: 'senmurv', type: 'track-report', taskCount: 1 });
    expect(parsed.days[0].tasks[0]).toMatchObject({
      title: 'Write Test Case',
      tag: 'My Company',
      durationLabel: '1h 0m',
      runs: 1,
    });
  });
});

describe('renderReport / reportFilename / reportMimeType', () => {
  const report = buildTrackReport([makeEntry()], '2026-07-20', '2026-07-20', NOW, GEN_AT);

  it('dispatches on format', () => {
    expect(renderReport(report, 'csv').startsWith('Date,Title')).toBe(true);
    expect(JSON.parse(renderReport(report, 'json')).type).toBe('track-report');
    expect(renderReport(report, 'txt')).toContain('Senmurv — Time Tracking Report');
  });

  it('names single-day and range files', () => {
    expect(reportFilename('2026-07-20', '2026-07-20', 'txt')).toBe('senmurv-track-2026-07-20.txt');
    expect(reportFilename('2026-07-01', '2026-07-20', 'csv')).toBe(
      'senmurv-track-2026-07-01_to_2026-07-20.csv'
    );
  });

  it('maps formats to MIME types', () => {
    expect(reportMimeType('txt')).toBe('text/plain');
    expect(reportMimeType('csv')).toBe('text/csv');
    expect(reportMimeType('json')).toBe('application/json');
  });

  describe('net-suffix rendering', () => {
    const base: TrackReport = {
      from: '2026-07-20',
      to: '2026-07-20',
      generatedAt: '2026-07-20T00:00:00.000Z',
      days: [],
      totalMs: 0,
      netMs: 0,
      taskCount: 0,
    };

    it('omits "(net …)" when total and net floor to the same minute', () => {
      // 4_999_999 and 4_980_001 both floor to 83 min -> "1h 23m", so no redundant suffix.
      const txt = reportToTxt({ ...base, totalMs: 4_999_999, netMs: 4_980_001 });
      expect(txt).toContain('Total: 1h 23m\n');
      expect(txt).not.toContain('(net');
    });

    it('shows "(net …)" when the rendered labels differ', () => {
      const txt = reportToTxt({ ...base, totalMs: 7_200_000, netMs: 3_600_000 });
      expect(txt).toContain('Total: 2h 0m (net 1h 0m)');
    });
  });
});
