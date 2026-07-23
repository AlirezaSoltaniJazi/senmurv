import type { ReactElement } from 'react';
import { formatDuration, runTimeRange, tagColorClass } from '@/shared/tasks';
import type { TaskBlock } from '@/shared/tasks';
import type { TimeEntry } from '@/shared/types';
import { TaskRow } from './TaskRow';

interface TaskBlockViewProps {
  block: TaskBlock;
  dayKey: string;
  now: number;
  expanded: Set<string>;
  editingId: string | null;
  /** Existing titles/tags for the inline editor's typeahead. */
  titleOptions: string[];
  tagOptions: string[];
  onToggleExpand: (key: string) => void;
  onRerun: (entry: TimeEntry) => void;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSave: (entry: TimeEntry) => void;
  onDelete: (id: string) => void;
}

/**
 * A day's block for one task: a plain row for a single-run task, or an
 * expandable "main task" grouping every run of a re-run lineage that day.
 */
export function TaskBlockView({
  block,
  dayKey,
  now,
  expanded,
  editingId,
  titleOptions,
  tagOptions,
  onToggleExpand,
  onRerun,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: TaskBlockViewProps): ReactElement {
  if (!block.multiRun) {
    const entry = block.runs[0]!;
    return (
      <TaskRow
        entry={entry}
        now={now}
        isEditing={editingId === entry.id}
        titleOptions={titleOptions}
        tagOptions={tagOptions}
        onRerun={onRerun}
        onStartEdit={onStartEdit}
        onCancelEdit={onCancelEdit}
        onSave={onSave}
        onDelete={onDelete}
      />
    );
  }

  const key = `${dayKey}|${block.rootId}`;
  const isOpen = expanded.has(key);
  return (
    <div className="task-group">
      <div className="task-group-head">
        <button
          type="button"
          className="expand-toggle"
          onClick={() => onToggleExpand(key)}
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Collapse runs' : 'Expand runs'}
        >
          {isOpen ? '▾' : '▸'}
        </button>
        <span className={`task-tag ${tagColorClass(block.tag)}`}>{block.tag || 'untagged'}</span>
        <span className="task-title">{block.title}</span>
        <span className="task-runcount">{block.runs.length}×</span>
        <span className="task-duration">{formatDuration(block.totalMs)}</span>
        <span className="task-actions">
          <button type="button" onClick={() => onRerun(block.runs[0]!)}>
            ↻ Re-run
          </button>
        </span>
      </div>
      {isOpen && (
        <div className="task-children">
          {block.runs.map((run) => (
            <TaskRow
              key={run.id}
              entry={run}
              now={now}
              isEditing={editingId === run.id}
              runLabel={runTimeRange(run)}
              titleOptions={titleOptions}
              tagOptions={tagOptions}
              onStartEdit={onStartEdit}
              onCancelEdit={onCancelEdit}
              onSave={onSave}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
