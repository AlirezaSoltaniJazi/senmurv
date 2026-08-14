import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { parseLocatorInput } from '@/shared/locators';
import { isRuntimeMessage, sendRuntimeMessage } from '@/shared/messages';
import type { LocatorKind, LocatorSet, MatchResult, Result } from '@/shared/types';
import { IconActionButton } from './IconActionButton';
import { FrameworkChips, LocatorSuggestions } from './LocatorSuggestions';
import type { FrameworkFilter } from './LocatorSuggestions';

export function LocatorTab(): ReactElement {
  const [picking, setPicking] = useState(false);
  const [result, setResult] = useState<LocatorSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FrameworkFilter>('all');

  // "Test a locator" state.
  const [query, setQuery] = useState('');
  const [testCount, setTestCount] = useState<number | null>(null);
  const [testKind, setTestKind] = useState<LocatorKind>('css');
  const [testedQuery, setTestedQuery] = useState('');
  const [testError, setTestError] = useState<string | null>(null);
  const [highlighting, setHighlighting] = useState(false);
  const [matchInfo, setMatchInfo] = useState<MatchResult | null>(null);

  useEffect(() => {
    function onMessage(message: unknown): void {
      if (!isRuntimeMessage(message)) return;
      if (message.type === MESSAGE_TYPES.ELEMENT_PICKED) {
        setResult(message.payload);
        setPicking(false);
      } else if (message.type === MESSAGE_TYPES.PICK_CANCELLED) {
        setPicking(false);
      }
    }
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  // Tear the highlight mode down when the tab unmounts (a no-op if not active).
  useEffect(() => {
    return () => {
      void sendRuntimeMessage({
        type: MESSAGE_TYPES.STOP_TOOL_MODE,
        payload: { mode: 'match' },
      });
    };
  }, []);

  // Live re-highlight as the query changes while highlighting is on (debounced).
  useEffect(() => {
    if (!highlighting) return undefined;
    const id = setTimeout(() => {
      const parsed = parseLocatorInput(query);
      if (!parsed.query) return;
      setTestKind(parsed.kind);
      setTestedQuery(parsed.query);
      void (async () => {
        const res = await sendRuntimeMessage<Result<MatchResult>>({
          type: MESSAGE_TYPES.HIGHLIGHT_MATCHES,
          payload: { query: parsed.query, kind: parsed.kind },
        });
        if (res.ok) {
          setMatchInfo(res.value);
          setTestError(null);
        } else {
          setTestError(res.error);
        }
      })();
    }, 300);
    return () => clearTimeout(id);
  }, [query, highlighting]);

  async function startPick(): Promise<void> {
    setError(null);
    // Starting a pick switches the in-page mode, which the arbiter tears the
    // highlight down for — reflect that in the panel so the nav strip clears.
    setHighlighting(false);
    setMatchInfo(null);
    const res = await sendRuntimeMessage<Result<void>>({ type: MESSAGE_TYPES.START_PICK });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPicking(true);
  }

  async function cancelPick(): Promise<void> {
    await sendRuntimeMessage<Result<void>>({ type: MESSAGE_TYPES.CANCEL_PICK });
    setPicking(false);
  }

  async function runTest(): Promise<void> {
    setTestError(null);
    setTestCount(null);
    const parsed = parseLocatorInput(query);
    if (!parsed.query) return;
    setTestKind(parsed.kind);
    setTestedQuery(parsed.query);
    const res = await sendRuntimeMessage<Result<{ count: number }>>({
      type: MESSAGE_TYPES.TEST_LOCATOR,
      payload: { query: parsed.query, kind: parsed.kind },
    });
    if (res.ok) setTestCount(res.value.count);
    else setTestError(res.error);
  }

  async function toggleHighlight(): Promise<void> {
    if (highlighting) {
      setHighlighting(false);
      setMatchInfo(null);
      await sendRuntimeMessage<Result<void>>({
        type: MESSAGE_TYPES.STOP_TOOL_MODE,
        payload: { mode: 'match' },
      });
      return;
    }
    setTestError(null);
    const parsed = parseLocatorInput(query);
    if (!parsed.query) return;
    setTestKind(parsed.kind);
    setTestedQuery(parsed.query);
    const res = await sendRuntimeMessage<Result<MatchResult>>({
      type: MESSAGE_TYPES.HIGHLIGHT_MATCHES,
      payload: { query: parsed.query, kind: parsed.kind },
    });
    if (res.ok) {
      setHighlighting(true);
      setMatchInfo(res.value);
    } else {
      setTestError(res.error);
    }
  }

  /** Scroll to the previous/next match (delta ±1), wrapping around. */
  function stepMatch(delta: number): void {
    if (!matchInfo || matchInfo.shown === 0) return;
    const current = matchInfo.selected + 1; // 1-based; 0 when nothing is selected
    let next = current + delta;
    if (next < 1) next = matchInfo.shown;
    if (next > matchInfo.shown) next = 1;
    void (async () => {
      const res = await sendRuntimeMessage<Result<MatchResult>>({
        type: MESSAGE_TYPES.SCROLL_TO_MATCH,
        payload: { index: next },
      });
      if (res.ok) setMatchInfo(res.value);
    })();
  }

  return (
    <div className="tab">
      <div className="row">
        {picking ? (
          <IconActionButton
            icon="✕"
            label="Cancel pick (Esc)"
            className="primary"
            onClick={() => void cancelPick()}
          />
        ) : (
          <IconActionButton
            icon="⌖"
            label="Pick element"
            className="primary"
            onClick={() => void startPick()}
          />
        )}
      </div>
      {picking && <p className="hint">Hover the page and click an element…</p>}
      {error && <p className="error">{error}</p>}

      {/* Test a locator */}
      <div className="test-locator">
        <label className="field-label" htmlFor="loc-test">
          Test a locator
        </label>
        <div className="row">
          <input
            id="loc-test"
            className="name-input"
            placeholder="mat-label, //button[@type='submit'], or paste a snippet"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runTest();
            }}
          />
          <button type="button" className="primary" onClick={() => void runTest()}>
            Test
          </button>
          <button
            type="button"
            className={highlighting ? 'primary' : ''}
            onClick={() => void toggleHighlight()}
          >
            {highlighting ? 'Clear' : 'Highlight'}
          </button>
        </div>
        {testCount !== null && (
          <p className={testCount === 1 ? 'status' : 'hint'}>
            {testCount === 0
              ? 'No elements match.'
              : testCount === 1
                ? '1 element — unique ✓'
                : `${testCount} elements match — not unique`}{' '}
            <span className="dim">
              ({testKind}: <code>{testedQuery}</code>)
            </span>
          </p>
        )}
        {highlighting && matchInfo && (
          <div className="row match-nav">
            {matchInfo.count === 0 ? (
              <span className="hint">No elements match — nothing to highlight.</span>
            ) : (
              <>
                <button type="button" onClick={() => stepMatch(-1)} aria-label="Previous match">
                  ‹
                </button>
                <span className="hint">
                  {matchInfo.selected >= 0
                    ? `match ${matchInfo.selected + 1} of ${matchInfo.shown}`
                    : `${matchInfo.shown} highlighted`}
                </span>
                <button type="button" onClick={() => stepMatch(1)} aria-label="Next match">
                  ›
                </button>
                {matchInfo.count > matchInfo.shown && (
                  <span className="dim">
                    (first {matchInfo.shown} of {matchInfo.count})
                  </span>
                )}
              </>
            )}
          </div>
        )}
        {testError && <p className="error">{testError}</p>}
      </div>

      {result && (
        <>
          <div className="element-info">
            <code>&lt;{result.element.tagName}&gt;</code>
            {result.element.textPreview && (
              <span className="text-preview">“{result.element.textPreview}”</span>
            )}
            {result.element.attributesPreview && (
              <div className="attrs">{result.element.attributesPreview}</div>
            )}
          </div>

          <FrameworkChips filter={filter} onChange={setFilter} />
          <LocatorSuggestions suggestions={result.suggestions} filter={filter} />
        </>
      )}
    </div>
  );
}
