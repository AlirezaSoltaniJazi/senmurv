import { useCallback, useEffect } from 'react';
import type { Dispatch, ReactElement, SetStateAction } from 'react';
import { browser } from '@/shared/browser-api';
import { MESSAGE_TYPES } from '@/shared/constants';
import { parseLocatorInput } from '@/shared/locators';
import { isRuntimeMessage, sendRuntimeMessage } from '@/shared/messages';
import type { AccountLocatorSeed, MatchResult, Result } from '@/shared/types';
import { IconActionButton } from './IconActionButton';
import { LocatorKindToggle } from './LocatorKindToggle';
import { FrameworkChips, LocatorSuggestions } from './LocatorSuggestions';
import type { LocatorTabState } from '../locator-tab-state';

const ACCOUNT_TARGETS: { field: AccountLocatorSeed['field']; label: string }[] = [
  { field: 'username', label: 'Username field' },
  { field: 'password', label: 'Password field' },
  { field: 'loginButton', label: 'Login button' },
];

interface Props {
  state: LocatorTabState;
  setState: Dispatch<SetStateAction<LocatorTabState>>;
  /** Merge a query+kind into the Accounts tab's in-progress draft, without
   *  navigating there — the user may want to keep picking/testing here. */
  onAddToAccount: (seed: AccountLocatorSeed) => void;
}

export function LocatorTab({ state, setState, onAddToAccount }: Props): ReactElement {
  const {
    picking,
    result,
    error,
    filter,
    query,
    testCount,
    testKind,
    testedQuery,
    testError,
    highlighting,
    matchInfo,
  } = state;

  const update = useCallback(
    (patch: Partial<LocatorTabState>) => setState((prev) => ({ ...prev, ...patch })),
    [setState]
  );

  useEffect(() => {
    function onMessage(message: unknown): void {
      if (!isRuntimeMessage(message)) return;
      if (message.type === MESSAGE_TYPES.ELEMENT_PICKED) {
        update({ result: message.payload, picking: false });
      } else if (message.type === MESSAGE_TYPES.PICK_CANCELLED) {
        update({ picking: false });
      }
    }
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, [update]);

  // Tear the highlight mode down when the tab unmounts (a no-op if not active).
  useEffect(() => {
    return () => {
      void sendRuntimeMessage({
        type: MESSAGE_TYPES.STOP_TOOL_MODE,
        payload: { mode: 'match' },
      });
    };
  }, []);

  // Auto-detect CSS vs. XPath as the query changes (framework snippets, an
  // "xpath=" prefix, or a leading "//"), computed alongside the query update
  // rather than a separate effect (avoids a cascading render). The chip
  // still lets the user override this for the current query — e.g. when a
  // plain selector is ambiguous.
  function changeQuery(next: string): void {
    update({ query: next, testKind: parseLocatorInput(next).kind });
  }

  // Live re-highlight as the query changes while highlighting is on (debounced).
  useEffect(() => {
    if (!highlighting) return undefined;
    const id = setTimeout(() => {
      const parsed = parseLocatorInput(query);
      if (!parsed.query) return;
      update({ testedQuery: parsed.query });
      void (async () => {
        const res = await sendRuntimeMessage<Result<MatchResult>>({
          type: MESSAGE_TYPES.HIGHLIGHT_MATCHES,
          payload: { query: parsed.query, kind: testKind },
        });
        if (res.ok) {
          update({ matchInfo: res.value, testError: null });
        } else {
          update({ testError: res.error });
        }
      })();
    }, 300);
    return () => clearTimeout(id);
  }, [query, testKind, highlighting, update]);

  async function startPick(): Promise<void> {
    // Starting a pick switches the in-page mode, which the arbiter tears the
    // highlight down for — reflect that in the panel so the nav strip clears.
    update({ error: null, highlighting: false, matchInfo: null });
    const res = await sendRuntimeMessage<Result<void>>({ type: MESSAGE_TYPES.START_PICK });
    if (!res.ok) {
      update({ error: res.error });
      return;
    }
    update({ picking: true });
  }

  async function cancelPick(): Promise<void> {
    await sendRuntimeMessage<Result<void>>({ type: MESSAGE_TYPES.CANCEL_PICK });
    update({ picking: false });
  }

  async function runTest(): Promise<void> {
    update({ testError: null, testCount: null });
    const parsed = parseLocatorInput(query);
    if (!parsed.query) return;
    update({ testedQuery: parsed.query });
    const res = await sendRuntimeMessage<Result<{ count: number }>>({
      type: MESSAGE_TYPES.TEST_LOCATOR,
      payload: { query: parsed.query, kind: testKind },
    });
    if (res.ok) update({ testCount: res.value.count });
    else update({ testError: res.error });
  }

  async function toggleHighlight(): Promise<void> {
    if (highlighting) {
      update({ highlighting: false, matchInfo: null });
      await sendRuntimeMessage<Result<void>>({
        type: MESSAGE_TYPES.STOP_TOOL_MODE,
        payload: { mode: 'match' },
      });
      return;
    }
    update({ testError: null });
    const parsed = parseLocatorInput(query);
    if (!parsed.query) return;
    update({ testedQuery: parsed.query });
    const res = await sendRuntimeMessage<Result<MatchResult>>({
      type: MESSAGE_TYPES.HIGHLIGHT_MATCHES,
      payload: { query: parsed.query, kind: testKind },
    });
    if (res.ok) {
      update({ highlighting: true, matchInfo: res.value });
    } else {
      update({ testError: res.error });
    }
  }

  function addToAccount(field: AccountLocatorSeed['field']): void {
    const parsed = parseLocatorInput(query);
    if (!parsed.query) return;
    onAddToAccount({ query: parsed.query, kind: testKind, field });
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
      if (res.ok) update({ matchInfo: res.value });
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
          <LocatorKindToggle value={testKind} onChange={(kind) => update({ testKind: kind })} />
          <input
            id="loc-test"
            className="name-input"
            placeholder="mat-label, //button[@type='submit'], or paste a snippet"
            value={query}
            onChange={(e) => changeQuery(e.target.value)}
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
        {query.trim() !== '' && (
          <div className="row">
            <span className="hint">Add to account:</span>
            {ACCOUNT_TARGETS.map((target) => (
              <button key={target.field} type="button" onClick={() => addToAccount(target.field)}>
                {target.label}
              </button>
            ))}
          </div>
        )}
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

          <FrameworkChips filter={filter} onChange={(f) => update({ filter: f })} />
          <LocatorSuggestions suggestions={result.suggestions} filter={filter} />
        </>
      )}
    </div>
  );
}
