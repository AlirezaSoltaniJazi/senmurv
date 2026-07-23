import { useState } from 'react';
import type { ReactElement } from 'react';
import {
  entryDurationMs,
  formatDuration,
  fromLocalInputValue,
  isActive,
  isPaused,
  isRunning,
  tagColorClass,
  toLocalInputValue,
} from '@/shared/tasks';
import type { TimeEntry, TimeInterval } from '@/shared/types';
import { AutocompleteInput } from './AutocompleteInput';

interface TaskRowProps {
  entry: TimeEntry;
  now: number;
  isEditing: boolean;
  /** Existing titles/tags for the inline editor's typeahead. */
  titleOptions: string[];
  tagOptions: string[];
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSave: (entry: TimeEntry) => void;
  onDelete: (id: string) => void;
  /** When set, render as a child run: show this time-range label instead of tag+title. */
  runLabel?: string;
  /** When provided and the entry is stopped, show a Re-run button. */
  onRerun?: (entry: TimeEntry) => void;
}

interface IntervalDraft {
  start: string;
  end: string;
}

interface EditFormProps {
  entry: TimeEntry;
  titleOptions: string[];
  tagOptions: string[];
  onSave: (entry: TimeEntry) => void;
  onCancel: () => void;
}

/** Inline editor — mounted only while editing, so its state seeds fresh from `entry`. */
function TaskEditForm({
  entry,
  titleOptions,
  tagOptions,
  onSave,
  onCancel,
}: EditFormProps): ReactElement {
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
      <AutocompleteInput
        className="name-input"
        placeholder="Task title"
        ariaLabel="Task title"
        value={title}
        onChange={setTitle}
        options={titleOptions}
      />
      <AutocompleteInput
        className="name-input"
        placeholder="Tag (optional)"
        ariaLabel="Tag"
        value={tag}
        onChange={setTag}
        options={tagOptions}
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
  titleOptions,
  tagOptions,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
  runLabel,
  onRerun,
}: TaskRowProps): ReactElement {
  if (isEditing) {
    return (
      <div className="task-row task-row-editing">
        <TaskEditForm
          entry={entry}
          titleOptions={titleOptions}
          tagOptions={tagOptions}
          onSave={onSave}
          onCancel={onCancelEdit}
        />
      </div>
    );
  }

  const running = isRunning(entry);
  const paused = isPaused(entry);
  return (
    <div className="task-row">
      {runLabel !== undefined ? (
        <span className="run-time">{runLabel}</span>
      ) : (
        <>
          <span className={`task-tag ${tagColorClass(entry.tag)}`}>{entry.tag || 'untagged'}</span>
          <span className="task-title">{entry.title}</span>
        </>
      )}
      <span className="task-duration">
        {formatDuration(entryDurationMs(entry, now))}
        {running && <span className="task-state is-running">running</span>}
        {paused && <span className="task-state is-paused">paused</span>}
      </span>
      <span className="task-actions">
        {onRerun && !isActive(entry) && (
          <button type="button" onClick={() => onRerun(entry)}>
            ↻ Re-run
          </button>
        )}
        <button type="button" onClick={() => onStartEdit(entry.id)}>
          Edit
        </button>
        <button type="button" className="danger" onClick={() => onDelete(entry.id)}>
          Delete
        </button>
      </span>
    </div>
  );
}
