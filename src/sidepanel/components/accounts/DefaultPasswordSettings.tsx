import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { sendRuntimeMessage } from '@/shared/messages';
import type { DefaultPasswordState, Result } from '@/shared/types';

interface Props {
  /** Bumped whenever Accounts unlocks, so state refetches after a lock/unlock cycle. */
  reloadNonce: number;
}

/** "Default password" accounts can opt into instead of saving their own. */
export function DefaultPasswordSettings({ reloadNonce }: Props): ReactElement {
  const [state, setState] = useState<DefaultPasswordState | null>(null);
  const [editing, setEditing] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await sendRuntimeMessage<Result<DefaultPasswordState>>({
        type: MESSAGE_TYPES.GET_DEFAULT_PASSWORD_STATE,
      });
      if (!cancelled && res.ok) setState(res.value);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadNonce]);

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
    if (next.ok) setState(next.value);
  }

  async function clear(): Promise<void> {
    await sendRuntimeMessage<Result<void>>({ type: MESSAGE_TYPES.CLEAR_DEFAULT_PASSWORD });
    setState({ isSet: false, updatedAt: null });
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
