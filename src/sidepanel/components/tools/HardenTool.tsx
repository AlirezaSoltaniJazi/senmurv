import { useState } from 'react';
import type { ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { parseLocatorInput } from '@/shared/locators';
import { sendRuntimeMessage } from '@/shared/messages';
import { scoreSelector } from '@/shared/tools/selector-score';
import type { SelectorScore } from '@/shared/tools/selector-score';
import type { LocatorKind, LocatorSet, LocatorSuggestion, Result } from '@/shared/types';
import { CopyButton } from '@/sidepanel/components/CopyButton';
import { FrameworkChips, LocatorSuggestions } from '@/sidepanel/components/LocatorSuggestions';
import type { FrameworkFilter } from '@/sidepanel/components/LocatorSuggestions';

interface Hardened {
  readonly query: string;
  readonly kind: LocatorKind;
  readonly score: SelectorScore;
  readonly set: LocatorSet;
  readonly count: number;
}

function ScoreBadge({ score }: { score: SelectorScore }): ReactElement {
  return (
    <span className={`quality q-${score.quality}`}>
      {score.score} / 100 · {score.quality}
    </span>
  );
}

function Result_({ result }: { result: Hardened }): ReactElement {
  const [filter, setFilter] = useState<FrameworkFilter>('all');
  const recommended: LocatorSuggestion | undefined =
    result.set.suggestions.find((s) => s.recommended) ?? result.set.suggestions[0];

  return (
    <>
      <h3 className="section-title">Your selector</h3>
      <div className="snippet-row">
        <div className="snippet-head">
          <ScoreBadge score={result.score} />
          {result.count > 1 && (
            <span className="dim">matches {result.count} — hardened from the first</span>
          )}
        </div>
        <code className="snippet-code">{result.query}</code>
      </div>
      {result.score.flags.length > 0 && (
        <div className="chips">
          {result.score.flags.map((f) => (
            <span key={f.id} className="chip danger" title={f.detail}>
              {f.label}
            </span>
          ))}
        </div>
      )}

      {recommended && (
        <>
          <h3 className="section-title">Hardened →</h3>
          <div className="snippet-row">
            <div className="snippet-head">
              <span className="snippet-fw">{recommended.label}</span>
              <span className={`quality q-${recommended.quality}`}>{recommended.quality}</span>
              <CopyButton text={recommended.value} />
            </div>
            <code className="snippet-code">{recommended.value}</code>
          </div>
        </>
      )}

      <h3 className="section-title">All locators</h3>
      <FrameworkChips filter={filter} onChange={setFilter} />
      <LocatorSuggestions suggestions={result.set.suggestions} filter={filter} />
    </>
  );
}

export function HardenTool(): ReactElement {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<Hardened | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function harden(): Promise<void> {
    setError(null);
    setResult(null);
    const parsed = parseLocatorInput(input);
    if (!parsed.query) return;
    const score = scoreSelector(parsed.query, parsed.kind);
    const res = await sendRuntimeMessage<Result<{ set: LocatorSet; count: number }>>({
      type: MESSAGE_TYPES.RESOLVE_SELECTOR,
      payload: { query: parsed.query, kind: parsed.kind },
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResult({
      query: parsed.query,
      kind: parsed.kind,
      score,
      set: res.value.set,
      count: res.value.count,
    });
  }

  return (
    <>
      <p className="hint">
        Paste a fragile selector — a DevTools “Copy selector” chain, a long <code>nth-child</code>{' '}
        CSS, or an absolute XPath — to see why it will break and get the robust replacement the
        picker would recommend. It resolves against the current page.
      </p>
      <textarea
        className="name-input"
        style={{ width: '100%', minHeight: '60px', fontFamily: 'monospace', resize: 'vertical' }}
        placeholder="#app > div:nth-child(2) > ul > li:nth-child(3)"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        spellCheck={false}
      />
      <div className="row">
        <button type="button" className="primary" onClick={() => void harden()}>
          Harden
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {result && <Result_ result={result} />}
    </>
  );
}
