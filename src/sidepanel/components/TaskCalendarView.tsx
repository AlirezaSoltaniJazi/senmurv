import type { ReactElement } from 'react';
import {
  dayKey,
  dayLabel,
  dayTags,
  formatDurationShort,
  monthLabel,
  tagColorClass,
} from '@/shared/tasks';
import type { DayBlocks, MonthGrid } from '@/shared/tasks';
import type { TimeEntry } from '@/shared/types';
import { TaskBlockView } from './TaskBlockView';

interface TaskCalendarViewProps {
  entries: TimeEntry[];
  dayBlocks: DayBlocks[];
  grid: MonthGrid;
  totals: Map<string, number>;
  now: number;
  selectedDay: string | null;
  expanded: Set<string>;
  editingId: string | null;
  onSelectDay: (key: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToggleExpand: (key: string) => void;
  onRerun: (entry: TimeEntry) => void;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSave: (entry: TimeEntry) => void;
  onDelete: (id: string) => void;
}

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const MAX_CELL_DOTS = 4;

/** Month grid of per-day totals; clicking a day reveals that day's task list. */
export function TaskCalendarView({
  entries,
  dayBlocks,
  grid,
  totals,
  now,
  selectedDay,
  expanded,
  editingId,
  onSelectDay,
  onPrevMonth,
  onNextMonth,
  onToggleExpand,
  onRerun,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: TaskCalendarViewProps): ReactElement {
  const todayKey = dayKey(now);
  const cells = grid.weeks.flat();
  const selected = selectedDay ? dayBlocks.find((d) => d.key === selectedDay) : undefined;

  return (
    <div className="calendar">
      <div className="calendar-head">
        <button type="button" onClick={onPrevMonth} aria-label="Previous month">
          ‹
        </button>
        <span className="calendar-month">{monthLabel(grid.year, grid.month)}</span>
        <button type="button" onClick={onNextMonth} aria-label="Next month">
          ›
        </button>
      </div>

      <div className="calendar-weekdays">
        {WEEKDAY_HEADERS.map((d) => (
          <span key={d} className="calendar-weekday">
            {d}
          </span>
        ))}
      </div>

      <div className="calendar-grid">
        {cells.map((cell) => {
          const total = totals.get(cell.key) ?? 0;
          const cellTags = dayTags(entries, cell.key);
          const classes = ['calendar-cell'];
          if (!cell.inMonth) classes.push('other-month');
          if (cell.key === todayKey) classes.push('today');
          if (cell.key === selectedDay) classes.push('selected');
          return (
            <button
              type="button"
              key={cell.key}
              className={classes.join(' ')}
              onClick={() => onSelectDay(cell.key)}
            >
              <span className="calendar-daynum">{cell.date.getDate()}</span>
              {total > 0 && <span className="calendar-total">{formatDurationShort(total)}</span>}
              {cellTags.length > 0 && (
                <span className="calendar-dots">
                  {cellTags.slice(0, MAX_CELL_DOTS).map((t) => (
                    <span key={t} className={`tag-dot ${tagColorClass(t)}`} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <div className="day-group">
          <div className="day-group-head">
            <span className="day-label">{dayLabel(selectedDay, now)}</span>
            <span className="day-total">{formatDurationShort(selected?.totalMs ?? 0)}</span>
          </div>
          {!selected || selected.blocks.length === 0 ? (
            <p className="hint">No tasks on this day.</p>
          ) : (
            <div className="task-list">
              {selected.blocks.map((block) => (
                <TaskBlockView
                  key={block.rootId}
                  block={block}
                  dayKey={selectedDay}
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
          )}
        </div>
      )}
    </div>
  );
}
