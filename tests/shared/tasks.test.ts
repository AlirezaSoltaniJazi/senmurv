import { describe, expect, it } from 'vitest';
import {
  buildDayBlocks,
  buildMonthGrid,
  dayKey,
  dayLabel,
  dayTags,
  distinctTags,
  entryDayKey,
  entryDurationMs,
  formatClock,
  formatDuration,
  formatDurationShort,
  fromLocalInputValue,
  groupEntriesByDay,
  isActive,
  isPaused,
  isRunning,
  mergedDurationMs,
  monthLabel,
  rootId,
  runTimeRange,
  tagColorClass,
  toLocalInputValue,
  totalsByDay,
} from '@/shared/tasks';
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

const HOUR = 3_600_000;
const MIN = 60_000;

describe('task state', () => {
  const running = makeEntry({ intervals: [{ start: 1000, end: null }], stoppedAt: null });
  const paused = makeEntry({ intervals: [{ start: 1000, end: 2000 }], stoppedAt: null });
  const done = makeEntry();

  it('classifies running / paused / done', () => {
    expect(isRunning(running)).toBe(true);
    expect(isPaused(running)).toBe(false);
    expect(isActive(running)).toBe(true);

    expect(isRunning(paused)).toBe(false);
    expect(isPaused(paused)).toBe(true);
    expect(isActive(paused)).toBe(true);

    expect(isRunning(done)).toBe(false);
    expect(isPaused(done)).toBe(false);
    expect(isActive(done)).toBe(false);
  });

  it('treats an interval-less active entry as paused', () => {
    const empty = makeEntry({ intervals: [], stoppedAt: null });
    expect(isRunning(empty)).toBe(false);
    expect(isPaused(empty)).toBe(true);
  });
});

describe('entryDurationMs', () => {
  it('sums finished intervals', () => {
    const e = makeEntry({
      intervals: [
        { start: 0, end: 1000 },
        { start: 2000, end: 2500 },
      ],
    });
    expect(entryDurationMs(e, 9999)).toBe(1500);
  });

  it('accrues an open interval up to now', () => {
    const e = makeEntry({ intervals: [{ start: 1000, end: null }], stoppedAt: null });
    expect(entryDurationMs(e, 6000)).toBe(5000);
  });

  it('mixes closed and open intervals', () => {
    const e = makeEntry({
      intervals: [
        { start: 0, end: 1000 },
        { start: 2000, end: null },
      ],
      stoppedAt: null,
    });
    expect(entryDurationMs(e, 2500)).toBe(1500);
  });

  it('clamps a backwards interval to 0', () => {
    const e = makeEntry({ intervals: [{ start: 5000, end: 1000 }] });
    expect(entryDurationMs(e, 9999)).toBe(0);
  });
});

describe('formatDuration', () => {
  it('formats H:MM:SS and clamps negatives', () => {
    expect(formatDuration(0)).toBe('0:00:00');
    expect(formatDuration(65_000)).toBe('0:01:05');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
    expect(formatDuration(36_000_000)).toBe('10:00:00');
    expect(formatDuration(-500)).toBe('0:00:00');
  });
});

describe('formatDurationShort', () => {
  it('formats compact totals', () => {
    expect(formatDurationShort(0)).toBe('0m');
    expect(formatDurationShort(30_000)).toBe('0m');
    expect(formatDurationShort(5 * MIN)).toBe('5m');
    expect(formatDurationShort(83 * MIN)).toBe('1h 23m');
    expect(formatDurationShort(90 * MIN)).toBe('1h 30m');
  });
});

describe('dayKey (local time)', () => {
  it('keeps a late-evening timestamp on its local day (not UTC)', () => {
    expect(dayKey(at(2026, 6, 20, 23, 30))).toBe('2026-07-20');
    expect(dayKey(at(2026, 0, 5, 0, 0))).toBe('2026-01-05');
  });
});

