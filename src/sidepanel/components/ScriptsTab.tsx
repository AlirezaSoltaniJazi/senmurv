import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { sendRuntimeMessage } from '@/shared/messages';
import { decodeBookmarklet } from '@/shared/bookmarklet';
import { formatJs } from '@/shared/format-js';
import { isFillScript, parseFillScript } from '@/shared/generators';
import {
  applyScriptImport,
  importConflicts,
  parseScriptsImport,
  reorderScripts,
  serializeScripts,
} from '@/shared/script-io';
import type { ImportedScript, ImportMode } from '@/shared/script-io';
import { fieldToStep, isWorkflowScript, parseWorkflowScript } from '@/shared/workflow';
import type { RecorderSeed } from '@/shared/workflow';
import type { Result, SavedScript } from '@/shared/types';
import { newId } from '@/utils/id';

interface Props {
  /** Open a generated fill/flow script in the Recorder tab for customization. */
  onCustomize: (seed: RecorderSeed) => void;
  /** Bumped by the header refresh button to re-pull data from storage. */
  reloadNonce: number;
}

function customizable(code: string): boolean {
  return isFillScript(code) || isWorkflowScript(code);
}

export function ScriptsTab({ onCustomize, reloadNonce }: Props): ReactElement {
  const [scripts, setScripts] = useState<SavedScript[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<ImportedScript[] | null>(null);
  const [pendingSel, setPendingSel] = useState<boolean[]>([]);
  const [importMode, setImportMode] = useState<ImportMode>('overwrite');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

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
      setSelected((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
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
    setSelected(new Set());
    resetEditor();
    setStatus('Deleted all scripts.');
  }

  async function run(script: SavedScript): Promise<void> {
    setError(null);
    setStatus(null);
    const res = await sendRuntimeMessage<Result<void>>({
      type: MESSAGE_TYPES.RUN_SCRIPT,
      payload: { code: script.code },
    });
    if (res.ok) setStatus(`Ran “${script.name}” in the page.`);
    else setError(res.error);
  }

  function decode(): void {
    if (!code.trim()) {
      setError('Paste a javascript: bookmarklet into the editor first.');
      return;
    }
    setCode(decodeBookmarklet(code));
    setStatus('Bookmarklet decoded into the editor.');
  }

  function formatCode(): void {
    if (!code.trim()) return;
    setCode(formatJs(code));
    setStatus('Formatted.');
  }

  function toggleSelect(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Drag-to-reorder ─────────────────────────────────────────────────────────
  function onRowDragStart(e: DragEvent, index: number): void {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index)); // Firefox requires data
  }
  function onRowDragOver(e: DragEvent, index: number): void {
    if (dragIndex === null) return;
    e.preventDefault(); // allow the drop
    e.dataTransfer.dropEffect = 'move';
    if (overIndex !== index) setOverIndex(index);
  }
  function endDrag(): void {
    setDragIndex(null);
    setOverIndex(null);
  }
  async function onRowDrop(e: DragEvent, index: number): Promise<void> {
    e.preventDefault();
    const from = dragIndex;
    endDrag();
    if (from === null) return;
    const prev = scripts;
    const next = reorderScripts(prev, from, index);
    if (next === prev) return;
    setScripts(next); // optimistic — reflect the new order immediately
    const res = await sendRuntimeMessage<Result<SavedScript[]>>({
      type: MESSAGE_TYPES.SET_SCRIPTS,
      payload: { scripts: next },
    });
    if (res.ok) {
      setScripts(res.value);
      setStatus('Reordered scripts.');
    } else {
      setScripts(prev); // roll back the optimistic reorder — the write did not land
      setError(res.error);
    }
  }

  function exportScripts(): void {
    setError(null);
    const picked = scripts.filter((s) => selected.has(s.id));
    const chosen = picked.length ? picked : scripts;
    const blob = new Blob([serializeScripts(chosen)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'senmurv-scripts.json';
    a.click();
    URL.revokeObjectURL(url);
    setStatus(`Exported ${chosen.length} script(s).`);
  }

  async function onImportFile(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    setError(null);
    setStatus(null);
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-importing the same file
    if (!file) return;
    const parsed = parseScriptsImport(await file.text());
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setPending(parsed.value);
    setPendingSel(parsed.value.map(() => true));
  }

  function togglePending(i: number): void {
    setPendingSel((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  }

  function cancelImport(): void {
    setPending(null);
    setPendingSel([]);
  }

  async function confirmImport(): Promise<void> {
    if (!pending) return;
    const chosen = pending.filter((_, i) => pendingSel[i]);
    if (chosen.length === 0) {
      cancelImport();
      return;
    }
    const next = applyScriptImport(scripts, chosen, importMode, Date.now());
    const res = await sendRuntimeMessage<Result<SavedScript[]>>({
      type: MESSAGE_TYPES.SET_SCRIPTS,
      payload: { scripts: next },
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setScripts(res.value);
    cancelImport();
    setStatus(`Imported ${chosen.length} script(s) (${importMode}).`);
  }

  const selectedCount = scripts.filter((s) => selected.has(s.id)).length;
  const hasConflicts = pending?.some((imp) => importConflicts(scripts, imp)) ?? false;

  return (
    <div className="tab">
      <div className="row">
        <button type="button" onClick={exportScripts} disabled={scripts.length === 0}>
          Export{selectedCount ? ` (${selectedCount})` : ''}
        </button>
        <button type="button" onClick={() => fileInputRef.current?.click()}>
          Import
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => void deleteAll()}
          disabled={scripts.length === 0}
        >
          Delete all
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden-file"
          onChange={(e) => void onImportFile(e)}
        />
      </div>

      {pending && (
        <div className="import-panel">
          <h3 className="section-title">Import {pending.length} script(s)</h3>
          {hasConflicts && (
            <div className="row">
              <span className="field-label">Some names already exist:</span>
              <label className="checkbox-inline">
                <input
                  type="radio"
                  name="import-mode"
                  checked={importMode === 'overwrite'}
                  onChange={() => setImportMode('overwrite')}
                />
                Overwrite existing
              </label>
              <label className="checkbox-inline">
                <input
                  type="radio"
                  name="import-mode"
                  checked={importMode === 'keep-both'}
                  onChange={() => setImportMode('keep-both')}
                />
                Keep both
              </label>
            </div>
          )}
          <ul className="script-list">
            {pending.map((imp, i) => (
              <li key={`${imp.name}-${i}`} className="script-row">
                <input
                  type="checkbox"
                  checked={pendingSel[i] ?? false}
                  onChange={() => togglePending(i)}
                />
                <span className="script-name">{imp.name}</span>
                {importConflicts(scripts, imp) && <span className="badge conflict">exists</span>}
              </li>
            ))}
          </ul>
          <div className="row">
            <button type="button" className="primary" onClick={() => void confirmImport()}>
              Import {pendingSel.filter(Boolean).length}
            </button>
            <button type="button" onClick={cancelImport}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <ul className="script-list">
        {scripts.length === 0 && <li className="hint">No saved scripts yet.</li>}
        {scripts.map((s, i) => (
          <li
            key={s.id}
            className={
              'script-row' +
              (dragIndex === i ? ' dragging' : '') +
              (overIndex === i && dragIndex !== i ? ' drag-over' : '')
            }
            onDragOver={(e) => onRowDragOver(e, i)}
            onDrop={(e) => void onRowDrop(e, i)}
          >
            <span
              className="drag-handle"
              draggable
              onDragStart={(e) => onRowDragStart(e, i)}
              onDragEnd={endDrag}
              title="Drag to reorder"
              aria-label="Drag to reorder"
            >
              ⠿
            </span>
            <input
              type="checkbox"
              checked={selected.has(s.id)}
              onChange={() => toggleSelect(s.id)}
              title="Select for export"
            />
            <span className="script-name">{s.name}</span>
            <span className="script-actions">
              <button type="button" className="primary" onClick={() => void run(s)}>
                Run
              </button>
              <button type="button" onClick={() => editScript(s)}>
                Edit
              </button>
              {customizable(s.code) && (
                <button type="button" onClick={() => customizeScript(s)}>
                  Customize
                </button>
              )}
              <button type="button" className="danger" onClick={() => void remove(s.id)}>
                Delete
              </button>
            </span>
          </li>
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
        <button type="button" onClick={formatCode}>
          Format
        </button>
        <button type="button" onClick={decode}>
          Decode bookmarklet
        </button>
      </div>

      {status && <p className="status">{status}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
