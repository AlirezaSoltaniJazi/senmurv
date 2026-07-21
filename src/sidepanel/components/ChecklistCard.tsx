import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import {
  checklistProgress,
  deadlineLabel,
  deadlineStatus,
  isComplete,
  progressBar,
} from '@/shared/checklists';
import {
  entryDurationMs,
  formatDuration,
  fromLocalInputValue,
  toLocalInputValue,
} from '@/shared/tasks';
import type { Checklist, Subtask, TimeEntry } from '@/shared/types';

interface ChecklistCardProps {
  list: Checklist;
  now: number;
  /** The active Track timer started from this task, or null. */
  trackingEntry: TimeEntry | null;
  /** Look up the active timer tracking a given subtask, or null. */
  subTrackingFor: (subtaskId: string) => TimeEntry | null;
  isExpanded: boolean;
  isEditing: boolean;
  onToggleExpand: (id: string) => void;
  onToggleParent: (list: Checklist) => void;
  onToggleSubtask: (list: Checklist, subtaskId: string) => void;
  onAddSubtask: (list: Checklist, title: string) => void;
  onDeleteSubtask: (list: Checklist, subtaskId: string) => void;
  onStartTracking: () => void;
  onStartSubtaskTracking: (list: Checklist, subtask: Subtask) => void;
  onStopTracking: (entry: TimeEntry) => void;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (list: Checklist) => void;
  onDelete: (id: string) => void;
}

interface EditFormProps {
  list: Checklist;
  onSave: (list: Checklist) => void;
  onCancel: () => void;
}

/** Inline editor for a task's title + deadline (mounted only while editing). */
function ChecklistEditForm({ list, onSave, onCancel }: EditFormProps): ReactElement {
  const [title, setTitle] = useState(list.title);
  const [deadline, setDeadline] = useState(
    list.deadline !== null ? toLocalInputValue(list.deadline) : ''
  );
  const [error, setError] = useState<string | null>(null);

  function save(): void {
    setError(null);
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Title is required.');
      return;
    }
    let nextDeadline: number | null = null;
    if (deadline !== '') {
      const parsed = fromLocalInputValue(deadline);
      if (Number.isNaN(parsed)) {
        setError('Deadline is not a valid date/time.');
        return;
      }
      nextDeadline = parsed;
    }
    onSave({ ...list, title: trimmed, deadline: nextDeadline });
  }

  return (
    <div className="checklist-edit">
      <input
        className="name-input"
        placeholder="Task title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <label className="setting-label">Deadline (optional)</label>
      <input
        className="datetime-input"
        type="datetime-local"
        value={deadline}
        onChange={(e) => setDeadline(e.target.value)}
      />
      {error && <p className="error">{error}</p>}
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

/** One "my task": parent checkbox + progress + deadline, with a subtask list when expanded. */
export function ChecklistCard({
  list,
  now,
  trackingEntry,
  subTrackingFor,
  isExpanded,
  isEditing,
  onToggleExpand,
  onToggleParent,
  onToggleSubtask,
  onAddSubtask,
  onDeleteSubtask,
  onStartTracking,
  onStartSubtaskTracking,
  onStopTracking,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: ChecklistCardProps): ReactElement {
  const [newSubtask, setNewSubtask] = useState('');
  const parentRef = useRef<HTMLInputElement>(null);
  const progress = checklistProgress(list);
  const complete = isComplete(list);

  // Reflect partial completion as an indeterminate parent checkbox.
  useEffect(() => {
    if (parentRef.current) parentRef.current.indeterminate = progress.done > 0 && !complete;
  });

  if (isEditing) {
    return (
      <div className="checklist-card">
        <ChecklistEditForm list={list} onSave={onSaveEdit} onCancel={onCancelEdit} />
      </div>
    );
  }

  const { filled, empty } = progressBar(progress.percent);
  const status = deadlineStatus(list.deadline, now);

  function addSubtask(): void {
    const trimmed = newSubtask.trim();
    if (!trimmed) return;
    onAddSubtask(list, trimmed);
    setNewSubtask('');
  }

  return (
    <div className="checklist-card">
      <div className="checklist-head">
        <input
          ref={parentRef}
          type="checkbox"
          checked={complete}
          onChange={() => onToggleParent(list)}
          aria-label={complete ? 'Mark task incomplete' : 'Mark task complete'}
        />
        <button
          type="button"
          className="expand-toggle"
          onClick={() => onToggleExpand(list.id)}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
        >
          {isExpanded ? '▾' : '▸'}
        </button>
        <span className={complete ? 'checklist-title done' : 'checklist-title'}>{list.title}</span>
        {list.deadline !== null && (
          <span className={`deadline-badge is-${status}`}>{deadlineLabel(list.deadline, now)}</span>
        )}
        <span className="task-actions">
          <button type="button" onClick={() => onStartEdit(list.id)}>
            Edit
          </button>
          <button type="button" className="danger" onClick={() => onDelete(list.id)}>
            Delete
          </button>
        </span>
      </div>

      <div className="checklist-progress">
        <span className="bar">
          <span className="bar-fill">{'▓'.repeat(filled)}</span>
          <span className="bar-empty">{'░'.repeat(empty)}</span>
        </span>
        <span className="progress-pct">
          {progress.percent}% · {progress.done}/{progress.total}
        </span>
        <span className="track-control">
          {trackingEntry ? (
            <>
              <span className="running-elapsed">
                {formatDuration(entryDurationMs(trackingEntry, now))}
              </span>
              <button
                type="button"
                className="danger"
                onClick={() => onStopTracking(trackingEntry)}
              >
                ■ Stop
              </button>
            </>
          ) : complete ? null : (
            <button type="button" className="primary" onClick={onStartTracking}>
              ▶ Start
            </button>
          )}
        </span>
      </div>

      {isExpanded && (
        <div className="subtask-area">
          <ul className="subtask-list">
            {list.subtasks.length === 0 && <li className="hint">No subtasks yet.</li>}
            {list.subtasks.map((s) => {
              const subEntry = subTrackingFor(s.id);
              return (
                <li key={s.id} className="subtask-row">
                  <input
                    type="checkbox"
                    checked={s.done}
                    onChange={() => onToggleSubtask(list, s.id)}
                    aria-label={s.title}
                  />
                  <span className={s.done ? 'subtask-title done' : 'subtask-title'}>{s.title}</span>
                  <span className="track-control">
                    {subEntry ? (
                      <>
                        <span className="running-elapsed">
                          {formatDuration(entryDurationMs(subEntry, now))}
                        </span>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => onStopTracking(subEntry)}
                        >
                          ■ Stop
                        </button>
                      </>
                    ) : s.done ? null : (
                      <button
                        type="button"
                        className="primary"
                        onClick={() => onStartSubtaskTracking(list, s)}
                      >
                        ▶ Start
                      </button>
                    )}
                  </span>
                  <button
                    type="button"
                    className="remove"
                    onClick={() => onDeleteSubtask(list, s.id)}
                    aria-label="Delete subtask"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="row">
            <input
              className="name-input tag-input"
              placeholder="Add subtask"
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addSubtask();
              }}
            />
            <button type="button" onClick={addSubtask}>
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
