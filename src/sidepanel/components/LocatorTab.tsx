import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { FRAMEWORK_LABELS, FRAMEWORKS, MESSAGE_TYPES } from '@/shared/constants';
import { parseLocatorInput } from '@/shared/locators';
import { isRuntimeMessage, sendRuntimeMessage } from '@/shared/messages';
import type { Framework, LocatorKind, LocatorSet, Result } from '@/shared/types';
import { CopyButton } from './CopyButton';

type FrameworkFilter = Framework | 'all';

const FILTERS: { key: FrameworkFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  ...FRAMEWORKS.map((f) => ({ key: f, label: FRAMEWORK_LABELS[f] ?? f })),
];

function CountBadge({ count }: { count: number | undefined }): ReactElement | null {
  if (count === undefined) return null;
  if (count === 1) return <span className="count unique">unique</span>;
  if (count === 0) return <span className="count none">no match</span>;
  return <span className="count many">{count} matches</span>;
}

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

          <div className="chips">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={filter === f.key ? 'chip active' : 'chip'}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <ul className="locator-list">
            {result.suggestions.map((s) => {
              const shown =
                filter === 'all' ? s.snippets : s.snippets.filter((sn) => sn.framework === filter);
              return (
                <li key={`${s.strategy}-${s.value}`} className="locator-card">
                  <div className="locator-head">
                    <span className="locator-label">{s.label}</span>
                    {s.recommended && <span className="badge">recommended</span>}
                    <CountBadge count={s.matchCount} />
                    <span className={`quality q-${s.quality}`}>{s.quality}</span>
                  </div>
                  <div className="locator-value">
                    <code>{s.value}</code>
                    <CopyButton text={s.value} />
                  </div>
                  {shown.length > 0 && (
                    <ul className="snippet-list">
                      {shown.map((sn) => (
                        <li key={`${sn.framework}-${sn.label}`} className="snippet-row">
                          <div className="snippet-head">
                            <span className="snippet-fw">
                              {FRAMEWORK_LABELS[sn.framework] ?? sn.framework}
                            </span>
                            <span className="snippet-label">{sn.label}</span>
                            <CopyButton text={sn.code} />
                          </div>
                          <code className="snippet-code">{sn.code}</code>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
