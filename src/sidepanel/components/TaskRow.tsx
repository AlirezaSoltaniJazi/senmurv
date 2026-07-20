import { useState } from 'react';
import type { ReactElement } from 'react';
import {
  entryDurationMs,
  formatDuration,
  fromLocalInputValue,
  isPaused,
  isRunning,
  tagColorClass,
  toLocalInputValue,
} from '@/shared/tasks';
import type { TimeEntry, TimeInterval } from '@/shared/types';

interface TaskRowProps {
  entry: TimeEntry;
  now: number;
  isEditing: boolean;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSave: (entry: TimeEntry) => void;
  onDelete: (id: string) => void;
}

interface IntervalDraft {
  start: string;
  end: string;
}

interface EditFormProps {
  entry: TimeEntry;
  onSave: (entry: TimeEntry) => void;
  onCancel: () => void;
}

/** Inline editor — mounted only while editing, so its state seeds fresh from `entry`. */
function TaskEditForm({ entry, onSave, onCancel }: EditFormProps): ReactElement {
  const [title, setTitle] = useState(entry.title);
  const [tag, setTag] = useState(entry.tag);
  const [rows, setRows] = useState<IntervalDraft[]>(() =>
    entry.intervals.length > 0
      ? entry.intervals.map((iv) => ({
          start: toLocalInputValue(iv.start),
          end: iv.end === null ? '' : toLocalInputValue(iv.end),
        }))
      : [{ start: toLocalInputValue(entry.createdAt), end: '' }]
  );
  const [rowError, setRowError] = useState<string | null>(null);

  function updateRow(index: number, field: keyof IntervalDraft, value: string): void {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function addRow(): void {
    setRows((rs) => [...rs, { start: '', end: '' }]);
  }

  function removeRow(index: number): void {
    setRows((rs) => rs.filter((_, i) => i !== index));
  }

  function save(): void {
    setRowError(null);
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setRowError('Title is required.');
      return;
    }
    if (rows.length === 0) {
      setRowError('At least one time interval is required.');
      return;
    }
    const wasActive = entry.stoppedAt === null;
    const intervals: TimeInterval[] = [];
    for (const [i, row] of rows.entries()) {
      const isLast = i === rows.length - 1;
      const start = fromLocalInputValue(row.start);
      if (Number.isNaN(start)) {
        setRowError('Each interval needs a valid start time.');
        return;
      }
      let end: number | null;
      if (row.end === '') {
        if (!(isLast && wasActive)) {
          setRowError('Only the last interval of a running task can be left open.');
          return;
        }
        end = null;
      } else {
        end = fromLocalInputValue(row.end);
        if (Number.isNaN(end)) {
          setRowError('Each end time must be valid.');
          return;
        }
        if (end < start) {
          setRowError('End must be after start.');
          return;
        }
      }
      intervals.push({ start, end });
    }
    const last = intervals[intervals.length - 1];
    const stoppedAt = wasActive ? null : (last?.end ?? entry.stoppedAt);
    onSave({ ...entry, title: trimmedTitle, tag: tag.trim(), intervals, stoppedAt });
  }

  return (
    <div className="task-edit">
      <input
        className="name-input"
        placeholder="Task title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        className="name-input"
        list="task-tags"
        placeholder="Tag (optional)"
        value={tag}
        onChange={(e) => setTag(e.target.value)}
      />
      <div className="task-intervals">
        {rows.map((row, i) => (
          <div key={i} className="task-interval-row">
            <input
              className="datetime-input"
              type="datetime-local"
              value={row.start}
              onChange={(e) => updateRow(i, 'start', e.target.value)}
            />
            <span className="dim">→</span>
            <input
              className="datetime-input"
              type="datetime-local"
              value={row.end}
              onChange={(e) => updateRow(i, 'end', e.target.value)}
            />
            {rows.length > 1 && (
              <button type="button" className="remove" onClick={() => removeRow(i)}>
                ✕
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={addRow}>
          + Interval
        </button>
      </div>
      {rowError && <p className="error">{rowError}</p>}
      <div className="row">
        <button type="button" className="primary" onClick={save}>
          Save
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** One logged-task row: read view, or the inline editor when `isEditing`. */
export function TaskRow({
  entry,
  now,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: TaskRowProps): ReactElement {
  if (isEditing) {
    return (
      <li className="task-row task-row-editing">
        <TaskEditForm entry={entry} onSave={onSave} onCancel={onCancelEdit} />
      </li>
    );
  }

  const running = isRunning(entry);
  const paused = isPaused(entry);
  return (
    <li className="task-row">
      <span className={`task-tag ${tagColorClass(entry.tag)}`}>{entry.tag || 'untagged'}</span>
      <span className="task-title">{entry.title}</span>
      <span className="task-duration">
        {formatDuration(entryDurationMs(entry, now))}
        {running && <span className="task-state is-running">running</span>}
        {paused && <span className="task-state is-paused">paused</span>}
      </span>
      <span className="task-actions">
        <button type="button" onClick={() => onStartEdit(entry.id)}>
          Edit
        </button>
        <button type="button" className="danger" onClick={() => onDelete(entry.id)}>
          Delete
        </button>
      </span>
    </li>
  );
}
