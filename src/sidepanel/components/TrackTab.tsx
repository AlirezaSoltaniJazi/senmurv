import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { sendRuntimeMessage } from '@/shared/messages';
import {
  buildDayBlocks,
  buildMonthGrid,
  distinctTags,
  distinctTitles,
  entryDurationMs,
  formatDuration,
  isActive,
  isRunning,
  rootId,
  tagColorClass,
  totalsByDay,
} from '@/shared/tasks';
import type { Result, TimeEntry } from '@/shared/types';
import { newId } from '@/utils/id';
import { AutocompleteInput } from './AutocompleteInput';
import { TaskCalendarView } from './TaskCalendarView';
import { TaskListView } from './TaskListView';
import { TrackExport } from './TrackExport';

type View = 'list' | 'calendar';

/** Current epoch ms — wrapped so clock reads stay outside render-purity analysis. */
function nowMs(): number {
  return Date.now();
}

function firstStart(entry: TimeEntry): number {
  return entry.intervals[0]?.start ?? entry.createdAt;
}

/** Close the last open interval at `at`, leaving already-closed intervals as-is. */
function closeOpenInterval(entry: TimeEntry, at: number): TimeEntry['intervals'] {
  return entry.intervals.map((iv, i) =>
    i === entry.intervals.length - 1 && iv.end === null ? { ...iv, end: at } : iv
  );
}

interface Props {
  /** Bumped by the header refresh button to re-pull data from storage. */
  reloadNonce: number;
}

