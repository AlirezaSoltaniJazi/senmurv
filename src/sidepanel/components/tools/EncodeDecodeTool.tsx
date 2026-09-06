import { useState } from 'react';
import type { ReactElement } from 'react';
import { decodeText, encodeText, ENCODING_OPTIONS } from '@/shared/tools/encode-decode';
import type { EncodingKind } from '@/shared/tools/encode-decode';
import type { Result } from '@/shared/types';
import { CopyButton } from '@/sidepanel/components/CopyButton';

const SAMPLE = 'Hello, World! <café & friends>';

export function EncodeDecodeTool(): ReactElement {
  const [input, setInput] = useState('');
  const [format, setFormat] = useState<EncodingKind>('base64');
  const [error, setError] = useState<string | null>(null);

  const apply = (next: Result<string>): void => {
    if (next.ok) {
      setInput(next.value);
      setError(null);
    } else {
      setError(next.error);
    }
  };

  return (
    <>
      <p className="hint">
        Paste text, pick a format, then encode or decode it in place. Everything runs locally —
        nothing is sent anywhere.
      </p>
      <textarea
        className="name-input"
        style={{ width: '100%', minHeight: '90px', resize: 'vertical' }}
        placeholder="Paste or type some text…"
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setError(null);
        }}
        spellCheck={false}
      />
      <div className="chips">
        {ENCODING_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            className={format === opt.key ? 'chip active' : 'chip'}
            onClick={() => {
              setFormat(opt.key);
              setError(null);
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="row">
        <button type="button" className="primary" onClick={() => apply(encodeText(input, format))}>
          Encode →
        </button>
        <button type="button" onClick={() => apply(decodeText(input, format))}>
          ← Decode
        </button>
        <button type="button" onClick={() => setInput(SAMPLE)}>
          Sample
        </button>
        <button
          type="button"
          onClick={() => {
            setInput('');
            setError(null);
          }}
        >
          Clear
        </button>
        <CopyButton text={input} className="copy-btn-lg" />
      </div>
      {error !== null && <p className="error">{error}</p>}
    </>
  );
}
