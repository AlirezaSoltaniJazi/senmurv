import type { ReactElement } from 'react';
import { dayLabel, formatDurationShort } from '@/shared/tasks';
import type { DayBlocks } from '@/shared/tasks';
import type { TimeEntry } from '@/shared/types';
import { TaskBlockView } from './TaskBlockView';

interface TaskListViewProps {
  days: DayBlocks[];
  now: number;
  expanded: Set<string>;
  editingId: string | null;
  onToggleExpand: (key: string) => void;
  onRerun: (entry: TimeEntry) => void;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSave: (entry: TimeEntry) => void;
  onDelete: (id: string) => void;
}

/** Day-grouped list of logged tasks, each day showing its total time. */
export function TaskListView({
  days,
  now,
  expanded,
  editingId,
  onToggleExpand,
  onRerun,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: TaskListViewProps): ReactElement {
  if (days.length === 0) {
    return <p className="hint">No tasks logged yet. Start one above.</p>;
  }

  return (
    <div className="task-days">
      {days.map((day) => (
        <div key={day.key} className="day-group">
          <div className="day-group-head">
            <span className="day-label">{dayLabel(day.key, now)}</span>
            <span className="day-total">{formatDurationShort(day.totalMs)}</span>
          </div>
          <div className="task-list">
            {day.blocks.map((block) => (
              <TaskBlockView
                key={block.rootId}
                block={block}
                dayKey={day.key}
                now={now}
                expanded={expanded}
                editingId={editingId}
                onToggleExpand={onToggleExpand}
                onRerun={onRerun}
                onStartEdit={onStartEdit}
                onCancelEdit={onCancelEdit}
                onSave={onSave}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
