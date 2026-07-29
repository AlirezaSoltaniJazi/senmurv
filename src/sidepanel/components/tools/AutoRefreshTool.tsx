import { useState } from 'react';
import type { ReactElement } from 'react';

interface Props {
  /** The current auto-refresh state (tab + interval), or null when off. */
  active: { tabId: number; seconds: number } | null;
  onStart: (seconds: number) => void;
  onStop: () => void;
}

const PRESETS = [5, 10, 30, 60];

/**
 * Auto-refresh: reload the started tab on a timer. The engine (interval) lives in
 * App so it survives switching panel tools; this is just its control surface.
 */
export function AutoRefreshTool({ active, onStart, onStop }: Props): ReactElement {
  const [seconds, setSeconds] = useState(active?.seconds ?? 30);
  const running = active !== null;

  return (
    <>
      <p className="hint">
        Reloads the tab that’s active when you press Start, every N seconds. It keeps running while
        you use other panel tools and stops when you press Stop or close the panel.
      </p>
      <div className="setting-row">
        <span className="setting-label">Interval (seconds)</span>
        <div className="chips">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className={seconds === p ? 'chip active' : 'chip'}
              disabled={running}
              onClick={() => setSeconds(p)}
            >
              {p}s
            </button>
          ))}
        </div>
        <input
          className="hud-seconds"
          type="number"
          min={1}
          max={3600}
          step={1}
          value={seconds}
          disabled={running}
          aria-label="Auto-refresh interval in seconds"
          onChange={(e) => {
            const n = Math.round(Number(e.target.value));
            if (Number.isFinite(n) && n > 0) setSeconds(Math.min(3600, n));
          }}
        />
      </div>
      <div className="row">
        {running ? (
          <button type="button" className="danger" onClick={onStop}>
            ■ Stop
          </button>
        ) : (
          <button type="button" className="primary" onClick={() => onStart(seconds)}>
            ▶ Start
          </button>
        )}
      </div>
      {active !== null && (
        <p className="status">Refreshing the started tab every {active.seconds}s.</p>
      )}
    </>
  );
}