describe('dayLabel', () => {
  const now = at(2026, 6, 20, 12, 0); // Monday 2026-07-20

  it('labels today, yesterday, and other days', () => {
    expect(dayLabel('2026-07-20', now)).toBe('Today');
    expect(dayLabel('2026-07-19', now)).toBe('Yesterday');
    expect(dayLabel('2026-07-15', now)).toBe('Wed 15 Jul 2026');
  });
});

describe('entryDayKey', () => {
  it('files an entry under its first interval start', () => {
    expect(entryDayKey(makeEntry())).toBe('2026-07-20');
  });

  it('falls back to createdAt when there are no intervals', () => {
    const e = makeEntry({ intervals: [], createdAt: at(2026, 5, 1, 8, 0) });
    expect(entryDayKey(e)).toBe('2026-06-01');
  });
});

describe('groupEntriesByDay', () => {
  const now = at(2026, 6, 20, 18, 0);
  const e1 = makeEntry({
    id: 'a',
    intervals: [{ start: at(2026, 6, 20, 9, 0), end: at(2026, 6, 20, 10, 0) }],
  });
  const e2 = makeEntry({
    id: 'b',
    intervals: [{ start: at(2026, 6, 20, 11, 0), end: at(2026, 6, 20, 11, 30) }],
  });
  const e3 = makeEntry({
    id: 'c',
    intervals: [{ start: at(2026, 6, 19, 14, 0), end: at(2026, 6, 19, 15, 0) }],
  });

  it('groups by day, newest first, with per-day totals and newest-entry-first order', () => {
    const groups = groupEntriesByDay([e1, e2, e3], now);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.key).toBe('2026-07-20');
    expect(groups[0]!.totalMs).toBe(90 * MIN);
    expect(groups[0]!.entries.map((e) => e.id)).toEqual(['b', 'a']); // 11:00 before 09:00
    expect(groups[1]!.key).toBe('2026-07-19');
    expect(groups[1]!.totalMs).toBe(HOUR);
  });
});

describe('mergedDurationMs (wall-clock, overlaps merged)', () => {
  const now = at(2026, 6, 20, 18, 0);

  it('equals the plain sum when tasks do not overlap', () => {
    const entries = [
      makeEntry({ intervals: [{ start: at(2026, 6, 20, 9, 0), end: at(2026, 6, 20, 10, 0) }] }),
      makeEntry({ intervals: [{ start: at(2026, 6, 20, 11, 0), end: at(2026, 6, 20, 11, 30) }] }),
    ];
    expect(mergedDurationMs(entries, now)).toBe(90 * MIN);
  });

  it('counts overlapping time once', () => {
    const entries = [
      makeEntry({ intervals: [{ start: at(2026, 6, 20, 9, 0), end: at(2026, 6, 20, 10, 0) }] }),
      makeEntry({ intervals: [{ start: at(2026, 6, 20, 9, 30), end: at(2026, 6, 20, 10, 30) }] }),
    ];
    // Union 09:00–10:30 = 90m, even though the plain sum is 120m.
    expect(mergedDurationMs(entries, now)).toBe(90 * MIN);
  });

  it('handles full containment and touching spans', () => {
    const contained = [
      makeEntry({ intervals: [{ start: at(2026, 6, 20, 9, 0), end: at(2026, 6, 20, 11, 0) }] }),
      makeEntry({ intervals: [{ start: at(2026, 6, 20, 9, 30), end: at(2026, 6, 20, 10, 0) }] }),
    ];
    expect(mergedDurationMs(contained, now)).toBe(2 * HOUR);

    const touching = [
      makeEntry({ intervals: [{ start: at(2026, 6, 20, 9, 0), end: at(2026, 6, 20, 10, 0) }] }),
      makeEntry({ intervals: [{ start: at(2026, 6, 20, 10, 0), end: at(2026, 6, 20, 11, 0) }] }),
    ];
    expect(mergedDurationMs(touching, now)).toBe(2 * HOUR);
  });

  it('uses now for an open (running) interval', () => {
    const entries = [makeEntry({ intervals: [{ start: at(2026, 6, 20, 17, 0), end: null }] })];
    expect(mergedDurationMs(entries, now)).toBe(HOUR);
  });
});

