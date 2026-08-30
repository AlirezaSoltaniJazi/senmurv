import type { ReactElement } from 'react';
import type { Account } from '@/shared/types';

interface Props {
  accounts: Account[];
  /** id of the account whose Login is in flight, or null. */
  pendingId: string | null;
  /** account id -> error from its most recent Login attempt. */
  loginErrors: Record<string, string>;
  onLogin: (account: Account) => void;
  onEdit: (account: Account) => void;
  onDelete: (account: Account) => void;
}

export function AccountList({
  accounts,
  pendingId,
  loginErrors,
  onLogin,
  onEdit,
  onDelete,
}: Props): ReactElement {
  if (accounts.length === 0) {
    return <p className="hint">No saved accounts yet.</p>;
  }
  return (
    <ul className="script-list">
      {accounts.map((account) => (
        <li key={account.id}>
          <span className="script-name">{account.name || account.address}</span>
          <span className="script-actions">
            <button
              type="button"
              className="primary"
              disabled={pendingId === account.id}
              onClick={() => onLogin(account)}
            >
              {pendingId === account.id ? 'Logging in…' : 'Login'}
            </button>
            <button type="button" onClick={() => onEdit(account)}>
              Edit
            </button>
            <button type="button" className="danger" onClick={() => onDelete(account)}>
              Delete
            </button>
          </span>
          {loginErrors[account.id] && <p className="error">{loginErrors[account.id]}</p>}
        </li>
      ))}
    </ul>
  );
}
