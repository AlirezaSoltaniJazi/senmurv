import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { parseLocatorInput } from '@/shared/locators';
import { isRuntimeMessage, sendRuntimeMessage } from '@/shared/messages';
import type { LocatorKind, LocatorSet, Result } from '@/shared/types';
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

  async function startPick(): Promise<void> {
    setError(null);
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

  return (
    <div className="tab">
      <div className="row">
        {picking ? (
          <button type="button" className="primary" onClick={() => void cancelPick()}>
            Cancel pick (Esc)
          </button>
        ) : (
          <button type="button" className="primary" onClick={() => void startPick()}>
            Pick element
          </button>
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
