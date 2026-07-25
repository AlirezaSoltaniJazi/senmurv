import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { isRuntimeMessage, sendRuntimeMessage } from '@/shared/messages';
import {
  renderTabOrderReport,
  reportMimeType,
  tabOrderFilename,
} from '@/shared/tools/findings-report';
import type { ReportFormat } from '@/shared/tools/findings-report';
import type { LocatorSet, Result, TabIssue, TabOrderScan, TabStop } from '@/shared/types';
import { FrameworkChips, LocatorSuggestions } from '@/sidepanel/components/LocatorSuggestions';
import type { FrameworkFilter } from '@/sidepanel/components/LocatorSuggestions';

const ISSUE_LABEL: Record<TabIssue, string> = {
  'positive-tabindex': 'positive tabindex',
  'no-accessible-name': 'no name',
  offscreen: 'offscreen',
  'order-mismatch': 'order ≠ visual',
};

const FORMATS: ReportFormat[] = ['txt', 'csv', 'json'];

function StopRow({
  stop,
  expanded,
  locators,
  onToggle,
}: {
  stop: TabStop;
  expanded: boolean;
  locators: LocatorSet | null;
  onToggle: () => void;
}): ReactElement {
  const [filter, setFilter] = useState<FrameworkFilter>('all');
  return (
    <li className="locator-card">
      <button type="button" className="tool-row" onClick={onToggle}>
        <span className="swatch-row">
          <span className="badge">{stop.index}</span>
          <code>
            &lt;{stop.tag}&gt;
            {stop.tabindex > 0 ? ` tabindex=${stop.tabindex}` : ''}
          </code>
          {stop.name !== '' ? <span className="dim">“{stop.name}”</span> : null}
          {stop.inShadow && <span className="dim">shadow</span>}
        </span>
        {stop.issues.length > 0 && (
          <span className="chips">
            {stop.issues.map((i) => (
              <span className="count many" key={i}>
                {ISSUE_LABEL[i]}
              </span>
            ))}
          </span>
        )}
      </button>
      {expanded && locators !== null && (
        <>
          <FrameworkChips filter={filter} onChange={setFilter} />
          <LocatorSuggestions suggestions={locators.suggestions} filter={filter} />
        </>
      )}
    </li>
  );
}

export function TabOrderTool(): ReactElement {
  const [scan, setScan] = useState<TabOrderScan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [locators, setLocators] = useState<Record<number, LocatorSet>>({});

  const rescan = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const res = await sendRuntimeMessage<Result<TabOrderScan>>({
      type: MESSAGE_TYPES.SCAN_TAB_ORDER,
    });
    setBusy(false);
    if (res.ok) {
      setScan(res.value);
      setStale(false);
      setExpanded(null);
      setLocators({});
    } else {
      setError(res.error);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await rescan();
    })();
  }, [rescan]);

  useEffect(() => {
    function onMessage(message: unknown): void {
      if (!isRuntimeMessage(message)) return;
      if (message.type === MESSAGE_TYPES.TOOL_STREAM && message.payload.tool === 'taborder') {
        setStale(true);
      }
    }
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  async function toggle(index: number): Promise<void> {
    if (expanded === index) {
      setExpanded(null);
      return;
    }
    setExpanded(index);
    if (locators[index] === undefined) {
      const res = await sendRuntimeMessage<Result<LocatorSet>>({
        type: MESSAGE_TYPES.GET_STOP_LOCATORS,
        payload: { index },
      });
      if (res.ok) setLocators((prev) => ({ ...prev, [index]: res.value }));
    }
  }

  function download(format: ReportFormat): void {
    if (scan === null) return;
    const blob = new Blob([renderTabOrderReport(scan, format)], {
      type: reportMimeType(format),
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = tabOrderFilename(format);
    a.click();
    URL.revokeObjectURL(url);
  }

  const issueCount = scan?.stops.filter((s) => s.issues.length > 0).length ?? 0;

  return (
    <>
      <div className="row">
        <button type="button" className="primary" disabled={busy} onClick={() => void rescan()}>
          {scan === null ? 'Scan tab order' : 'Rescan'}
        </button>
        {scan !== null && (
          <span className="dim">
            {scan.stops.length} stops · {issueCount} with issues
          </span>
        )}
      </div>

      {error !== null && <p className="error">{error}</p>}
      {stale && (
        <p className="status">
          The page changed since the last scan.{' '}
          <button type="button" className="copy-btn" onClick={() => void rescan()}>
            Rescan
          </button>
        </p>
      )}

      {scan !== null && (
        <>
          <ul className="locator-list">
            {scan.stops.map((stop) => (
              <StopRow
                key={stop.index}
                stop={stop}
                expanded={expanded === stop.index}
                locators={locators[stop.index] ?? null}
                onToggle={() => void toggle(stop.index)}
              />
            ))}
          </ul>

          <h3 className="section-title">Export</h3>
          <div className="row">
            {FORMATS.map((f) => (
              <button key={f} type="button" onClick={() => download(f)}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>

          {scan.warnings.map((w) => (
            <p className="hint" key={w}>
              {w}
            </p>
          ))}
        </>
      )}
    </>
  );
}
