import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, ReactElement } from 'react';
import { DEFAULT_GROUP_NAME, groupAccounts, reorderGroups } from '@/shared/accounts';
import type { Account } from '@/shared/types';

interface Props {
  accounts: Account[];
  /** Manual display order of real groups (Default excluded — it always
   *  sorts first); see `reorderGroups`/`moveGroupBefore`. */
  groupOrder: string[];
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
  /** Drag an account onto a group's header row — moves it there (last item). */
  onMoveToGroup: (id: string, group: string) => void;
  /** Drag an account onto another row — reorders it just before that one
   *  (a no-op unless both are already in the same group; see
   *  `moveAccountBefore`). */
  onMoveBefore: (movingId: string, targetId: string) => void;
  /** Drag a group's header onto another group's header — reorders it just
   *  before that one (see `moveGroupBefore`). Default is never draggable. */
  onMoveGroupBefore: (movingName: string, targetName: string) => void;
}

interface AccountRowProps {
  account: Account;
  pending: boolean;
  loginError: string | undefined;
  tooltipDelaySeconds: number;
  dragging: boolean;
  dragOver: boolean;
  onLogin: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}

/** One account row, plus its own hover-delay tooltip state — a per-row hook
 *  (start/clear a timer, show/hide) can't live in the parent's .map() body. */
function AccountRow({
  account,
  pending,
  loginError,
  tooltipDelaySeconds,
  dragging,
  dragOver,
  onLogin,
  onEdit,
  onDuplicate,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
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
      <li
        className={
          'script-row script-child' + (dragging ? ' dragging' : '') + (dragOver ? ' drag-over' : '')
        }
        onMouseEnter={startHover}
        onMouseLeave={endHover}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <span
          className="drag-handle"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          title="Drag to reorder or move to another group"
          aria-label="Drag to reorder or move to another group"
        >
          ⠿
        </span>
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
  groupOrder,
  pendingId,
  loginErrors,
  tooltipDelaySeconds,
  onLogin,
  onEdit,
  onDuplicate,
  onDelete,
  onRenameGroup,
  onMoveToGroup,
  onMoveBefore,
  onMoveGroupBefore,
}: Props): ReactElement {
  // Which group names are expanded — collapsed by default, so the main page
  // shows just the group names until you click into one.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Inline group rename — same shape as ScriptsTab's folder rename.
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  // Drag an account onto a group's header row to move it there, onto
  // another account row to reorder before it, or drag a group's own header
  // onto another group's header to reorder the groups themselves — same
  // drag-and-drop shape as ScriptsTab's folder/script nesting, minus the
  // "nest onto a sibling" shortcut: a group header always means "move here"
  // (or "reorder groups", when the dragged thing is itself a group), an
  // account row always means "reorder before this one" (moveAccountBefore
  // no-ops across groups on its own, so no extra guard is needed here).
  // `dragId` holds an account id or a group name depending on `dragKind` —
  // the two never collide (account ids are `acct_`-prefixed).
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragKind, setDragKind] = useState<'account' | 'group' | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  // Memoized on its real dependencies — this previously re-bucketed and
  // re-sorted every account on every render (e.g. a drag-hover updating
  // `overId`, or a per-row tooltip timer), not just when accounts/groupOrder
  // actually changed.
  const groups = useMemo(
    () => reorderGroups(groupAccounts(accounts), groupOrder),
    [accounts, groupOrder]
  );

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

  function onAccountDragStart(e: DragEvent, id: string): void {
    setDragId(id);
    setDragKind('account');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id); // Firefox requires data
  }
  function onGroupDragStart(e: DragEvent, name: string): void {
    setDragId(name);
    setDragKind('group');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', name); // Firefox requires data
  }
  function onRowDragOver(e: DragEvent, id: string): void {
    if (dragId === null || dragId === id) return;
    e.preventDefault(); // allow the drop
    e.dataTransfer.dropEffect = 'move';
    if (overId !== id) setOverId(id);
  }
  function endDrag(): void {
    setDragId(null);
    setDragKind(null);
    setOverId(null);
  }
  function onGroupDrop(e: DragEvent, groupName: string): void {
    e.preventDefault();
    const id = dragId;
    const kind = dragKind;
    endDrag();
    if (id === null) return;
    if (kind === 'group') {
      if (id !== groupName) onMoveGroupBefore(id, groupName);
    } else {
      onMoveToGroup(id, groupName);
    }
  }
  function onAccountDrop(e: DragEvent, targetId: string): void {
    e.preventDefault();
    const movingId = dragId;
    const kind = dragKind;
    endDrag();
    if (kind !== 'account' || movingId === null || movingId === targetId) return;
    onMoveBefore(movingId, targetId);
  }

  return (
    <ul className="script-list">
      {groups.map((group) => (
        <Fragment key={group.name}>
          <li
            className={
              'script-row folder-row' +
              (dragId !== null && overId === group.name ? ' drag-nest-over' : '') +
              (dragKind === 'group' && dragId === group.name ? ' dragging' : '')
            }
            onDragOver={(e) => onRowDragOver(e, group.name)}
            onDrop={(e) => onGroupDrop(e, group.name)}
          >
            {group.name === DEFAULT_GROUP_NAME ? (
              <span className="drag-handle-spacer" aria-hidden="true" />
            ) : (
              <span
                className="drag-handle"
                draggable
                onDragStart={(e) => onGroupDragStart(e, group.name)}
                onDragEnd={endDrag}
                title="Drag to reorder groups"
                aria-label="Drag to reorder groups"
              >
                ⠿
              </span>
            )}
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
                dragging={dragId === account.id}
                dragOver={overId === account.id}
                onLogin={() => onLogin(account)}
                onEdit={() => onEdit(account)}
                onDuplicate={() => onDuplicate(account)}
                onDelete={() => onDelete(account)}
                onDragStart={(e) => onAccountDragStart(e, account.id)}
                onDragEnd={endDrag}
                onDragOver={(e) => onRowDragOver(e, account.id)}
                onDrop={(e) => onAccountDrop(e, account.id)}
              />
            ))}
        </Fragment>
      ))}
    </ul>
  );
}
