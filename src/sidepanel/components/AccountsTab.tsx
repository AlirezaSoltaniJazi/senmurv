import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import {
  ACCOUNTS_PIN_MAX_LENGTH,
  ACCOUNTS_PIN_MIN_LENGTH,
  MESSAGE_TYPES,
} from '@/shared/constants';
import { sendRuntimeMessage } from '@/shared/messages';
import { isValidPin, newAccount } from '@/shared/accounts';
import type { Account, AccountDraft, AccountsLockState, Result } from '@/shared/types';
import { AccountEditor } from './accounts/AccountEditor';
import { AccountList } from './accounts/AccountList';
import { AccountsSecurity } from './accounts/AccountsSecurity';
import { DefaultPasswordSettings } from './accounts/DefaultPasswordSettings';

interface Props {
  reloadNonce: number;
}

const DEFAULT_SESSION_MINUTES = 30;
const LOCKED_ERROR_PREFIX = 'Accounts are locked';

export function AccountsTab({ reloadNonce }: Props): ReactElement {
  const [lockState, setLockState] = useState<AccountsLockState | null>(null);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [isNewAccount, setIsNewAccount] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [loginErrors, setLoginErrors] = useState<Record<string, string>>({});
  const [unlockNonce, setUnlockNonce] = useState(0);

  async function refreshLockState(): Promise<AccountsLockState | null> {
    const res = await sendRuntimeMessage<Result<AccountsLockState>>({
      type: MESSAGE_TYPES.GET_ACCOUNTS_LOCK_STATE,
    });
    if (!res.ok) return null;
    setLockState(res.value);
    return res.value;
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const state = await refreshLockState();
      if (cancelled || !state?.isUnlocked) return;
      const res = await sendRuntimeMessage<Result<Account[]>>({ type: MESSAGE_TYPES.GET_ACCOUNTS });
      if (!cancelled && res.ok) setAccounts(res.value);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadNonce, unlockNonce]);

  async function setUpPin(): Promise<void> {
    setAuthError(null);
    if (!isValidPin(pin)) {
      setAuthError(`Enter a ${ACCOUNTS_PIN_MIN_LENGTH}-${ACCOUNTS_PIN_MAX_LENGTH} digit PIN.`);
      return;
    }
    if (pin !== confirmPin) {
      setAuthError('PIN and confirmation do not match.');
      return;
    }
    const res = await sendRuntimeMessage<Result<void>>({
      type: MESSAGE_TYPES.SET_ACCOUNTS_PIN,
      payload: { pin, sessionMinutes: DEFAULT_SESSION_MINUTES },
    });
    if (!res.ok) {
      setAuthError(res.error);
      return;
    }
    setPin('');
    setConfirmPin('');
    setUnlockNonce((n) => n + 1);
  }

  async function unlock(): Promise<void> {
    setAuthError(null);
    const res = await sendRuntimeMessage<Result<void>>({
      type: MESSAGE_TYPES.UNLOCK_ACCOUNTS,
      payload: { pin },
    });
    if (!res.ok) {
      setAuthError(res.error);
      return;
    }
    setPin('');
    setUnlockNonce((n) => n + 1);
  }

  async function saveAccount(draft: AccountDraft): Promise<void> {
    const res = await sendRuntimeMessage<Result<Account[]>>({
      type: MESSAGE_TYPES.SAVE_ACCOUNT,
      payload: { account: draft },
    });
    if (res.ok) {
      setAccounts(res.value);
      setEditingAccount(null);
    }
  }

  async function deleteAccount(account: Account): Promise<void> {
    if (!window.confirm(`Delete "${account.name || account.address}"? This cannot be undone.`)) {
      return;
    }
    const res = await sendRuntimeMessage<Result<Account[]>>({
      type: MESSAGE_TYPES.DELETE_ACCOUNT,
      payload: { id: account.id },
    });
    if (res.ok) setAccounts(res.value);
  }

  async function login(account: Account): Promise<void> {
    setPendingId(account.id);
    setLoginErrors((prev) => {
      const next = { ...prev };
      delete next[account.id];
      return next;
    });
    const res = await sendRuntimeMessage<Result<void>>({
      type: MESSAGE_TYPES.RUN_ACCOUNT_LOGIN,
      payload: { id: account.id },
    });
    setPendingId(null);
    if (!res.ok) {
      setLoginErrors((prev) => ({ ...prev, [account.id]: res.error }));
      if (res.error.startsWith(LOCKED_ERROR_PREFIX)) void refreshLockState();
    }
  }

  if (!lockState) return <div className="tab" />;

  if (!lockState.isPinSet) {
    return (
      <div className="tab">
        <h3 className="section-title">Set a PIN to secure your saved accounts</h3>
        <p className="hint">
          Passwords are encrypted with a key derived from this PIN. The PIN itself is never stored —
          without it, saved passwords cannot be recovered.
        </p>
        <input
          className="name-input"
          type="password"
          inputMode="numeric"
          maxLength={ACCOUNTS_PIN_MAX_LENGTH}
          placeholder={`${ACCOUNTS_PIN_MIN_LENGTH}-${ACCOUNTS_PIN_MAX_LENGTH} digit PIN`}
          aria-label={`${ACCOUNTS_PIN_MIN_LENGTH}-${ACCOUNTS_PIN_MAX_LENGTH} digit PIN`}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />
        <input
          className="name-input"
          type="password"
          inputMode="numeric"
          maxLength={ACCOUNTS_PIN_MAX_LENGTH}
          placeholder="Confirm PIN"
          aria-label="Confirm PIN"
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value)}
        />
        <div className="row">
          <button type="button" className="primary" onClick={() => void setUpPin()}>
            Set PIN
          </button>
        </div>
        {authError && <p className="error">{authError}</p>}
      </div>
    );
  }

  if (!lockState.isUnlocked) {
    return (
      <div className="tab">
        <h3 className="section-title">Enter your PIN</h3>
        <input
          className="name-input"
          type="password"
          inputMode="numeric"
          maxLength={ACCOUNTS_PIN_MAX_LENGTH}
          placeholder="PIN"
          aria-label="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void unlock();
          }}
        />
        <div className="row">
          <button type="button" className="primary" onClick={() => void unlock()}>
            Unlock
          </button>
        </div>
        {authError && <p className="error">{authError}</p>}
      </div>
    );
  }

  return (
    <div className="tab">
      <div className="row">
        <button
          type="button"
          className="primary"
          onClick={() => {
            setIsNewAccount(true);
            setEditingAccount(newAccount(Date.now()));
          }}
        >
          + New account
        </button>
      </div>

      {editingAccount ? (
        <AccountEditor
          initial={editingAccount}
          isNew={isNewAccount}
          onSave={(draft) => void saveAccount(draft)}
          onCancel={() => setEditingAccount(null)}
        />
      ) : (
        <AccountList
          accounts={accounts}
          pendingId={pendingId}
          loginErrors={loginErrors}
          onLogin={(account) => void login(account)}
          onEdit={(account) => {
            setIsNewAccount(false);
            setEditingAccount(account);
          }}
          onDelete={(account) => void deleteAccount(account)}
        />
      )}

      <DefaultPasswordSettings reloadNonce={unlockNonce} />
      <AccountsSecurity
        sessionMinutes={lockState.sessionMinutes}
        onSessionMinutesChange={(minutes) =>
          setLockState((prev) => (prev ? { ...prev, sessionMinutes: minutes } : prev))
        }
        onLocked={() => void refreshLockState()}
      />
    </div>
  );
}
