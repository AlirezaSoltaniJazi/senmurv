import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { sendRuntimeMessage } from '@/shared/messages';
import type { BypassState, LogicalNamesReport, Result } from '@/shared/types';

/**
 * Dynamics Logical names: label every field, tab and section on the form with
 * its logical (schema) name — the identifier the Web API, Xrm scripts and
 * `[data-id]` selectors all key on, as opposed to the localized display name an
 * admin can rename.
 */
export function LogicalNamesTool(): ReactElement {
  const [hasXrm, setHasXrm] = useState<boolean | null>(null);
  const [report, setReport] = useState<LogicalNamesReport | null>(null);
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

  const show = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(null);
    // Enter the mode first, so the arbiter owns pageMode and the labels are torn
    // down on tool switch / panel close (and by Clear below).
    await sendRuntimeMessage({
      type: MESSAGE_TYPES.START_TOOL_MODE,
      payload: { mode: 'logicalnames' },
    });
    const res = await sendRuntimeMessage<Result<LogicalNamesReport>>({
      type: MESSAGE_TYPES.SHOW_LOGICAL_NAMES,
    });
    setBusy(false);
    if (res.ok) setReport(res.value);
    else setError(res.error);
  }, []);

  const clear = useCallback(async (): Promise<void> => {
    await sendRuntimeMessage({
      type: MESSAGE_TYPES.STOP_TOOL_MODE,
      payload: { mode: 'logicalnames' },
    });
    setReport(null);
    setError(null);
  }, []);

  if (hasXrm === false) {
    return (
      <p className="hint">
        This page is not a Dynamics form — <code>window.Xrm</code> is not present, so there are no
        logical names to read. Open a model-driven form and try again.
      </p>
    );
  }

  return (
    <>
      <p className="hint">
        Labels each control with its <strong>logical name</strong> — the one the Web API, Xrm
        scripts and <code>data-id</code> selectors use. Display names are localized and an admin can
        rename them; logical names do not move.
      </p>
      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={busy || hasXrm === null}
          onClick={() => void show()}
        >
          {busy ? 'Reading…' : 'Show names'}
        </button>
        <button type="button" disabled={report === null} onClick={() => void clear()}>
          Clear
        </button>
      </div>

      {report && (
        <>
          <div className="data-list">
            <div className="data-row">
              <span className="data-key">Fields</span>
              <span className="data-value">{report.fields}</span>
            </div>
            <div className="data-row">
              <span className="data-key">Tabs</span>
              <span className="data-value">{report.tabs}</span>
            </div>
            <div className="data-row">
              <span className="data-key">Sections</span>
              <span className="data-value">{report.sections}</span>
            </div>
          </div>
          <p className="hint">
            Labelled {report.labelled} of {report.total}.
            {report.labelled < report.total &&
              ' The rest are on a tab that is not open, so they have no box to label.'}
          </p>
        </>
      )}

      {error && <p className="error">{error}</p>}
    </>
  );
}
