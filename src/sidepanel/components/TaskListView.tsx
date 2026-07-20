import type { ReactElement } from 'react';
import { dayLabel, formatDurationShort } from '@/shared/tasks';
import type { DayGroup } from '@/shared/tasks';
import type { TimeEntry } from '@/shared/types';
import { TaskRow } from './TaskRow';

interface TaskListViewProps {
  groups: DayGroup[];
  now: number;
  editingId: string | null;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSave: (entry: TimeEntry) => void;
  onDelete: (id: string) => void;
}

/** Day-grouped list of logged tasks, each day showing its total time. */
export function TaskListView({
  groups,
  now,
  editingId,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: TaskListViewProps): ReactElement {
  if (groups.length === 0) {
    return <p className="hint">No tasks logged yet. Start one above.</p>;
  }

  return (
    <div className="task-days">
      {groups.map((group) => (
        <div key={group.key} className="day-group">
          <div className="day-group-head">
            <span className="day-label">{dayLabel(group.key, now)}</span>
            <span className="day-total">{formatDurationShort(group.totalMs)}</span>
          </div>
          <ul className="task-list">
            {group.entries.map((entry) => (
              <TaskRow
                key={entry.id}
                entry={entry}
                now={now}
                isEditing={editingId === entry.id}
                onStartEdit={onStartEdit}
                onCancelEdit={onCancelEdit}
                onSave={onSave}
                onDelete={onDelete}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