export function TrackTab({ reloadNonce }: Props): ReactElement {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [title, setTitle] = useState('');
  const [tag, setTag] = useState('');
  const [view, setView] = useState<View>('list');
  const [cursor, setCursor] = useState<{ year: number; month: number }>(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(nowMs);

  // Load persisted tasks on mount and whenever the refresh button bumps the nonce.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await sendRuntimeMessage<Result<TimeEntry[]>>({ type: MESSAGE_TYPES.GET_TASKS });
      if (!cancelled && res.ok) setEntries(res.value);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadNonce]);

  // Tick once a second only while something is actually running. The immediate
  // refresh makes a just-started timer show live time without a 1s delay.
  const running = entries.some(isRunning);
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setNow(nowMs()), 1000);
    return () => clearInterval(id);
  }, [running]);

  // Auto-dismiss the transient success message after 5 seconds.
  useEffect(() => {
    if (status === null) return undefined;
    const id = setTimeout(() => setStatus(null), 5000);
    return () => clearTimeout(id);
  }, [status]);

  async function persist(entry: TimeEntry): Promise<boolean> {
    const res = await sendRuntimeMessage<Result<TimeEntry[]>>({
      type: MESSAGE_TYPES.SAVE_TASK,
      payload: { entry },
    });
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    setEntries(res.value);
    return true;
  }

  async function start(): Promise<void> {
    setError(null);
    setStatus(null);
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Title is required.');
      return;
    }
    const at = nowMs();
    const entry: TimeEntry = {
      id: newId('tsk_'),
      title: trimmed,
      tag: tag.trim(),
      intervals: [{ start: at, end: null }],
      stoppedAt: null,
      createdAt: at,
      updatedAt: at,
    };
    setNow(at);
    if (await persist(entry)) setTitle(''); // keep the tag for fast re-entry
  }

  async function pause(entry: TimeEntry): Promise<void> {
    if (!isRunning(entry)) return;
    const at = nowMs();
    setNow(at);
    await persist({ ...entry, intervals: closeOpenInterval(entry, at), updatedAt: at });
  }

  async function resume(entry: TimeEntry): Promise<void> {
    if (!isActive(entry) || isRunning(entry)) return;
    const at = nowMs();
    setNow(at);
    await persist({
      ...entry,
      intervals: [...entry.intervals, { start: at, end: null }],
      updatedAt: at,
    });
  }

  async function stop(entry: TimeEntry): Promise<void> {
    if (!isActive(entry)) return;
    const at = nowMs();
    setNow(at);
    await persist({
      ...entry,
      intervals: closeOpenInterval(entry, at),
      stoppedAt: at,
      updatedAt: at,
    });
  }

  async function rerun(entry: TimeEntry): Promise<void> {
    setError(null);
    setStatus(null);
    const root = rootId(entry);
    const source = entries.find((e) => e.id === root) ?? entry;
    const at = nowMs();
    const child: TimeEntry = {
      id: newId('tsk_'),
      title: source.title,
      tag: source.tag,
      intervals: [{ start: at, end: null }],
      stoppedAt: null,
      createdAt: at,
      updatedAt: at,
      parentId: root,
    };
    setNow(at);
    await persist(child);
  }

  async function saveEdit(entry: TimeEntry): Promise<void> {
    setError(null);
    if (await persist({ ...entry, updatedAt: nowMs() })) {
      setEditingId(null);
      setStatus('Saved.');
    }
  }

  async function remove(id: string): Promise<void> {
    const target = entries.find((e) => e.id === id);
    if (target && !window.confirm(`Delete “${target.title}”? This cannot be undone.`)) return;
    const res = await sendRuntimeMessage<Result<TimeEntry[]>>({
      type: MESSAGE_TYPES.DELETE_TASK,
      payload: { id },
    });
    if (res.ok) {
      setEntries(res.value);
      if (editingId === id) setEditingId(null);
    } else {
      setError(res.error);
    }
  }

  function shiftMonth(delta: number): void {
    setCursor((c) => {
      const total = c.year * 12 + c.month + delta;
      return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
    });
    setSelectedDay(null);
  }

  function selectDay(key: string): void {
    setSelectedDay((prev) => (prev === key ? null : key));
  }

  function toggleExpand(key: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const activeEntries = [...entries].filter(isActive).sort((a, b) => firstStart(b) - firstStart(a));
  const dayBlocks = buildDayBlocks(entries, now);
  const grid = buildMonthGrid(cursor.year, cursor.month);
  const totals = totalsByDay(entries, now);
  const tags = distinctTags(entries);
  const titles = distinctTitles(entries);

  return (
    <div className="tab">
      <AutocompleteInput
        className="name-input"
        placeholder="Task title (e.g. Write Test Case)"
        ariaLabel="Task title"
        value={title}
        onChange={setTitle}
        options={titles}
        onEnter={() => void start()}
      />
      <div className="row">
        <AutocompleteInput
          className="name-input"
          wrapperClassName="tag-autocomplete"
          placeholder="Tag (e.g. My Company)"
          ariaLabel="Tag"
          value={tag}
          onChange={setTag}
          options={tags}
          onEnter={() => void start()}
        />
        <button type="button" className="primary" onClick={() => void start()}>
          ▶ Start
        </button>
      </div>

      {activeEntries.length > 0 && (
        <>
          <h3 className="section-title">Active</h3>
          <ul className="running-list">
            {activeEntries.map((entry) => (
              <li
                key={entry.id}
                className={`running-row ${isRunning(entry) ? 'is-running' : 'is-paused'}`}
              >
                <span className={`task-tag ${tagColorClass(entry.tag)}`}>
                  {entry.tag || 'untagged'}
                </span>
                <span className="running-title">{entry.title}</span>
                <span className="running-elapsed">
                  {formatDuration(entryDurationMs(entry, now))}
                </span>
                <span className="running-actions">
                  {isRunning(entry) ? (
                    <button type="button" onClick={() => void pause(entry)}>
                      ❚❚ Pause
                    </button>
                  ) : (
                    <button type="button" className="primary" onClick={() => void resume(entry)}>
                      ▶ Resume
                    </button>
                  )}
                  <button type="button" className="danger" onClick={() => void stop(entry)}>
                    ■ Stop
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <TrackExport entries={entries} />

      <div className="chips view-toggle">
        <button
          type="button"
          className={view === 'list' ? 'chip active' : 'chip'}
          onClick={() => setView('list')}
        >
          List
        </button>
        <button
          type="button"
          className={view === 'calendar' ? 'chip active' : 'chip'}
          onClick={() => setView('calendar')}
        >
          Calendar
        </button>
      </div>

      {view === 'list' ? (
        <TaskListView
          days={dayBlocks}
          now={now}
          expanded={expanded}
          editingId={editingId}
          titleOptions={titles}
          tagOptions={tags}
          onToggleExpand={toggleExpand}
          onRerun={(entry) => void rerun(entry)}
          onStartEdit={(id) => setEditingId(id)}
          onCancelEdit={() => setEditingId(null)}
          onSave={(entry) => void saveEdit(entry)}
          onDelete={(id) => void remove(id)}
        />
      ) : (
        <TaskCalendarView
          entries={entries}
          dayBlocks={dayBlocks}
          grid={grid}
          totals={totals}
          now={now}
          selectedDay={selectedDay}
          expanded={expanded}
          editingId={editingId}
          titleOptions={titles}
          tagOptions={tags}
          onSelectDay={selectDay}
          onPrevMonth={() => shiftMonth(-1)}
          onNextMonth={() => shiftMonth(1)}
          onToggleExpand={toggleExpand}
          onRerun={(entry) => void rerun(entry)}
          onStartEdit={(id) => setEditingId(id)}
          onCancelEdit={() => setEditingId(null)}
          onSave={(entry) => void saveEdit(entry)}
          onDelete={(id) => void remove(id)}
        />
      )}

      {status && <p className="status">{status}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
