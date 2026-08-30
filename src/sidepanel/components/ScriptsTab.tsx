import { Fragment, useEffect, useRef, useState } from 'react';
import type { DragEvent, ReactElement } from 'react';
import { browser } from '@/shared/browser-api';
import { MESSAGE_TYPES } from '@/shared/constants';
import { sendRuntimeMessage } from '@/shared/messages';
import { decodeBookmarklet } from '@/shared/bookmarklet';
import { isFillScript, parseFillScript } from '@/shared/generators';
import {
  buildScriptTree,
  deleteFolder,
  filterScriptTree,
  moveScriptBefore,
  nestScript,
  newFolder,
  ungroupScript,
} from '@/shared/script-io';
import { configForRegion, findRegion, REGIONS } from '@/shared/tools/region';
import {
  fieldToStep,
  isWorkflowScript,
  parseWorkflowScript,
  toAwaitableScript,
} from '@/shared/workflow';
import type { RecorderSeed } from '@/shared/workflow';
import type { Result, SavedScript, ScriptSeed } from '@/shared/types';
import { newId } from '@/utils/id';
import { IconActionButton } from './IconActionButton';

interface Props {
  /** Open a generated fill/flow script in the Recorder tab for customization. */
  onCustomize: (seed: RecorderSeed) => void;
  /** Bumped by the header refresh button to re-pull data from storage. */
  reloadNonce: number;
  /** A script handed over from another tool (e.g. Tools → Bypass), loaded once. */
  seed: ScriptSeed | null;
  onSeedConsumed: () => void;
}

function customizable(code: string): boolean {
  return isFillScript(code) || isWorkflowScript(code);
}

