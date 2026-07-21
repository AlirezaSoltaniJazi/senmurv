import type { Checklist } from '@/shared/types';

/** Completed vs total leaf items, with a rounded percentage. */
export interface Progress {
  done: number;
  total: number;
  percent: number;
}

/**
 * A checklist's progress: for a task with subtasks it's checked/total; for a
 * bare task (no subtasks) it counts as one item, done or not.
 */
export function checklistProgress(list: Checklist): Progress {
  if (list.subtasks.length > 0) {
    const done = list.subtasks.filter((s) => s.done).length;
    const total = list.subtasks.length;
    return { done, total, percent: Math.round((done / total) * 100) };
  }
  const done = list.done ? 1 : 0;
  return { done, total: 1, percent: done * 100 };
}

/** Aggregate progress across every task (sum of leaf items). */
export function overallProgress(lists: Checklist[]): Progress {
  let done = 0;
  let total = 0;
  for (const list of lists) {
    const p = checklistProgress(list);
    done += p.done;
    total += p.total;
  }
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/** Whether a task is fully complete (all subtasks done, or its own flag). */
export function isComplete(list: Checklist): boolean {
  return list.subtasks.length > 0 ? list.subtasks.every((s) => s.done) : list.done;
}

/** Split a percentage into filled/empty segments for a text progress bar. */
export function progressBar(percent: number, segments = 10): { filled: number; empty: number } {
  const filled = Math.max(0, Math.min(segments, Math.round((percent / 100) * segments)));
  return { filled, empty: segments - filled };
}

/** Local midnight (start of day) for a timestamp. */
function startOfDay(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Whole calendar days from now until a deadline (0 = today, 1 = tomorrow, negatives = past). */
export function daysUntil(deadline: number, now: number): number {
  return Math.round((startOfDay(deadline) - startOfDay(now)) / 86_400_000);
}

/** Human remaining-time label for a deadline. */
export function deadlineLabel(deadline: number, now: number): string {
  const days = daysUntil(deadline, now);
  if (days < 0) {
    const overdue = -days;
    return `Overdue by ${overdue} day${overdue === 1 ? '' : 's'}`;
  }
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `${days} days left`;
}

/** Urgency bucket for coloring a deadline badge. `soon` = due within 2 days. */
export function deadlineStatus(
  deadline: number | null,
  now: number
): 'none' | 'overdue' | 'soon' | 'ok' {
  if (deadline === null) return 'none';
  const days = daysUntil(deadline, now);
  if (days < 0) return 'overdue';
  if (days <= 2) return 'soon';
  return 'ok';
}
