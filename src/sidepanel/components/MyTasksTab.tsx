import { useEffect, useState } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { sendRuntimeMessage } from '@/shared/messages';
import { isComplete, overallProgress, progressBar } from '@/shared/checklists';
import { fromLocalInputValue, isActive, isRunning } from '@/shared/tasks';
import type { Checklist, Result, TimeEntry } from '@/shared/types';
import { newId } from '@/utils/id';
import { ChecklistCard } from './ChecklistCard';

interface Props {
  /** Bumped by the header refresh button to re-pull data from storage. */
  reloadNonce: number;
}

/** Current epoch ms — wrapped so clock reads stay outside render-purity analysis. */
function nowMs(): number {
  return Date.now();
}

export function MyTasksTab({ reloadNonce }: Props): ReactElement {
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(nowMs);

  // Load checklists + time entries on mount and whenever the refresh nonce bumps.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [lists, tasks] = await Promise.all([
        sendRuntimeMessage<Result<Checklist[]>>({ type: MESSAGE_TYPES.GET_CHECKLISTS }),
        sendRuntimeMessage<Result<TimeEntry[]>>({ type: MESSAGE_TYPES.GET_TASKS }),
      ]);
      if (cancelled) return;
      if (lists.ok) setChecklists(lists.value);
      if (tasks.ok) setTimeEntries(tasks.value);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadNonce]);

  // Tick once a second while a task started from here is actively tracking.
  const tracking = timeEntries.some((e) => e.checklistId !== undefined && isRunning(e));
  useEffect(() => {
    if (!tracking) return undefined;
    const id = setInterval(() => setNow(nowMs()), 1000);
    return () => clearInterval(id);
  }, [tracking]);

  async function persist(checklist: Checklist): Promise<boolean> {
    const res = await sendRuntimeMessage<Result<Checklist[]>>({
      type: MESSAGE_TYPES.SAVE_CHECKLIST,
      payload: { checklist },
    });
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    setChecklists(res.value);
    return true;
  }

  async function addTask(): Promise<void> {
    setError(null);
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Title is required.');
      return;
    }
    let dl: number | null = null;
    if (deadline !== '') {
      const parsed = fromLocalInputValue(deadline);
      if (Number.isNaN(parsed)) {
        setError('Deadline is not a valid date/time.');
        return;
      }
      dl = parsed;
    }
    const at = nowMs();
    const checklist: Checklist = {
      id: newId('chk_'),
      title: trimmed,
      subtasks: [],
      done: false,
      deadline: dl,
      createdAt: at,
      updatedAt: at,
    };
    if (await persist(checklist)) {
      setTitle('');
      setDeadline('');
    }
  }

  function toggleParent(list: Checklist): void {
    const next: Checklist =
      list.subtasks.length > 0
        ? {
            ...list,
            subtasks: list.subtasks.map((s) => ({ ...s, done: !isComplete(list) })),
            updatedAt: nowMs(),
          }
        : { ...list, done: !list.done, updatedAt: nowMs() };
    void persist(next);
  }

  function toggleSubtask(list: Checklist, subtaskId: string): void {
    void persist({
      ...list,
      subtasks: list.subtasks.map((s) => (s.id === subtaskId ? { ...s, done: !s.done } : s)),
      updatedAt: nowMs(),
    });
  }

  function addSubtask(list: Checklist, subtaskTitle: string): void {
    void persist({
      ...list,
      subtasks: [...list.subtasks, { id: newId('sub_'), title: subtaskTitle, done: false }],
      updatedAt: nowMs(),
    });
  }

  function deleteSubtask(list: Checklist, subtaskId: string): void {
    void persist({
      ...list,
      subtasks: list.subtasks.filter((s) => s.id !== subtaskId),
      updatedAt: nowMs(),
    });
  }

  async function saveEdit(list: Checklist): Promise<void> {
    setError(null);
    if (await persist({ ...list, updatedAt: nowMs() })) setEditingId(null);
  }

  async function remove(id: string): Promise<void> {
    const target = checklists.find((c) => c.id === id);
    if (target && !window.confirm(`Delete “${target.title}”? This cannot be undone.`)) return;
    const res = await sendRuntimeMessage<Result<Checklist[]>>({
      type: MESSAGE_TYPES.DELETE_CHECKLIST,
      payload: { id },
    });
    if (res.ok) {
      setChecklists(res.value);
      if (editingId === id) setEditingId(null);
    } else {
      setError(res.error);
    }
  }

  function toggleExpand(id: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** The still-active time entry started from a given task, if any. */
  function activeEntryFor(listId: string): TimeEntry | null {
    return timeEntries.find((e) => e.checklistId === listId && isActive(e)) ?? null;
  }

  async function saveEntry(entry: TimeEntry): Promise<void> {
    const res = await sendRuntimeMessage<Result<TimeEntry[]>>({
      type: MESSAGE_TYPES.SAVE_TASK,
      payload: { entry },
    });
    if (res.ok) setTimeEntries(res.value);
    else setError(res.error);
  }

  function startTracking(list: Checklist): void {
    setError(null);
    if (activeEntryFor(list.id)) return; // already tracking — avoid a duplicate timer
    const at = nowMs();
    setNow(at);
    void saveEntry({
      id: newId('tsk_'),
      title: list.title,
      tag: '',
      intervals: [{ start: at, end: null }],
      stoppedAt: null,
      createdAt: at,
      updatedAt: at,
      checklistId: list.id,
    });
  }

  function stopTracking(entry: TimeEntry): void {
    const at = nowMs();
    const intervals = entry.intervals.map((iv, i) =>
      i === entry.intervals.length - 1 && iv.end === null ? { ...iv, end: at } : iv
    );
    void saveEntry({ ...entry, intervals, stoppedAt: at, updatedAt: at });
  }

  function onTitleKey(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') void addTask();
  }

  const overall = overallProgress(checklists);
  const overallBar = progressBar(overall.percent);
  const sorted = [...checklists].sort(
    (a, b) => (a.deadline ?? Infinity) - (b.deadline ?? Infinity) || b.createdAt - a.createdAt
  );

  return (
    <div className="tab">
      <input
        className="name-input"
        placeholder="New task (e.g. Release v1.0)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={onTitleKey}
      />
      <div className="row">
        <input
          className="datetime-input"
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          aria-label="Deadline (optional)"
        />
        <button type="button" className="primary" onClick={() => void addTask()}>
          Add task
        </button>
      </div>

      {checklists.length > 0 && (
        <div className="overall-progress">
          <span className="bar">
            <span className="bar-fill">{'▓'.repeat(overallBar.filled)}</span>
            <span className="bar-empty">{'░'.repeat(overallBar.empty)}</span>
          </span>
          <span className="progress-pct">
            {overall.percent}% · {overall.done}/{overall.total} done
          </span>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="hint">No tasks yet. Add one above.</p>
      ) : (
        <div className="checklist-list">
          {sorted.map((list) => (
            <ChecklistCard
              key={list.id}
              list={list}
              now={now}
              trackingEntry={activeEntryFor(list.id)}
              isExpanded={expanded.has(list.id)}
              isEditing={editingId === list.id}
              onToggleExpand={toggleExpand}
              onToggleParent={toggleParent}
              onToggleSubtask={toggleSubtask}
              onAddSubtask={addSubtask}
              onDeleteSubtask={deleteSubtask}
              onStartTracking={() => startTracking(list)}
              onStopTracking={stopTracking}
              onStartEdit={(id) => setEditingId(id)}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={(l) => void saveEdit(l)}
              onDelete={(id) => void remove(id)}
            />
          ))}
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
