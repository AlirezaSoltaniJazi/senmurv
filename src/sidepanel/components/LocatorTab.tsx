import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, ReactElement, SetStateAction } from 'react';
import { browser } from '@/shared/browser-api';
import { MESSAGE_TYPES } from '@/shared/constants';
import { DEFAULT_GROUP_NAME, existingGroupNames } from '@/shared/accounts';
import { parseLocatorInput } from '@/shared/locators';
import { isRuntimeMessage, sendRuntimeMessage } from '@/shared/messages';
import type { Account, AccountLocatorSeed, LocatorKind, MatchResult, Result } from '@/shared/types';
import { IconActionButton } from './IconActionButton';
import { LocatorKindToggle } from './LocatorKindToggle';
import { FrameworkChips, LocatorSuggestions } from './LocatorSuggestions';
import type { LocatorTabState } from '../locator-tab-state';

const ACCOUNT_TARGETS: { field: AccountLocatorSeed['field']; label: string }[] = [
  { field: 'username', label: 'Username field' },
  { field: 'password', label: 'Password field' },
  { field: 'loginButton', label: 'Login button' },
  { field: 'otp', label: 'OTP field' },
  { field: 'confirmOtpButton', label: 'Confirm OTP button' },
];

interface Props {
  state: LocatorTabState;
  setState: Dispatch<SetStateAction<LocatorTabState>>;
  /** Merge a query+kind into the Accounts tab's in-progress draft, without
   *  navigating there — the user may want to keep picking/testing here. */
  onAddToAccount: (seed: AccountLocatorSeed) => void;
  /** Apply a query+kind directly to an EXISTING saved account (as opposed to
   *  the in-progress editor draft `onAddToAccount` seeds) — persisted right
   *  away, no editor involved. */
  onApplyToAccount: (id: string, seed: AccountLocatorSeed) => Promise<Result<void>>;
  /** Cap on drawn match badges when highlighting every match of a query. */
  matchHighlightMax: number;
  /** Seconds the "Added!" confirmation stays visible after adding to an account. */
  addedConfirmSeconds: number;
}

export function LocatorTab({
  state,
  setState,
  onAddToAccount,
  onApplyToAccount,
  matchHighlightMax,
  addedConfirmSeconds,
}: Props): ReactElement {
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

  // Existing accounts, for the "Add to account" group + target-account
  // pickers — fetched once; this tab has no other reason to hold the list.
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [existingGroups, setExistingGroups] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  // '' means "seed a new (or the currently-open) draft"; otherwise the id of
  // an existing account to apply the locator to directly.
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [addedMessage, setAddedMessage] = useState<string | null>(null);
  const addedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = useCallback(
    (patch: Partial<LocatorTabState>) => setState((prev) => ({ ...prev, ...patch })),
    [setState]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await sendRuntimeMessage<Result<Account[]>>({ type: MESSAGE_TYPES.GET_ACCOUNTS });
      if (!cancelled && res.ok) {
        setAccounts(res.value);
        setExistingGroups(existingGroupNames(res.value));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Existing accounts in the currently-selected group scope (blank ==
  // Default, same fallback every other group operation uses) — offered in
  // the target-account picker alongside "(new account)".
  const itemsInGroup = accounts.filter(
    (a) => (a.group?.trim() || DEFAULT_GROUP_NAME) === (selectedGroup.trim() || DEFAULT_GROUP_NAME)
  );

  useEffect(() => {
    return () => {
      if (addedTimerRef.current !== null) clearTimeout(addedTimerRef.current);
    };
  }, []);

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
          payload: { query: parsed.query, kind: testKind, maxHighlight: matchHighlightMax },
        });
        if (res.ok) {
          update({ matchInfo: res.value, testError: null });
        } else {
          update({ testError: res.error });
        }
      })();
    }, 300);
    return () => clearTimeout(id);
  }, [query, testKind, highlighting, update, matchHighlightMax]);

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

  /** Fill the Test-a-locator box with `q`/`kind` and run it immediately —
   *  shared by the manual Test button and each suggestion's own Test button. */
  async function testValue(q: string, kind: LocatorKind): Promise<void> {
    update({ query: q, testKind: kind, testedQuery: q, testError: null, testCount: null });
    const res = await sendRuntimeMessage<Result<{ count: number }>>({
      type: MESSAGE_TYPES.TEST_LOCATOR,
      payload: { query: q, kind },
    });
    if (res.ok) update({ testCount: res.value.count });
    else update({ testError: res.error });
  }

  async function runTest(): Promise<void> {
    const parsed = parseLocatorInput(query);
    if (!parsed.query) return;
    await testValue(parsed.query, testKind);
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
      payload: { query: parsed.query, kind: testKind, maxHighlight: matchHighlightMax },
    });
    if (res.ok) {
      update({ highlighting: true, matchInfo: res.value });
    } else {
      update({ testError: res.error });
    }
  }

  function showAdded(message: string): void {
    if (addedTimerRef.current !== null) clearTimeout(addedTimerRef.current);
    setAddedMessage(message);
    addedTimerRef.current = setTimeout(() => setAddedMessage(null), addedConfirmSeconds * 1000);
  }

  async function addToAccount(field: AccountLocatorSeed['field']): Promise<void> {
    const parsed = parseLocatorInput(query);
    if (!parsed.query) return;
    const label = ACCOUNT_TARGETS.find((t) => t.field === field)?.label ?? field;

    if (selectedAccountId !== '') {
      const target = accounts.find((a) => a.id === selectedAccountId);
      const seed: AccountLocatorSeed = { query: parsed.query, kind: testKind, field };
      const res = await onApplyToAccount(selectedAccountId, seed);
      if (!res.ok) {
        update({ error: res.error });
        return;
      }
      showAdded(`Added to ${label} on "${target?.name || target?.address || 'account'}".`);
      return;
    }

    const seed: AccountLocatorSeed = { query: parsed.query, kind: testKind, field };
    const group = selectedGroup.trim();
    if (group !== '') seed.group = group;
    onAddToAccount(seed);
    showAdded(`Added to ${label}${group !== '' ? ` (group: ${group})` : ''}.`);
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
              <button
                key={target.field}
                type="button"
                onClick={() => void addToAccount(target.field)}
              >
                {target.label}
              </button>
            ))}
            {existingGroups.length > 0 && (
              <select
                aria-label="Target group"
                value={selectedGroup}
                onChange={(e) => {
                  setSelectedGroup(e.target.value);
                  setSelectedAccountId('');
                }}
              >
                <option value="">(current group)</option>
                {existingGroups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            )}
            {itemsInGroup.length > 0 && (
              <select
                aria-label="Target account"
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
              >
                <option value="">(new account)</option>
                {itemsInGroup.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || a.address}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        {addedMessage !== null && <p className="status">{addedMessage}</p>}
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
          <LocatorSuggestions
            suggestions={result.suggestions}
            filter={filter}
            onTest={(q, kind) => void testValue(q, kind)}
          />
        </>
      )}
    </div>
  );
}
