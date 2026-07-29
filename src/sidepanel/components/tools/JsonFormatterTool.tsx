import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { formatJson, jsonKind, minifyJson, parseJson } from '@/shared/tools/json-format';
import type { JsonKind } from '@/shared/tools/json-format';
import type { Result } from '@/shared/types';
import { CopyButton } from '@/sidepanel/components/CopyButton';

const SAMPLE =
  '{"name":"Ada Lovelace","age":36,"skills":["maths","code"],"active":true,"meta":{"id":1,"tags":null}}';

/** Ordered [key, value] pairs of an object/array; empty for a primitive. */
function entriesOf(value: unknown): [string, unknown][] {
  if (Array.isArray(value)) return value.map((v, i) => [String(i), v] as [string, unknown]);
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>);
  }
  return [];
}

/** One-line summary of a branch node, e.g. "{} 3 keys" / "[] 2 items". */
function summarize(value: unknown, kind: JsonKind): string {
  const n = entriesOf(value).length;
  return kind === 'array'
    ? `[ ] ${n} item${n === 1 ? '' : 's'}`
    : `{ } ${n} key${n === 1 ? '' : 's'}`;
}

/** Display text for a primitive leaf (strings keep their quotes). */
function leafText(value: unknown, kind: JsonKind): string {
  if (kind === 'string') return JSON.stringify(value);
  if (kind === 'null') return 'null';
  return String(value);
}

/** One node of the collapsible tree; branches recurse, leaves render inline. */
function TreeNode({
  label,
  value,
  depth,
}: {
  label: string | null;
  value: unknown;
  depth: number;
}): ReactElement {
  const kind = jsonKind(value);
  const branch = kind === 'object' || kind === 'array';
  // Open the first two levels by default; deeper stays collapsed for big trees.
  const [open, setOpen] = useState(depth < 2);
  const pad = { paddingLeft: `${depth * 12}px` };

  if (!branch) {
    return (
      <div className="json-node" style={pad}>
        {label !== null && <span className="json-key">{label}:</span>}
        <span className={`json-leaf json-${kind}`}>{leafText(value, kind)}</span>
      </div>
    );
  }

  const entries = entriesOf(value);
  return (
    <div className="json-branch">
      <button
        type="button"
        className="json-toggle"
        style={pad}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="json-caret">{open ? '▾' : '▸'}</span>
        {label !== null && <span className="json-key">{label}:</span>}
        <span className="json-summary">{summarize(value, kind)}</span>
      </button>
      {open &&
        (entries.length === 0 ? (
          <div className="json-node" style={{ paddingLeft: `${(depth + 1) * 12}px` }}>
            <span className="dim">{kind === 'array' ? '(empty array)' : '(empty object)'}</span>
          </div>
        ) : (
          entries.map(([k, v]) => <TreeNode key={k} label={k} value={v} depth={depth + 1} />)
        ))}
    </div>
  );
}

export function JsonFormatterTool(): ReactElement {
  const [input, setInput] = useState('');
  const [view, setView] = useState<'text' | 'tree'>('text');

  const parsed = useMemo(() => (input.trim() === '' ? null : parseJson(input)), [input]);
  const formatted = useMemo(() => (input.trim() === '' ? null : formatJson(input)), [input]);

  // Replace the textarea with a transformed version (pretty / minified), if valid.
  const apply = (next: Result<string>): void => {
    if (next.ok) setInput(next.value);
  };

  return (
    <>
      <p className="hint">
        Paste JSON to pretty-print or minify it, and explore it as a collapsible tree. Everything
        runs locally — nothing is sent anywhere.
      </p>
      <textarea
        className="name-input"
        style={{ width: '100%', minHeight: '110px', fontFamily: 'monospace', resize: 'vertical' }}
        placeholder='{"hello": "world"}'
        value={input}
        onChange={(e) => setInput(e.target.value)}
        spellCheck={false}
      />
      <div className="row">
        <button type="button" className="primary" onClick={() => apply(formatJson(input))}>
          Format
        </button>
        <button type="button" onClick={() => apply(minifyJson(input))}>
          Minify
        </button>
        <button type="button" onClick={() => setInput(SAMPLE)}>
          Sample
        </button>
        <button type="button" onClick={() => setInput('')}>
          Clear
        </button>
        <CopyButton text={input} className="copy-btn-lg" />
      </div>

      {parsed !== null && !parsed.ok && <p className="error">{parsed.error}</p>}

      {parsed !== null && parsed.ok && (
        <>
          <div className="row">
            <div className="chips">
              <button
                type="button"
                className={view === 'text' ? 'chip active' : 'chip'}
                onClick={() => setView('text')}
              >
                Formatted
              </button>
              <button
                type="button"
                className={view === 'tree' ? 'chip active' : 'chip'}
                onClick={() => setView('tree')}
              >
                Tree
              </button>
            </div>
          </div>
          {view === 'text' ? (
            <pre className="snippet-code json-formatted">
              {formatted !== null && formatted.ok ? formatted.value : ''}
            </pre>
          ) : (
            <div className="json-tree">
              <TreeNode label={null} value={parsed.value} depth={0} />
            </div>
          )}
        </>
      )}
    </>
  );
}
