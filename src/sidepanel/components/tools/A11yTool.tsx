import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { sendRuntimeMessage } from '@/shared/messages';
import { a11yFilename, renderA11yReport, reportMimeType } from '@/shared/tools/findings-report';
import type { ReportFormat } from '@/shared/tools/findings-report';
import type { A11yFinding, A11yReport, LocatorSet, Result, WcagLevel } from '@/shared/types';
import { FrameworkChips, LocatorSuggestions } from '@/sidepanel/components/LocatorSuggestions';
import type { FrameworkFilter } from '@/sidepanel/components/LocatorSuggestions';

const LEVELS: WcagLevel[] = ['A', 'AA', 'AAA'];
const FORMATS: ReportFormat[] = ['txt', 'csv', 'json'];

/** Best CSS-usable selector from a locator set, for highlighting. */
function pickSelector(loc: LocatorSet): string | null {
  const css = loc.suggestions.find((s) => s.strategy === 'css');
  const rec = loc.suggestions.find((s) => s.recommended);
  return css?.value ?? rec?.value ?? null;
}

function FindingCard({ finding }: { finding: A11yFinding }): ReactElement {
  const [open, setOpen] = useState(false);
  const [locators, setLocators] = useState<LocatorSet | null>(null);
  const [filter, setFilter] = useState<FrameworkFilter>('all');

  async function toggle(): Promise<void> {
    const next = !open;
    setOpen(next);
    if (next && locators === null) {
      const res = await sendRuntimeMessage<Result<LocatorSet>>({
        type: MESSAGE_TYPES.GET_STOP_LOCATORS,
        payload: { source: 'a11y', index: finding.index },
      });
      if (res.ok) {
        setLocators(res.value);
        const selector = pickSelector(res.value);
        if (selector !== null) {
          void sendRuntimeMessage({
            type: MESSAGE_TYPES.HIGHLIGHT_ELEMENT,
            payload: { selector },
          });
        }
      }
    } else if (!next) {
      void sendRuntimeMessage({
        type: MESSAGE_TYPES.HIGHLIGHT_ELEMENT,
        payload: { selector: null },
      });
    }
  }

  const review = finding.confidence === 'needs-review';
  return (
    <li className="locator-card">
      <button type="button" className="tool-row" onClick={() => void toggle()}>
        <span className="swatch-row">
          <span className="badge">{finding.level}</span>
          <span className="dim">{finding.sc}</span>
          <span className={review ? 'count many' : 'count none'}>{review ? 'review' : 'fail'}</span>
          <span>{finding.message}</span>
        </span>
        <span className="dim">{finding.target}</span>
      </button>
      {open && (
        <>
          <p className="hint">
            {finding.howToFix}{' '}
            <a href={finding.helpUrl} target="_blank" rel="noreferrer">
              Learn more
            </a>
          </p>
          {locators !== null && (
            <>
              <FrameworkChips filter={filter} onChange={setFilter} />
              <LocatorSuggestions suggestions={locators.suggestions} filter={filter} />
            </>
          )}
        </>
      )}
    </li>
  );
}

export function A11yTool(): ReactElement {
  const [level, setLevel] = useState<WcagLevel>('AA');
  const [report, setReport] = useState<A11yReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const scan = useCallback(async (target: WcagLevel): Promise<void> => {
    setBusy(true);
    setError(null);
    const res = await sendRuntimeMessage<Result<A11yReport>>({
      type: MESSAGE_TYPES.RUN_A11Y_SCAN,
      payload: { levels: [target] },
    });
    setBusy(false);
    if (res.ok) setReport(res.value);
    else setError(res.error);
  }, []);

  useEffect(() => {
    void (async () => {
      await scan('AA');
    })();
  }, [scan]);

  // Clear any lingering highlight when the tool unmounts.
  useEffect(() => {
    return () => {
      void sendRuntimeMessage({
        type: MESSAGE_TYPES.HIGHLIGHT_ELEMENT,
        payload: { selector: null },
      });
    };
  }, []);

  function chooseLevel(next: WcagLevel): void {
    setLevel(next);
    void scan(next);
  }

  function download(format: ReportFormat): void {
    if (report === null) return;
    const blob = new Blob([renderA11yReport(report, format)], { type: reportMimeType(format) });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = a11yFilename(format);
    a.click();
    URL.revokeObjectURL(url);
  }

  const violations = report?.findings.filter((f) => f.confidence === 'violation') ?? [];
  const reviews = report?.findings.filter((f) => f.confidence === 'needs-review') ?? [];

  return (
    <>
      <div className="chips">
        {LEVELS.map((l) => (
          <button
            key={l}
            type="button"
            className={level === l ? 'chip active' : 'chip'}
            onClick={() => chooseLevel(l)}
          >
            {l}
          </button>
        ))}
        <button type="button" className="chip" disabled={busy} onClick={() => void scan(level)}>
          ↻ Rescan
        </button>
      </div>

      {error !== null && <p className="error">{error}</p>}

      {report !== null && (
        <>
          <div className="row">
            <span className="dim">
              {violations.length} failures · {reviews.length} to review ·{' '}
              {report.passedRules.length} checks passed
            </span>
          </div>

          {violations.length > 0 && (
            <>
              <h3 className="section-title">Failures</h3>
              <ul className="locator-list">
                {violations.map((f, i) => (
                  <FindingCard key={`${f.ruleId}-${f.index}-${i}`} finding={f} />
                ))}
              </ul>
            </>
          )}

          {reviews.length > 0 && (
            <>
              <h3 className="section-title">Needs review</h3>
              <ul className="locator-list">
                {reviews.map((f, i) => (
                  <FindingCard key={`${f.ruleId}-${f.index}-${i}`} finding={f} />
                ))}
              </ul>
            </>
          )}

          {violations.length === 0 && reviews.length === 0 && (
            <p className="status">No machine-detectable issues found at level {level}.</p>
          )}

          <h3 className="section-title">Export</h3>
          <div className="row">
            {FORMATS.map((f) => (
              <button key={f} type="button" onClick={() => download(f)}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>

          {report.warnings.map((w) => (
            <p className="hint" key={w}>
              {w}
            </p>
          ))}
        </>
      )}
    </>
  );
}
