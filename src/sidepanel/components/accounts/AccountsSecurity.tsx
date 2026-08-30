import { useState } from 'react';
import type { ReactElement } from 'react';
import {
  ACCOUNTS_PIN_MAX_LENGTH,
  ACCOUNTS_PIN_MIN_LENGTH,
  MESSAGE_TYPES,
} from '@/shared/constants';
import { sendRuntimeMessage } from '@/shared/messages';
import { isValidPin } from '@/shared/accounts';
import type { Result } from '@/shared/types';

const MIN_SESSION_MINUTES = 1;
const MAX_SESSION_MINUTES = 360;

interface Props {
  sessionMinutes: number;
  /** Called after a successful change so the parent can refresh lock state / re-lock. */
  onLocked: () => void;
  onSessionMinutesChange: (minutes: number) => void;
}

/** Session-length control, "Change PIN" form, and a "Lock now" button. */
export function AccountsSecurity({
  sessionMinutes,
  onLocked,
  onSessionMinutesChange,
}: Props): ReactElement {
  const [changingPin, setChangingPin] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function changeSessionMinutes(minutes: number): Promise<void> {
    if (!Number.isFinite(minutes)) return;
    const clamped = Math.min(
      MAX_SESSION_MINUTES,
      Math.max(MIN_SESSION_MINUTES, Math.round(minutes))
    );
    const res = await sendRuntimeMessage<Result<void>>({
      type: MESSAGE_TYPES.SET_ACCOUNTS_SESSION_MINUTES,
      payload: { minutes: clamped },
    });
    if (res.ok) onSessionMinutesChange(clamped);
  }

  async function changePin(): Promise<void> {
    setError(null);
    setStatus(null);
    if (!isValidPin(newPin)) {
      setError(`Enter a ${ACCOUNTS_PIN_MIN_LENGTH}-${ACCOUNTS_PIN_MAX_LENGTH} digit PIN.`);
      return;
    }
    if (newPin !== confirmPin) {
      setError('New PIN and confirmation do not match.');
      return;
    }
    const res = await sendRuntimeMessage<Result<void>>({
      type: MESSAGE_TYPES.CHANGE_ACCOUNTS_PIN,
      payload: { currentPin, newPin },
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setChangingPin(false);
    setStatus('PIN changed.');
  }

  async function lockNow(): Promise<void> {
    await sendRuntimeMessage<Result<void>>({ type: MESSAGE_TYPES.LOCK_ACCOUNTS });
    onLocked();
  }

  return (
    <div className="account-editor">
      <h3 className="section-title">Security</h3>
      <div className="setting-row">
        <label className="setting-label" htmlFor="accounts-session-minutes">
          Stay unlocked for (minutes)
        </label>
        <input
          id="accounts-session-minutes"
          className="hud-seconds"
          type="number"
          min={MIN_SESSION_MINUTES}
          max={MAX_SESSION_MINUTES}
          step={1}
          value={sessionMinutes}
          onChange={(e) => void changeSessionMinutes(Number(e.target.value))}
        />
      </div>

      <div className="row">
        {!changingPin && (
          <button type="button" onClick={() => setChangingPin(true)}>
            Change PIN
          </button>
        )}
        <button type="button" className="danger" onClick={() => void lockNow()}>
          Lock now
        </button>
      </div>

      {changingPin && (
        <>
          <input
            className="name-input"
            type="password"
            inputMode="numeric"
            maxLength={ACCOUNTS_PIN_MAX_LENGTH}
            placeholder="Current PIN"
            aria-label="Current PIN"
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value)}
          />
          <input
            className="name-input"
            type="password"
            inputMode="numeric"
            maxLength={ACCOUNTS_PIN_MAX_LENGTH}
            placeholder={`New PIN (${ACCOUNTS_PIN_MIN_LENGTH}-${ACCOUNTS_PIN_MAX_LENGTH} digits)`}
            aria-label="New PIN"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
          />
          <input
            className="name-input"
            type="password"
            inputMode="numeric"
            maxLength={ACCOUNTS_PIN_MAX_LENGTH}
            placeholder="Confirm new PIN"
            aria-label="Confirm new PIN"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value)}
          />
          <div className="row">
            <button type="button" className="primary" onClick={() => void changePin()}>
              Save new PIN
            </button>
            <button
              type="button"
              onClick={() => {
                setChangingPin(false);
                setCurrentPin('');
                setNewPin('');
                setConfirmPin('');
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </>
      )}
      {status && <p className="status">{status}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
