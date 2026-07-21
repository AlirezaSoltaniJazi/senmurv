import { describe, expect, it } from 'vitest';
import {
  checklistProgress,
  daysUntil,
  deadlineLabel,
  deadlineStatus,
  isComplete,
  overallProgress,
  progressBar,
} from '@/shared/checklists';
import type { Checklist, Subtask } from '@/shared/types';

function at(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return new Date(year, month, day, hour, minute).getTime();
}

function sub(overrides: Partial<Subtask> = {}): Subtask {
  return { id: 'sub_1', title: 'Item', done: false, ...overrides };
}

function makeList(overrides: Partial<Checklist> = {}): Checklist {
  return {
    id: 'chk_1',
    title: 'Release v1.0',
    subtasks: [],
    done: false,
    deadline: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('checklistProgress', () => {
  it('counts checked subtasks', () => {
    const list = makeList({
      subtasks: [sub({ done: true }), sub({ done: true }), sub({ done: false }), sub()],
    });
    expect(checklistProgress(list)).toEqual({ done: 2, total: 4, percent: 50 });
  });

  it('treats a subtask-less task as a single item', () => {
    expect(checklistProgress(makeList({ done: false }))).toEqual({ done: 0, total: 1, percent: 0 });
    expect(checklistProgress(makeList({ done: true }))).toEqual({
      done: 1,
      total: 1,
      percent: 100,
    });
  });
});

describe('overallProgress', () => {
  it('sums leaf items across tasks', () => {
    const lists = [
      makeList({ subtasks: [sub({ done: true }), sub({ done: false })] }), // 1/2
      makeList({ done: true }), // 1/1
      makeList({ subtasks: [sub({ done: false })] }), // 0/1
    ];
    expect(overallProgress(lists)).toEqual({ done: 2, total: 4, percent: 50 });
  });

  it('is 0% with no tasks', () => {
    expect(overallProgress([])).toEqual({ done: 0, total: 0, percent: 0 });
  });
});

describe('isComplete', () => {
  it('is true when all subtasks are done', () => {
    expect(isComplete(makeList({ subtasks: [sub({ done: true }), sub({ done: true })] }))).toBe(
      true
    );
    expect(isComplete(makeList({ subtasks: [sub({ done: true }), sub({ done: false })] }))).toBe(
      false
    );
  });

  it('falls back to the task flag with no subtasks', () => {
    expect(isComplete(makeList({ done: true }))).toBe(true);
    expect(isComplete(makeList({ done: false }))).toBe(false);
  });
});

describe('daysUntil (local calendar days)', () => {
  const now = at(2026, 6, 20, 14, 0);

  it('measures whole days regardless of time of day', () => {
    expect(daysUntil(at(2026, 6, 20, 23, 0), now)).toBe(0); // later today
    expect(daysUntil(at(2026, 6, 21, 1, 0), now)).toBe(1); // tomorrow
    expect(daysUntil(at(2026, 6, 25, 9, 0), now)).toBe(5);
    expect(daysUntil(at(2026, 6, 18, 9, 0), now)).toBe(-2); // past
  });
});

describe('deadlineLabel', () => {
  const now = at(2026, 6, 20, 14, 0);

  it('labels the remaining time', () => {
    expect(deadlineLabel(at(2026, 6, 20, 23, 0), now)).toBe('Due today');
    expect(deadlineLabel(at(2026, 6, 21, 9, 0), now)).toBe('Due tomorrow');
    expect(deadlineLabel(at(2026, 6, 23, 9, 0), now)).toBe('3 days left');
    expect(deadlineLabel(at(2026, 6, 19, 9, 0), now)).toBe('Overdue by 1 day');
    expect(deadlineLabel(at(2026, 6, 17, 9, 0), now)).toBe('Overdue by 3 days');
  });
});

describe('deadlineStatus', () => {
  const now = at(2026, 6, 20, 14, 0);

  it('buckets urgency', () => {
    expect(deadlineStatus(null, now)).toBe('none');
    expect(deadlineStatus(at(2026, 6, 18, 9, 0), now)).toBe('overdue');
    expect(deadlineStatus(at(2026, 6, 20, 23, 0), now)).toBe('soon'); // today
    expect(deadlineStatus(at(2026, 6, 22, 9, 0), now)).toBe('soon'); // 2 days
    expect(deadlineStatus(at(2026, 6, 25, 9, 0), now)).toBe('ok'); // 5 days
  });
});

describe('progressBar', () => {
  it('splits a percentage into filled/empty segments', () => {
    expect(progressBar(0)).toEqual({ filled: 0, empty: 10 });
    expect(progressBar(100)).toEqual({ filled: 10, empty: 0 });
    expect(progressBar(55)).toEqual({ filled: 6, empty: 4 }); // rounds
    expect(progressBar(150)).toEqual({ filled: 10, empty: 0 }); // clamped
  });
});
