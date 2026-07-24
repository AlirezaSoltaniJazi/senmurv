import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { isRuntimeMessage, sendRuntimeMessage } from '@/shared/messages';
import { buildUnlockScript, DEFAULT_GOD_MODE_OPTIONS } from '@/shared/tools/god-mode';
import type { GodCategory, GodModeOptions, GodModeReport, GodModeState } from '@/shared/types';
import type { Result, XrmReport } from '@/shared/types';

interface Props {
  /** Hands a generated unlock script to the Scripts tab so it can be saved and re-run. */
  onSaveScript: (name: string, code: string) => void;
}

const TOGGLES: { key: keyof GodModeOptions; label: string; hint: string }[] = [
  {
    key: 'shouldEnableInputs',
    label: 'Enable disabled & read-only fields',
    hint: 'Removes disabled, readonly and their ARIA equivalents.',
  },
  {
    key: 'shouldDropValidation',
    label: 'Drop client-side validation',
    hint: 'Removes required, pattern and length limits; sets step to "any".',
  },
  {
    key: 'shouldUnlockOptions',
    label: 'Unlock dropdown options',
    hint: 'Re-enables disabled and hidden <option> entries.',
  },
  {
    key: 'shouldRevealHidden',
    label: 'Reveal hidden elements',
    hint: 'Strips hidden / inert / aria-hidden and forces display back on. Changes what you see.',
  },
  {
    key: 'shouldRevealPasswords',
    label: 'Reveal password fields',
    hint: 'Turns password inputs into plain text. Careful on a shared screen.',
  },
  {
    key: 'shouldCloseDialogs',
    label: 'Close modal dialogs',
    hint: 'A modal <dialog> makes the rest of the page inert; only closing it helps.',
  },
  {
    key: 'shouldPierceShadowDom',
    label: 'Descend into shadow DOM',
    hint: 'Reaches fields inside open web components. Closed roots stay unreachable.',
  },
];

const CATEGORY_LABELS: Record<GodCategory, string> = {
  enabled: 'fields enabled',
  validation: 'validation rules dropped',
  options: 'options unlocked',
  revealed: 'elements revealed',
  passwords: 'passwords revealed',
  dialogs: 'dialogs closed',
};

function ReportView({ report }: { report: GodModeReport }): ReactElement {
  const rows = (Object.keys(CATEGORY_LABELS) as GodCategory[]).filter((k) => report.counts[k] > 0);
  return (
    <div className="data-list">
      {rows.length === 0 ? (
        <p className="hint">Nothing was locked — the page is already open.</p>
      ) : (
        rows.map((key) => (
          <div className="data-row" key={key}>
            <span className="data-key">{CATEGORY_LABELS[key]}</span>
            <span className="data-value">{report.counts[key]}</span>
          </div>
        ))
      )}
      {report.shadowRoots > 0 && (
        <div className="data-row">
          <span className="data-key">shadow roots entered</span>
          <span className="data-value">{report.shadowRoots}</span>
        </div>
      )}
    </div>
  );
}

