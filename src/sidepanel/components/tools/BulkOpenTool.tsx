import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { browser } from '@/shared/browser-api';
import { hasUrl, parseBulkUrls } from '@/shared/tools/bulk-open';

const SAMPLE = 'https://example.com\napp.example.com/login\nhttps://example.org/docs';

/** Above this many valid URLs, confirm before opening — an accidental paste
 *  (or a stray extra line) shouldn't silently spawn dozens of tabs. */
const CONFIRM_THRESHOLD = 10;

export function BulkOpenTool(): ReactElement {
  const [input, setInput] = useState('');
  const [opening, setOpening] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Memoized on [input] — re-normalizing/validating every pasted line
  // shouldn't happen on every render (e.g. the `opening`/`status` state
  // changes during openAll()), only when the text actually changes.
  const parsed = useMemo(() => parseBulkUrls(input), [input]);
  const valid = useMemo(() => parsed.filter(hasUrl), [parsed]);
  const invalid = useMemo(() => parsed.filter((p) => p.url === null), [parsed]);

  async function openAll(): Promise<void> {
    if (valid.length === 0) return;
    if (valid.length > CONFIRM_THRESHOLD && !window.confirm(`Open ${valid.length} new tabs?`)) {
      return;
    }
    setStatus(null);
    setOpening(true);
    let opened = 0;
    const failed: string[] = [];
    for (const entry of valid) {
      try {
        await browser.tabs.create({ url: entry.url, active: false });
        opened += 1;
      } catch {
        failed.push(entry.raw);
      }
    }
    setOpening(false);
    setStatus(
      failed.length === 0
        ? `Opened ${opened} tab(s).`
        : `Opened ${opened} tab(s); ${failed.length} failed: ${failed.join(', ')}`
    );
  }

  return (
    <>
      <textarea
        className="name-input"
        style={{ width: '100%', minHeight: '140px', resize: 'vertical' }}
        placeholder={'https://example.com\napp.example.com/login\n…'}
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setStatus(null);
        }}
        spellCheck={false}
      />
      {invalid.length > 0 && (
        <p className="hint">
          {invalid.length} line(s) look invalid and will be skipped:{' '}
          {invalid.map((i) => i.raw).join(', ')}
        </p>
      )}
      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={opening || valid.length === 0}
          onClick={() => void openAll()}
        >
          {opening ? 'Opening…' : `Open ${valid.length} tab(s)`}
        </button>
        <button type="button" onClick={() => setInput(SAMPLE)}>
          Sample
        </button>
        <button
          type="button"
          onClick={() => {
            setInput('');
            setStatus(null);
          }}
        >
          Clear
        </button>
      </div>
      {status && <p className="status">{status}</p>}
    </>
  );
}
