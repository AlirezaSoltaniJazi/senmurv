import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { sendRuntimeMessage } from '@/shared/messages';
import type { DefaultOtpState, Result } from '@/shared/types';

interface Props {
  /** Bumped whenever Accounts unlocks, so state refetches after a lock/unlock cycle. */
  reloadNonce: number;
  /** Told every time the "is a default OTP code set" fact changes, so
   *  AccountEditor's "use default OTP code" checkbox can disable itself. */
  onStateChange: (isSet: boolean) => void;
  /** How many saved accounts currently rely on the default OTP code — Clear
   *  warns instead of silently breaking their OTP step. */
  accountsUsingDefaultCount: number;
}

/** "Default OTP code" accounts can opt into instead of saving their own —
 *  for staging/QA environments where a fixed test code is accepted. */
export function DefaultOtpSettings({
  reloadNonce,
  onStateChange,
  accountsUsingDefaultCount,
}: Props): ReactElement {
  const [state, setState] = useState<DefaultOtpState | null>(null);
  const [editing, setEditing] = useState(false);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);

  const applyState = useCallback(
    (next: DefaultOtpState) => {
      setState(next);
      onStateChange(next.isSet);
    },
    [onStateChange]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await sendRuntimeMessage<Result<DefaultOtpState>>({
        type: MESSAGE_TYPES.GET_DEFAULT_OTP_STATE,
      });
      if (!cancelled && res.ok) applyState(res.value);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadNonce, applyState]);

  async function save(): Promise<void> {
    setError(null);
    const res = await sendRuntimeMessage<Result<void>>({
      type: MESSAGE_TYPES.SAVE_DEFAULT_OTP,
      payload: { otp },
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOtp('');
    setEditing(false);
    const next = await sendRuntimeMessage<Result<DefaultOtpState>>({
      type: MESSAGE_TYPES.GET_DEFAULT_OTP_STATE,
    });
    if (next.ok) applyState(next.value);
  }

  async function clear(): Promise<void> {
    if (accountsUsingDefaultCount > 0) {
      const ok = window.confirm(
        `${accountsUsingDefaultCount} saved account(s) use the default OTP code and won't be ` +
          `able to complete their OTP step until you set a new default or give them their own ` +
          `code. Clear it anyway?`
      );
      if (!ok) return;
    }
    await sendRuntimeMessage<Result<void>>({ type: MESSAGE_TYPES.CLEAR_DEFAULT_OTP });
    applyState({ isSet: false, updatedAt: null });
  }

  return (
    <div className="setting-row">
      <span className="setting-label">Default OTP code</span>
      {!editing && state && (
        <div className="row">
          <span className="hint">
            {state.isSet ? `Set on ${new Date(state.updatedAt ?? 0).toLocaleString()}` : 'Not set'}
          </span>
          <button type="button" onClick={() => setEditing(true)}>
            {state.isSet ? 'Change' : 'Set'}
          </button>
          {state.isSet && (
            <button type="button" className="danger" onClick={() => void clear()}>
              Clear
            </button>
          )}
        </div>
      )}
      {editing && (
        <div className="row">
          <input
            className="name-input"
            type="password"
            placeholder="Default OTP code"
            aria-label="Default OTP code"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
          />
          <button type="button" className="primary" onClick={() => void save()}>
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setOtp('');
              setError(null);
            }}
          >
            Cancel
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
