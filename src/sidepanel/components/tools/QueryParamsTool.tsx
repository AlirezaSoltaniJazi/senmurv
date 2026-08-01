import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import {
  addParam,
  buildUrl,
  findIdParam,
  findParam,
  parseUrl,
  removeParam,
  setParam,
  updateParam,
} from '@/shared/tools/query-params';
import type { QueryParam } from '@/shared/tools/query-params';
import { CopyButton } from '@/sidepanel/components/CopyButton';

/** Read the active tab's URL. The panel holds `tabs`, so no worker round-trip. */
function readActiveUrl(onUrl: (url: string) => void): void {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) return;
    onUrl(tabs[0]?.url ?? '');
  });
}

/** Navigate the active tab (a true redirect), rather than opening a new one. */
function navigateActiveTab(url: string, onError: (message: string) => void): void {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) return;
    const id = tabs[0]?.id;
    if (typeof id !== 'number') return;
    void chrome.tabs.update(id, { url }).catch(() => onError('Chrome refused that URL.'));
  });
}

export function QueryParamsTool(): ReactElement {
  const [currentUrl, setCurrentUrl] = useState('');
  const [customName, setCustomName] = useState('');
  // Builder state.
  const [base, setBase] = useState('');
  const [rows, setRows] = useState<QueryParam[]>([]);
  const [hash, setHash] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback((): void => {
    readActiveUrl(setCurrentUrl);
  }, []);

  // Initial read of the active tab's URL.
  useEffect(() => {
    refresh();
  }, [refresh]);

  const parsedCurrent = currentUrl === '' ? null : parseUrl(currentUrl);
  const currentParams = parsedCurrent?.ok ? parsedCurrent.value.params : [];
  const idParam = findIdParam(currentParams);
  const customValue = customName.trim() === '' ? null : findParam(currentParams, customName);

  /** Split the live URL into the builder's base + rows — the primary flow. */
  function loadCurrent(): void {
    setError(null);
    const parsed = parseUrl(currentUrl);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setBase(parsed.value.base);
    setRows(parsed.value.params);
    setHash(parsed.value.hash);
    setStatus('Loaded the current URL — edit a value, then open.');
  }

  function clearBuilder(): void {
    setBase('');
    setRows([]);
    setHash('');
    setError(null);
    setStatus(null);
  }

  /** Fill the `id` row from the live URL's id (the "sync" button). */
  function syncId(): void {
    if (!idParam) {
      setError('This URL has no “id” to sync.');
      return;
    }
    setError(null);
    setRows((prev) => setParam(prev, 'id', idParam.value));
    setStatus(`Synced id = ${idParam.value}`);
  }

  /** Fill the custom-named row from the live URL's value for that name. */
  function syncCustom(): void {
    const name = customName.trim();
    if (name === '' || customValue === null) {
      setError('That param is not in the current URL.');
      return;
    }
    setError(null);
    setRows((prev) => setParam(prev, name, customValue));
    setStatus(`Synced ${name} = ${customValue}`);
  }

  const built = base.trim() === '' ? '' : buildUrl(base.trim(), rows, hash);

  function openNewTab(): void {
    if (built === '') return;
    void chrome.tabs.create({ url: built }).catch(() => setError('Chrome refused that URL.'));
  }

  function goHere(): void {
    if (built === '') return;
    navigateActiveTab(built, setError);
  }

  return (
    <>
      {/* ── 1. Current URL + Fetch ID ─────────────────────────────── */}
      <h3 className="section-title">Current URL</h3>
      <div className="row">
        <code className="kv-value" title={currentUrl}>
          {currentUrl || '(no URL)'}
        </code>
        <CopyButton text={currentUrl} />
        <button type="button" onClick={refresh} title="Re-read the current tab">
          ↻
        </button>
      </div>

      <div className="data-list">
        <div className="data-row">
          <span className="data-key">id</span>
          <span className="data-value" title={idParam?.value ?? ''}>
            {idParam ? idParam.value : 'no “id” in this URL'}
          </span>
          {idParam && <CopyButton text={idParam.value} />}
        </div>
      </div>

      {/* ── 2. Custom query param ─────────────────────────────────── */}
      <h3 className="section-title">Custom param</h3>
      <div className="row">
        <input
          className="name-input"
          placeholder="Param name, e.g. etn"
          aria-label="Custom param name"
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
        />
        <code className="kv-value" title={customValue ?? ''}>
          {customName.trim() === ''
            ? '—'
            : (customValue ?? `“${customName.trim()}” is not in this URL`)}
        </code>
        {customValue !== null && <CopyButton text={customValue} />}
      </div>

      {/* ── 3. Build & open ───────────────────────────────────────── */}
      <h3 className="section-title">Build &amp; open</h3>
      <div className="row">
        <button type="button" className="primary" onClick={loadCurrent}>
          Load current URL
        </button>
        <button type="button" onClick={syncId} title="Fill the id row from the current URL">
          Sync ID
        </button>
        <button
          type="button"
          onClick={syncCustom}
          title="Fill the custom param's row from the current URL"
        >
          Sync custom
        </button>
        <button type="button" onClick={clearBuilder}>
          Clear
        </button>
      </div>

      <input
        className="name-input"
        placeholder="Base URL, e.g. https://org.crm4.dynamics.com/main.aspx"
        aria-label="Base URL"
        value={base}
        onChange={(e) => setBase(e.target.value)}
      />

      <ul className="kv-list">
        {rows.map((row, i) => (
          // Rows are positional and names repeat legally, so the index IS the identity.
          <li key={i} className="kv-row">
            <div className="kv-head">
              <input
                className="name-input qp-name"
                placeholder="name"
                aria-label={`Param ${i + 1} name`}
                value={row.name}
                onChange={(e) => setRows((prev) => updateParam(prev, i, { name: e.target.value }))}
              />
              <input
                className="name-input qp-value"
                placeholder="value"
                aria-label={`Param ${i + 1} value`}
                value={row.value}
                onChange={(e) => setRows((prev) => updateParam(prev, i, { value: e.target.value }))}
              />
              <span className="kv-actions">
                <button
                  type="button"
                  className="danger"
                  title="Remove this param"
                  aria-label={`Remove param ${i + 1}`}
                  onClick={() => setRows((prev) => removeParam(prev, i))}
                >
                  ✕
                </button>
              </span>
            </div>
          </li>
        ))}
      </ul>

      <div className="row">
        <button type="button" onClick={() => setRows((prev) => addParam(prev))}>
          + Add param
        </button>
      </div>

      {built !== '' && (
        <div className="snippet-row">
          <div className="snippet-head">
            <span className="snippet-fw">result</span>
            <CopyButton text={built} />
          </div>
          <code className="snippet-code">{built}</code>
        </div>
      )}

      <div className="row">
        <button type="button" className="primary" disabled={built === ''} onClick={openNewTab}>
          Open in new tab
        </button>
        <button type="button" disabled={built === ''} onClick={goHere}>
          Go here
        </button>
      </div>

      {status && <p className="status">{status}</p>}
      {error && <p className="error">{error}</p>}
    </>
  );
}
