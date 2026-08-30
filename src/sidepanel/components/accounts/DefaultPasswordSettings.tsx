import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { sendRuntimeMessage } from '@/shared/messages';
import type { DefaultPasswordState, Result } from '@/shared/types';

interface Props {
  /** Bumped whenever Accounts unlocks, so state refetches after a lock/unlock cycle. */
  reloadNonce: number;
  /** Told every time the "is a default password set" fact changes, so
   *  AccountEditor's "use default password" checkbox can disable itself. */
  onStateChange: (isSet: boolean) => void;
  /** How many saved accounts currently rely on the default password — Clear
   *  warns instead of silently locking them out of Login. */
  accountsUsingDefaultCount: number;
}

/** "Default password" accounts can opt into instead of saving their own. */
export function DefaultPasswordSettings({
  reloadNonce,
  onStateChange,
  accountsUsingDefaultCount,
}: Props): ReactElement {
  const [state, setState] = useState<DefaultPasswordState | null>(null);
  const [editing, setEditing] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const applyState = useCallback(
    (next: DefaultPasswordState) => {
      setState(next);
      onStateChange(next.isSet);
    },
    [onStateChange]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await sendRuntimeMessage<Result<DefaultPasswordState>>({
        type: MESSAGE_TYPES.GET_DEFAULT_PASSWORD_STATE,
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
      type: MESSAGE_TYPES.SAVE_DEFAULT_PASSWORD,
      payload: { password },
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPassword('');
    setEditing(false);
    const next = await sendRuntimeMessage<Result<DefaultPasswordState>>({
      type: MESSAGE_TYPES.GET_DEFAULT_PASSWORD_STATE,
    });
    if (next.ok) applyState(next.value);
  }

  async function clear(): Promise<void> {
    if (accountsUsingDefaultCount > 0) {
      const ok = window.confirm(
        `${accountsUsingDefaultCount} saved account(s) use the default password and won't be ` +
          `able to log in until you set a new default or give them their own password. ` +
          `Clear it anyway?`
      );
      if (!ok) return;
    }
    await sendRuntimeMessage<Result<void>>({ type: MESSAGE_TYPES.CLEAR_DEFAULT_PASSWORD });
    applyState({ isSet: false, updatedAt: null });
  }

  return (
    <div className="setting-row">
      <span className="setting-label">Default password</span>
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
            placeholder="Default password"
            aria-label="Default password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="button" className="primary" onClick={() => void save()}>
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setPassword('');
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
