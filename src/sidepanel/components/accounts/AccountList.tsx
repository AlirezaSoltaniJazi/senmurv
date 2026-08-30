import { Fragment, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { DEFAULT_GROUP_NAME, groupAccounts } from '@/shared/accounts';
import type { Account } from '@/shared/types';

interface Props {
  accounts: Account[];
  /** id of the account whose Login is in flight, or null. */
  pendingId: string | null;
  /** account id -> error from its most recent Login attempt. */
  loginErrors: Record<string, string>;
  /** Seconds the mouse must hover an account before its description tooltip appears. */
  tooltipDelaySeconds: number;
  onLogin: (account: Account) => void;
  onEdit: (account: Account) => void;
  onDuplicate: (account: Account) => void;
  onDelete: (account: Account) => void;
  onRenameGroup: (from: string, to: string) => void;
}

interface AccountRowProps {
  account: Account;
  pending: boolean;
  loginError: string | undefined;
  tooltipDelaySeconds: number;
  onLogin: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** One account row, plus its own hover-delay tooltip state — a per-row hook
 *  (start/clear a timer, show/hide) can't live in the parent's .map() body. */
function AccountRow({
  account,
  pending,
  loginError,
  tooltipDelaySeconds,
  onLogin,
  onEdit,
  onDuplicate,
  onDelete,
}: AccountRowProps): ReactElement {
  const [showTooltip, setShowTooltip] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function startHover(): void {
    if (!account.description) return;
    timerRef.current = setTimeout(() => setShowTooltip(true), tooltipDelaySeconds * 1000);
  }
  function endHover(): void {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    setShowTooltip(false);
  }
  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    []
  );

  return (
    <Fragment>
      <li className="script-row script-child" onMouseEnter={startHover} onMouseLeave={endHover}>
        <div className="account-info">
          <span className="account-name">{account.name || account.address}</span>
          <span className="account-meta dim">
            {account.address}
            {account.username ? ` · ${account.username}` : ''}
          </span>
          {showTooltip && account.description && (
            <div className="account-tooltip" role="tooltip">
              {account.description}
            </div>
          )}
        </div>
        <span className="script-actions">
          <button type="button" className="primary" disabled={pending} onClick={onLogin}>
            {pending ? 'Logging in…' : 'Login'}
          </button>
          <button type="button" onClick={onEdit}>
            Edit
          </button>
          <button type="button" onClick={onDuplicate}>
            Duplicate
          </button>
          <button type="button" className="danger" onClick={onDelete}>
            Delete
          </button>
        </span>
      </li>
      {loginError && (
        <li className="script-child">
          <p className="error">{loginError}</p>
        </li>
      )}
    </Fragment>
  );
}

export function AccountList({
  accounts,
  pendingId,
  loginErrors,
  tooltipDelaySeconds,
  onLogin,
  onEdit,
  onDuplicate,
  onDelete,
  onRenameGroup,
}: Props): ReactElement {
  // Which group names are expanded — collapsed by default, so the main page
  // shows just the group names until you click into one.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Inline group rename — same shape as ScriptsTab's folder rename.
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  if (accounts.length === 0) {
    return <p className="hint">No saved accounts yet.</p>;
  }

  function toggle(name: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function startRenameGroup(name: string): void {
    setRenamingGroup(name);
    setRenameValue(name);
  }

  function saveRenameGroup(from: string): void {
    const to = renameValue.trim();
    setRenamingGroup(null);
    if (!to || to === from) return;
    onRenameGroup(from, to);
  }

  return (
    <ul className="script-list">
      {groupAccounts(accounts).map((group) => (
        <Fragment key={group.name}>
          <li className="script-row folder-row">
            <button
              type="button"
              className="tree-caret"
              aria-expanded={expanded.has(group.name)}
              onClick={() => toggle(group.name)}
            >
              {expanded.has(group.name) ? '▾' : '▸'}
            </button>
            {renamingGroup === group.name ? (
              <input
                className="name-input folder-rename"
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => saveRenameGroup(group.name)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveRenameGroup(group.name);
                  else if (e.key === 'Escape') setRenamingGroup(null);
                }}
              />
            ) : (
              <span className="folder-name script-name">{group.name}</span>
            )}
            <span className="dim">{group.accounts.length}</span>
            {group.name !== DEFAULT_GROUP_NAME && renamingGroup !== group.name && (
              <span className="script-actions">
                <button
                  type="button"
                  title="Rename group"
                  aria-label={`Rename ${group.name}`}
                  onClick={() => startRenameGroup(group.name)}
                >
                  <span className="ico" aria-hidden="true">
                    ✎
                  </span>
                  <span className="lbl">Rename</span>
                </button>
              </span>
            )}
          </li>
          {expanded.has(group.name) &&
            group.accounts.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                pending={pendingId === account.id}
                loginError={loginErrors[account.id]}
                tooltipDelaySeconds={tooltipDelaySeconds}
                onLogin={() => onLogin(account)}
                onEdit={() => onEdit(account)}
                onDuplicate={() => onDuplicate(account)}
                onDelete={() => onDelete(account)}
              />
            ))}
        </Fragment>
      ))}
    </ul>
  );
}