export function UnlockTool({ onSaveScript }: Props): ReactElement {
  const [options, setOptions] = useState<GodModeOptions>(DEFAULT_GOD_MODE_OPTIONS);
  const [shouldWatch, setShouldWatch] = useState(false);
  const [state, setState] = useState<GodModeState | null>(null);
  const [report, setReport] = useState<GodModeReport | null>(null);
  const [xrm, setXrm] = useState<XrmReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    const res = await sendRuntimeMessage<Result<GodModeState>>({
      type: MESSAGE_TYPES.GET_UNLOCK_STATE,
    });
    if (res.ok) {
      setState(res.value);
      if (res.value.report) setReport(res.value.report);
    } else {
      setError(res.error);
    }
  }, []);

  // Re-sync on mount: the content script owns the unlock, so it survives the
  // panel closing — but a full page navigation destroys it, and then Restore
  // genuinely is impossible rather than merely unavailable.
  useEffect(() => {
    void (async () => {
      await refresh();
    })();
  }, [refresh]);

  // Sticky mode re-applies on its own and pushes a fresh count each time.
  useEffect(() => {
    function onMessage(message: unknown): void {
      if (!isRuntimeMessage(message)) return;
      if (message.type === MESSAGE_TYPES.UNLOCK_STATE_CHANGED) setReport(message.payload.report);
    }
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  async function run<T>(send: () => Promise<Result<T>>, onDone: (value: T) => void): Promise<void> {
    setError(null);
    setIsBusy(true);
    const res = await send();
    setIsBusy(false);
    if (res.ok) {
      onDone(res.value);
      void refresh();
    } else {
      setError(res.error);
    }
  }

  const unlock = (): Promise<void> =>
    run<GodModeReport>(
      () =>
        sendRuntimeMessage({
          type: MESSAGE_TYPES.UNLOCK_PAGE,
          payload: { options, shouldWatch },
        }),
      setReport
    );

  const restore = (): Promise<void> =>
    run<GodModeReport>(
      () => sendRuntimeMessage({ type: MESSAGE_TYPES.RESTORE_PAGE }),
      () => {
        setReport(null);
        setXrm(null);
      }
    );

  const unlockDynamics = (): Promise<void> =>
    run<XrmReport>(() => sendRuntimeMessage({ type: MESSAGE_TYPES.UNLOCK_XRM }), setXrm);

  const isUnlocked = state?.isUnlocked === true;

  return (
    <>
      <div className="row">
        <button type="button" className="primary" disabled={isBusy} onClick={() => void unlock()}>
          {isUnlocked ? 'Unlock again' : 'Unlock page'}
        </button>
        <button type="button" disabled={isBusy || !isUnlocked} onClick={() => void restore()}>
          Restore
        </button>
      </div>

      {state?.hasXrm === true && (
        <div className="row">
          <button type="button" disabled={isBusy} onClick={() => void unlockDynamics()}>
            Unlock Dynamics form
          </button>
        </div>
      )}

      {error !== null && <p className="error">{error}</p>}

      {report !== null && <ReportView report={report} />}

      {report?.warnings.map((warning) => (
        <p className="hint" key={warning}>
          {warning}
        </p>
      ))}

      {xrm !== null && (
        <div className="data-list">
          <div className="data-row">
            <span className="data-key">required → optional</span>
            <span className="data-value">{xrm.attributes}</span>
          </div>
          <div className="data-row">
            <span className="data-key">controls shown / enabled</span>
            <span className="data-value">{xrm.controls}</span>
          </div>
          <div className="data-row">
            <span className="data-key">tabs revealed</span>
            <span className="data-value">{xrm.tabs}</span>
          </div>
          <div className="data-row">
            <span className="data-key">sections revealed</span>
            <span className="data-value">{xrm.sections}</span>
          </div>
        </div>
      )}

      <h3 className="section-title">What to strip</h3>
      {TOGGLES.map((toggle) => (
        <label className="checkbox-inline" key={toggle.key} title={toggle.hint}>
          <input
            type="checkbox"
            checked={options[toggle.key]}
            onChange={(e) => setOptions({ ...options, [toggle.key]: e.target.checked })}
          />
          {toggle.label}
        </label>
      ))}

      <label className="checkbox-inline" title="Re-apply automatically when the page re-renders.">
        <input
          type="checkbox"
          checked={shouldWatch}
          onChange={(e) => setShouldWatch(e.target.checked)}
        />
        Keep re-applying (sticky)
      </label>
      {shouldWatch && (
        <p className="hint">
          Sticky mode watches lock attributes only. A framework that re-hides a field with{' '}
          <code>style</code> or <code>class</code> is not tracked — watching those would storm on
          every React render.
        </p>
      )}

      <h3 className="section-title">Reuse</h3>
      <div className="row">
        <button
          type="button"
          onClick={() => onSaveScript('Unlock page', buildUnlockScript(options))}
        >
          Save as a script
        </button>
      </div>
      <p className="hint">
        Saves these settings as a standalone script in the Scripts tab, so you can re-run the unlock
        after every page load. The saved version has no undo.
      </p>
    </>
  );
}