describe('totalsByDay', () => {
  it('sums duration per day', () => {
    const now = at(2026, 6, 20, 18, 0);
    const totals = totalsByDay(
      [
        makeEntry({ intervals: [{ start: at(2026, 6, 20, 9, 0), end: at(2026, 6, 20, 10, 0) }] }),
        makeEntry({ intervals: [{ start: at(2026, 6, 20, 11, 0), end: at(2026, 6, 20, 11, 30) }] }),
        makeEntry({ intervals: [{ start: at(2026, 6, 19, 14, 0), end: at(2026, 6, 19, 15, 0) }] }),
      ],
      now
    );
    expect(totals.get('2026-07-20')).toBe(90 * MIN);
    expect(totals.get('2026-07-19')).toBe(HOUR);
  });
});

describe('buildMonthGrid', () => {
  it('builds a Monday-first 6×7 grid with correct padding', () => {
    const grid = buildMonthGrid(2026, 6); // July 2026 (0-based month 6)
    expect(grid.weeks).toHaveLength(6);
    const flat = grid.weeks.flat();
    expect(flat).toHaveLength(42);
    expect(flat.filter((c) => c.inMonth)).toHaveLength(31);
    // July 1 2026 is a Wednesday → 2 leading days (Mon 29, Tue 30 June).
    expect(grid.weeks[0]![0]!.key).toBe('2026-06-29');
    expect(grid.weeks[0]![0]!.inMonth).toBe(false);
    expect(grid.weeks[0]![2]!.key).toBe('2026-07-01');
    expect(grid.weeks[0]![2]!.inMonth).toBe(true);
  });
});

describe('monthLabel', () => {
  it('formats a 0-based month with its year', () => {
    expect(monthLabel(2026, 6)).toBe('July 2026');
    expect(monthLabel(2026, 0)).toBe('January 2026');
  });
});

describe('rootId', () => {
  it('is the entry id for a root and the parentId for a child', () => {
    expect(rootId(makeEntry({ id: 'tsk_a' }))).toBe('tsk_a');
    expect(rootId(makeEntry({ id: 'tsk_b', parentId: 'tsk_a' }))).toBe('tsk_a');
  });
});

describe('formatClock / runTimeRange', () => {
  it('formats local wall-clock time', () => {
    expect(formatClock(at(2026, 6, 20, 9, 5))).toBe('09:05');
  });

  it('shows a closed span and an open span', () => {
    const closed = makeEntry({
      intervals: [{ start: at(2026, 6, 20, 9, 0), end: at(2026, 6, 20, 10, 30) }],
    });
    expect(runTimeRange(closed)).toBe('09:00 – 10:30');

    const open = makeEntry({
      intervals: [{ start: at(2026, 6, 20, 9, 0), end: null }],
      stoppedAt: null,
    });
    expect(runTimeRange(open)).toBe('09:00 – …');
  });
});