export function ScriptsTab({
  onCustomize,
  reloadNonce,
  seed,
  onSeedConsumed,
}: Props): ReactElement {
  const [scripts, setScripts] = useState<SavedScript[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped on each Run and on Stop, so a stale RUN_SCRIPT response (from a run the
  // user has since stopped or superseded) can't clear a newer row's toggle.
  const runTokenRef = useRef(0);
  const [query, setQuery] = useState('');
  // 'none', or a REGIONS id — applied before RUN_SCRIPT and restored after.
  const [regionId, setRegionId] = useState<string>('none');
  // Drag-to-group/reorder: which row is being dragged, which it's over, and whether
  // dropping would nest under it (pointer in the row body) or reorder before it
  // (pointer near the top edge).
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dropIntent, setDropIntent] = useState<'nest' | 'before'>('nest');
  // Collapsed folders (expanded by default).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Inline folder rename.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  // The script whose Run button is currently toggled to Stop. Runs are fire-and-
  // forget (no completion signal), so this clears only on Stop or a new Run.
  const [runningId, setRunningId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await sendRuntimeMessage<Result<SavedScript[]>>({
        type: MESSAGE_TYPES.GET_SCRIPTS,
      });
      if (!cancelled && res.ok) setScripts(res.value);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadNonce]);

  // One-shot seed from Tools → Bypass (loads into the editor, then clears).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!seed) return;
    setEditingId(null);
    setName(seed.name);
    setCode(seed.code);
    setStatus('Loaded from Tools — review, then Save or Run.');
    onSeedConsumed();
  }, [seed, onSeedConsumed]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function resetEditor(): void {
    setEditingId(null);
    setName('');
    setCode('');
    setStatus(null);
    setError(null);
  }

  function editScript(s: SavedScript): void {
    setEditingId(s.id);
    setName(s.name);
    setCode(s.code);
    setStatus(null);
    setError(null);
  }

  function customizeScript(s: SavedScript): void {
    if (isWorkflowScript(s.code)) {
      const steps = parseWorkflowScript(s.code);
      if (steps) {
        onCustomize({ steps, name: s.name });
        return;
      }
    } else if (isFillScript(s.code)) {
      // Legacy fill scripts open as editable Fill steps.
      const fields = parseFillScript(s.code);
      if (fields) {
        onCustomize({ steps: fields.map(fieldToStep), name: s.name });
        return;
      }
    }
    setError(
      `"${s.name}" isn't a generated fill/flow script, so it can't be customized in Recorder.`
    );
  }

  async function save(): Promise<void> {
    setError(null);
    setStatus(null);
    const trimmedName = name.trim();
    if (!trimmedName || !code.trim()) {
      setError('Name and code are both required.');
      return;
    }
    const now = Date.now();
    const existing = scripts.find((s) => s.id === editingId);
    const script: SavedScript = existing
      ? { ...existing, name: trimmedName, code, updatedAt: now }
      : { id: newId('scr_'), name: trimmedName, code, createdAt: now, updatedAt: now };

    const res = await sendRuntimeMessage<Result<SavedScript[]>>({
      type: MESSAGE_TYPES.SAVE_SCRIPT,
      payload: { script },
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setScripts(res.value);
    setEditingId(script.id);
    setStatus('Saved.');
  }

  async function remove(id: string): Promise<void> {
    const res = await sendRuntimeMessage<Result<SavedScript[]>>({
      type: MESSAGE_TYPES.DELETE_SCRIPT,
      payload: { id },
    });
    if (res.ok) {
      setScripts(res.value);
      if (editingId === id) resetEditor();
    }
  }

  async function deleteAll(): Promise<void> {
    if (scripts.length === 0) return;
    if (!window.confirm(`Delete all ${scripts.length} script(s)? This cannot be undone.`)) return;
    const res = await sendRuntimeMessage<Result<SavedScript[]>>({
      type: MESSAGE_TYPES.SET_SCRIPTS,
      payload: { scripts: [] },
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setScripts([]);
    resetEditor();
    setStatus('Deleted all scripts.');
  }

  async function run(script: SavedScript): Promise<void> {
    setError(null);
    setStatus(null);
    const token = ++runTokenRef.current;
    let regionApplied = false;
    if (regionId !== 'none') {
      const region = findRegion(regionId);
      if (region) {
        const regionRes = await sendRuntimeMessage<Result<void>>({
          type: MESSAGE_TYPES.APPLY_REGION,
          payload: { config: configForRegion(region, true) },
        });
        if (!regionRes.ok) {
          setError(regionRes.error);
          return;
        }
        regionApplied = true;
      }
    }
    setRunningId(script.id); // toggle this row's Run → Stop
    const res = await sendRuntimeMessage<Result<void>>({
      type: MESSAGE_TYPES.RUN_SCRIPT,
      payload: { code: toAwaitableScript(script.code) },
    });
    if (regionApplied) {
      await sendRuntimeMessage({ type: MESSAGE_TYPES.RESTORE_REGION });
    }
    // A Flow's response arrives when its steps FINISH (the runner awaits the flow
    // promise); a plain script's arrives when it returns. Either way, the run is
    // over — revert the toggle. Skip a stale result the user already stopped/re-ran.
    if (runTokenRef.current !== token) return;
    setRunningId(null);
    if (res.ok) setStatus(`Ran “${script.name}” in the page.`);
    else setError(res.error);
  }

  // A raw JS script can't be interrupted mid-run (a synchronous new Function(code)()
  // blocks the page's thread), so Stop hard-reloads the active tab — which halts
  // anything the script started (timers/intervals) and also stops a running Flow.
  function stopScript(): void {
    runTokenRef.current += 1; // invalidate the in-flight run() (its page is reloading)
    setRunningId(null);
    void browser.tabs
      .query({ active: true, lastFocusedWindow: true })
      .then((tabs) => {
        const id = tabs[0]?.id;
        return typeof id === 'number' ? browser.tabs.reload(id) : undefined;
      })
      .catch(() => undefined);
    setStatus('Reloaded the page to stop any running script.');
  }

  function decode(): void {
    if (!code.trim()) {
      setError('Paste a javascript: bookmarklet into the editor first.');
      return;
    }
    setCode(decodeBookmarklet(code));
    setStatus('Bookmarklet decoded into the editor.');
  }

  async function formatCode(): Promise<void> {
    if (!code.trim()) return;
    try {
      // Lazy-load js-beautify (~106 KB) only when the user actually formats, so
      // it stays out of the Scripts-tab open payload.
      const { formatJs } = await import('@/shared/format-js');
      setCode(formatJs(code));
      setStatus('Formatted.');
    } catch (err) {
      setError(`Could not format: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Drag to group (nest) or reorder ─────────────────────────────────────────
  function onRowDragStart(e: DragEvent, id: string): void {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id); // Firefox requires data
  }
  function onRowDragOver(e: DragEvent, id: string): void {
    if (dragId === null) return;
    e.preventDefault(); // allow the drop
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const intent: 'nest' | 'before' = e.clientY < rect.top + rect.height * 0.35 ? 'before' : 'nest';
    if (overId !== id || dropIntent !== intent) {
      setOverId(id);
      setDropIntent(intent);
    }
  }
  function endDrag(): void {
    setDragId(null);
    setOverId(null);
  }
  /** Optimistically apply `next`, persist it, and roll back if the write fails. */
  async function persistScripts(next: SavedScript[], msg: string): Promise<void> {
    const prev = scripts;
    if (next === prev) return;
    setScripts(next);
    const res = await sendRuntimeMessage<Result<SavedScript[]>>({
      type: MESSAGE_TYPES.SET_SCRIPTS,
      payload: { scripts: next },
    });
    if (res.ok) {
      setScripts(res.value);
      setStatus(msg);
    } else {
      setScripts(prev);
      setError(res.error);
    }
  }
  async function onRowDrop(e: DragEvent, id: string): Promise<void> {
    e.preventDefault();
    const from = dragId;
    const intent = dropIntent;
    endDrag();
    if (from === null || from === id) return;
    const next =
      intent === 'nest' ? nestScript(scripts, from, id) : moveScriptBefore(scripts, from, id);
    await persistScripts(next, intent === 'nest' ? 'Grouped scripts.' : 'Reordered scripts.');
  }
  function toggleCollapse(id: string): void {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Folders ─────────────────────────────────────────────────────────────────
  async function createFolder(): Promise<void> {
    const folder = newFolder('New folder', Date.now());
    await persistScripts([...scripts, folder], 'Folder created.');
    setRenamingId(folder.id); // open it for renaming straight away
    setRenameValue(folder.name);
  }
  function startRename(folder: SavedScript): void {
    setRenamingId(folder.id);
    setRenameValue(folder.name);
  }
  async function saveRename(id: string): Promise<void> {
    const name = renameValue.trim();
    setRenamingId(null);
    if (!name) return;
    await persistScripts(
      scripts.map((s) => (s.id === id ? { ...s, name, updatedAt: Date.now() } : s)),
      'Renamed folder.'
    );
  }
  async function removeFolder(id: string): Promise<void> {
    const folder = scripts.find((s) => s.id === id);
    const count = scripts.filter((s) => s.parentId === id).length;
    const msg =
      count > 0
        ? `Delete folder “${folder?.name}”? Its ${count} script(s) move back to the top level.`
        : `Delete folder “${folder?.name}”?`;
    if (!window.confirm(msg)) return;
    await persistScripts(deleteFolder(scripts, id), 'Folder deleted.');
    setCollapsed((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  /** Row className string; `canNest` gates the nest-drop highlight. */
  function rowClass(id: string, extra: string, canNest: boolean): string {
    return (
      'script-row' +
      extra +
      (dragId === id ? ' dragging' : '') +
      (canNest && overId === id && dragId !== id && dropIntent === 'nest'
        ? ' drag-nest-over'
        : '') +
      (overId === id && dragId !== id && dropIntent === 'before' ? ' drag-over' : '')
    );
  }
  function handle(id: string, label: string): ReactElement {
    return (
      <span
        className="drag-handle"
        draggable
        onDragStart={(e) => onRowDragStart(e, id)}
        onDragEnd={endDrag}
        title={label}
        aria-label={label}
      >
        ⠿
      </span>
    );
  }

  /** A folder header row: caret, 📁, name (rename inline), child count, actions. */
  function renderFolder(folder: SavedScript, childCount: number): ReactElement {
    const isCollapsed = collapsed.has(folder.id);
    return (
      <li
        key={folder.id}
        data-script-id={folder.id}
        className={rowClass(folder.id, ' folder-row', true)}
        onDragOver={(e) => onRowDragOver(e, folder.id)}
        onDrop={(e) => void onRowDrop(e, folder.id)}
      >
        {handle(folder.id, 'Drag to reorder')}
        {childCount > 0 ? (
          <button
            type="button"
            className="tree-caret"
            onClick={() => toggleCollapse(folder.id)}
            aria-label={isCollapsed ? 'Expand folder' : 'Collapse folder'}
          >
            {isCollapsed ? '▸' : '▾'}
          </button>
        ) : (
          <span className="tree-caret-spacer" aria-hidden="true" />
        )}
        <span className="folder-icon" aria-hidden="true">
          📁
        </span>
        {renamingId === folder.id ? (
          <input
            className="name-input folder-rename"
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => void saveRename(folder.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveRename(folder.id);
              else if (e.key === 'Escape') setRenamingId(null);
            }}
          />
        ) : (
          <span className="script-name folder-name">
            {folder.name}
            <span className="dim"> ({childCount})</span>
          </span>
        )}
        <span className="script-actions">
          <button
            type="button"
            title="Rename folder"
            aria-label="Rename folder"
            onClick={() => startRename(folder)}
          >
            <span className="ico" aria-hidden="true">
              ✎
            </span>
            <span className="lbl">Rename</span>
          </button>
          <button
            type="button"
            className="danger"
            title="Delete folder"
            aria-label="Delete folder"
            onClick={() => void removeFolder(folder.id)}
          >
            <span className="ico" aria-hidden="true">
              ✕
            </span>
            <span className="lbl">Delete</span>
          </button>
        </span>
      </li>
    );
  }

  /** A script row (top-level or inside a folder). */
  function renderScript(s: SavedScript, isChild: boolean): ReactElement {
    return (
      <li
        key={s.id}
        data-script-id={s.id}
        className={rowClass(s.id, isChild ? ' script-child' : '', isChild)}
        onDragOver={(e) => onRowDragOver(e, s.id)}
        onDrop={(e) => void onRowDrop(e, s.id)}
      >
        {handle(s.id, isChild ? 'Drag to reorder or out' : 'Drag onto a folder to group it')}
        {/* Top-level scripts get the caret-column spacer to align under a folder;
            children are already indented, so they skip it (no wasted lead-in gap). */}
        {!isChild && <span className="tree-caret-spacer" aria-hidden="true" />}
        <span className="script-name">{s.name}</span>
        <span className="script-actions">
          {isChild && (
            <button
              type="button"
              title="Move out of the folder (to the top level)"
              aria-label="Ungroup"
              onClick={() =>
                void persistScripts(ungroupScript(scripts, s.id), 'Moved to top level.')
              }
            >
              ↥
            </button>
          )}
          {runningId === s.id ? (
            <button
              type="button"
              className="danger"
              title="Stop (reloads the page)"
              aria-label="Stop"
              onClick={() => stopScript()}
            >
              <span className="ico ico-stop" aria-hidden="true" />
              <span className="lbl">Stop</span>
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              title="Run"
              aria-label="Run"
              onClick={() => void run(s)}
            >
              <span className="ico ico-play" aria-hidden="true" />
              <span className="lbl">Run</span>
            </button>
          )}
          <button type="button" title="Edit" aria-label="Edit" onClick={() => editScript(s)}>
            <span className="ico" aria-hidden="true">
              ✎
            </span>
            <span className="lbl">Edit</span>
          </button>
          {customizable(s.code) && (
            <button
              type="button"
              title="Customize in the Recorder"
              aria-label="Customize"
              onClick={() => customizeScript(s)}
            >
              <span className="ico" aria-hidden="true">
                ⚙
              </span>
              <span className="lbl">Customize</span>
            </button>
          )}
          <button
            type="button"
            className="danger"
            title="Delete"
            aria-label="Delete"
            onClick={() => void remove(s.id)}
          >
            <span className="ico" aria-hidden="true">
              ✕
            </span>
            <span className="lbl">Delete</span>
          </button>
        </span>
      </li>
    );
  }

  const shown = filterScriptTree(buildScriptTree(scripts), query);

  return (
    <div className="tab">
      <div className="row">
        <IconActionButton
          icon="+"
          label="New folder"
          className="primary"
          onClick={() => void createFolder()}
        />
        <IconActionButton
          icon="✕"
          label="Delete all"
          className="danger"
          disabled={scripts.length === 0}
          onClick={() => void deleteAll()}
        />
        <label className="field-label" htmlFor="scripts-region">
          Run in region
        </label>
        <select
          id="scripts-region"
          value={regionId}
          onChange={(e) => setRegionId(e.target.value)}
          title="Emulate a region's clock, timezone and locale for the duration of the run"
        >
          <option value="none">None</option>
          {REGIONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.flag} {r.label}
            </option>
          ))}
        </select>
      </div>

      <div className="row">
        <input
          className="name-input"
          placeholder="Search scripts"
          aria-label="Search scripts"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <ul className="script-list">
        {scripts.length === 0 && <li className="hint">No saved scripts yet.</li>}
        {scripts.length > 0 && shown.length === 0 && (
          <li className="hint">No scripts match your search.</li>
        )}
        {shown.map((g) => (
          <Fragment key={g.parent.id}>
            {g.parent.isFolder
              ? renderFolder(g.parent, g.children.length)
              : renderScript(g.parent, false)}
            {g.parent.isFolder &&
              !collapsed.has(g.parent.id) &&
              g.children.map((c) => renderScript(c, true))}
          </Fragment>
        ))}
      </ul>

      <h3 className="section-title">{editingId ? 'Edit script' : 'New script'}</h3>
      <input
        className="name-input"
        placeholder="Script name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <textarea
        className="code-input"
        spellCheck={false}
        placeholder="// paste JS, or a javascript: bookmarklet then click Import / decode"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <div className="row">
        <button type="button" className="primary" onClick={() => void save()}>
          Save
        </button>
        <button type="button" onClick={resetEditor}>
          New
        </button>
        <button type="button" onClick={() => void formatCode()}>
          Format
        </button>
        <button type="button" onClick={decode}>
          Decode bookmarklet
        </button>
        <button
          type="button"
          className="danger"
          title="Stop a running script by reloading the current page"
          onClick={stopScript}
        >
          Stop (reloads page)
        </button>
      </div>

      {status && <p className="status">{status}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
