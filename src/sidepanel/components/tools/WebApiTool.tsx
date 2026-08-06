import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { sendRuntimeMessage } from '@/shared/messages';
import type { BypassState, Result, XrmWebApiRecord } from '@/shared/types';
import { CopyButton } from '@/sidepanel/components/CopyButton';

/**
 * God Mode's "Open record in Web API" button (Level Up for Dynamics CRM):
 * resolve the current Dynamics record to its Dataverse Web API URL and open it
 * in a new tab.
 */
export function WebApiTool(): ReactElement {
  const [hasXrm, setHasXrm] = useState<boolean | null>(null);
  const [record, setRecord] = useState<XrmWebApiRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Capability probe, not a URL match: on-prem Dynamics runs on arbitrary
  // hostnames, so the only honest question is whether Xrm is actually there.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await sendRuntimeMessage<Result<BypassState>>({
        type: MESSAGE_TYPES.GET_BYPASS_STATE,
      });
      if (!cancelled) setHasXrm(res.ok ? res.value.hasXrm : false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function resolve(): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await sendRuntimeMessage<Result<XrmWebApiRecord>>({
      type: MESSAGE_TYPES.GET_XRM_WEB_API_URL,
    });
    setBusy(false);
    if (res.ok) setRecord(res.value);
    else setError(res.error);
  }

  function openNewTab(): void {
    if (!record) return;
    void chrome.tabs.create({ url: record.url }).catch(() => setError('Chrome refused that URL.'));
  }

  if (hasXrm === false) {
    return (
      <p className="hint">
        This page is not a Dynamics form — <code>window.Xrm</code> is not present, so there is no
        record to resolve. Open a model-driven form and try again.
      </p>
    );
  }

  return (
    <>
      <p className="hint">
        Resolves the current record to its <strong>Dataverse Web API URL</strong> — e.g.{' '}
        <code>/api/data/v9.2/accounts(…)</code> — using the entity set name from{' '}
        <code>Xrm.Utility.getEntityMetadata</code>, not naive pluralization.
      </p>
      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={busy || hasXrm === null}
          onClick={() => void resolve()}
        >
          {busy ? 'Resolving…' : 'Resolve record'}
        </button>
      </div>

      {record && (
        <>
          <div className="data-list">
            <div className="data-row">
              <span className="data-key">Entity</span>
              <span className="data-value">{record.entityLogicalName}</span>
            </div>
            <div className="data-row">
              <span className="data-key">Record id</span>
              <span className="data-value">{record.recordId}</span>
            </div>
          </div>
          <div className="snippet-row">
            <div className="snippet-head">
              <span className="snippet-fw">Web API URL</span>
              <CopyButton text={record.url} />
            </div>
            <code className="snippet-code">{record.url}</code>
          </div>
          <div className="row">
            <button type="button" className="primary" onClick={openNewTab}>
              Open in new tab
            </button>
          </div>
        </>
      )}

      {error && <p className="error">{error}</p>}
    </>
  );
}