describe('buildDayBlocks', () => {
  const now = at(2026, 6, 20, 18, 0);

  it('renders a single-run task as a non-multiRun block', () => {
    const solo = makeEntry({
      id: 'solo',
      intervals: [{ start: at(2026, 6, 20, 9, 0), end: at(2026, 6, 20, 10, 0) }],
    });
    const [day] = buildDayBlocks([solo], now);
    expect(day!.blocks).toHaveLength(1);
    expect(day!.blocks[0]!.multiRun).toBe(false);
    expect(day!.blocks[0]!.runs).toHaveLength(1);
  });

  it('groups re-runs of a lineage under one multiRun block per day', () => {
    const root = makeEntry({
      id: 'root',
      title: 'Write Test Case',
      intervals: [{ start: at(2026, 6, 20, 9, 0), end: at(2026, 6, 20, 10, 0) }],
    });
    const rerun = makeEntry({
      id: 'run2',
      parentId: 'root',
      title: 'Write Test Case',
      intervals: [{ start: at(2026, 6, 20, 14, 0), end: at(2026, 6, 20, 14, 30) }],
    });
    const [day] = buildDayBlocks([root, rerun], now);
    expect(day!.blocks).toHaveLength(1);
    const block = day!.blocks[0]!;
    expect(block.rootId).toBe('root');
    expect(block.multiRun).toBe(true);
    expect(block.runs.map((r) => r.id)).toEqual(['run2', 'root']); // newest first
    expect(block.totalMs).toBe(90 * MIN);
    expect(day!.totalMs).toBe(90 * MIN);
  });

  it('splits a lineage across days, keeping each day’s total exact', () => {
    const root = makeEntry({
      id: 'root',
      intervals: [{ start: at(2026, 6, 20, 9, 0), end: at(2026, 6, 20, 10, 0) }],
    });
    const laterRun = makeEntry({
      id: 'run2',
      parentId: 'root',
      intervals: [{ start: at(2026, 6, 21, 9, 0), end: at(2026, 6, 21, 9, 30) }],
    });
    const days = buildDayBlocks([root, laterRun], now);
    expect(days.map((d) => d.key)).toEqual(['2026-07-21', '2026-07-20']);
    // Both days show the lineage as multiRun, each with that day's single run.
    expect(days[0]!.blocks[0]!.multiRun).toBe(true);
    expect(days[0]!.totalMs).toBe(30 * MIN);
    expect(days[1]!.totalMs).toBe(HOUR);
  });
});

describe('distinctTags', () => {
  it('dedupes, drops empty/whitespace, and sorts', () => {
    const entries = [
      makeEntry({ tag: 'My Company' }),
      makeEntry({ tag: 'Client X' }),
      makeEntry({ tag: 'My Company' }),
      makeEntry({ tag: '' }),
      makeEntry({ tag: '   ' }),
    ];
    expect(distinctTags(entries)).toEqual(['Client X', 'My Company']);
  });
});

describe('dayTags', () => {
  it('returns distinct tags used on a given day', () => {
    const entries = [
      makeEntry({
        tag: 'My Company',
        intervals: [{ start: at(2026, 6, 20, 9, 0), end: at(2026, 6, 20, 10, 0) }],
      }),
      makeEntry({
        tag: 'Client X',
        intervals: [{ start: at(2026, 6, 19, 9, 0), end: at(2026, 6, 19, 10, 0) }],
      }),
    ];
    expect(dayTags(entries, '2026-07-20')).toEqual(['My Company']);
  });
});

describe('tagColorClass', () => {
  it('maps empty/whitespace tags to tag-none', () => {
    expect(tagColorClass('')).toBe('tag-none');
    expect(tagColorClass('   ')).toBe('tag-none');
  });

  it('is deterministic and within the palette range', () => {
    expect(tagColorClass('My Company')).toBe(tagColorClass('My Company'));
    expect(tagColorClass('Client X')).toMatch(/^tag-c[0-7]$/);
  });
});

describe('datetime-local conversion', () => {
  it('round-trips to the same minute', () => {
    const ts = at(2026, 6, 20, 9, 5);
    expect(toLocalInputValue(ts)).toBe('2026-07-20T09:05');
    expect(fromLocalInputValue('2026-07-20T09:05')).toBe(ts);
  });

  it('returns NaN for malformed input', () => {
    expect(Number.isNaN(fromLocalInputValue('garbage'))).toBe(true);
    expect(Number.isNaN(fromLocalInputValue('2026-07-20'))).toBe(true);
  });
});
