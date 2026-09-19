import { useState } from 'react';
import type { ReactElement } from 'react';
import { CASE_OPTIONS, convertCase } from '@/shared/tools/case-convert';
import { CopyButton } from '@/sidepanel/components/CopyButton';

const SAMPLE = 'The Quick Brown Fox Jumps Over the Lazy Dog';

export function CaseConvertTool(): ReactElement {
  const [input, setInput] = useState('');

  return (
    <>
      <p className="hint">
        Paste text, then pick a case style to convert it in place. Everything runs locally — nothing
        is sent anywhere.
      </p>
      <textarea
        className="name-input"
        style={{ width: '100%', minHeight: '90px', resize: 'vertical' }}
        placeholder="Paste or type some text…"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        spellCheck={false}
      />
      <div className="chips">
        {CASE_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            className="chip"
            onClick={() => setInput((current) => convertCase(current, opt.key))}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="row">
        <button type="button" onClick={() => setInput(SAMPLE)}>
          Sample
        </button>
        <button type="button" onClick={() => setInput('')}>
          Clear
        </button>
        <CopyButton text={input} className="copy-btn-lg" />
      </div>
    </>
  );
}
