import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { sendRuntimeMessage } from '@/shared/messages';
import {
  applyChecklistImport,
  applyNoteImport,
  applyProfileImport,
  applyQueryParamSetImport,
  checklistImportConflicts,
  noteImportConflicts,
  parseChecklistsImport,
  parseNotesImport,
  parseProfilesImport,
  parseQueryParamSetsImport,
  profileImportConflicts,
  queryParamSetImportConflicts,
  serializeChecklists,
  serializeNotes,
  serializeProfiles,
  serializeQueryParamSets,
} from '@/shared/data-io';
import type {
  ImportedChecklist,
  ImportedNote,
  ImportedProfile,
  ImportedQueryParamSet,
} from '@/shared/data-io';
import { PROFILE_TARGET_LABELS } from '@/shared/profiles';
import {
  applyScriptImport,
  buildScriptTree,
  importConflicts,
  parseScriptsImport,
  serializeScripts,
} from '@/shared/script-io';
import type { ImportedScript, ImportMode } from '@/shared/script-io';
import type { Checklist, Note, Result, SavedScript, ValueProfile } from '@/shared/types';
import type { QueryParamSet } from '@/shared/tools/query-params';

interface Props {
  /** Bumped by the header refresh button to re-pull data from storage. */
  reloadNonce: number;
}

type Kind = 'scripts' | 'profiles' | 'queryParams' | 'notes' | 'checklists';

const KINDS: { key: Kind; label: string }[] = [
  { key: 'scripts', label: 'Scripts' },
  { key: 'profiles', label: 'Profiles' },
  { key: 'queryParams', label: 'Query params' },
  { key: 'notes', label: 'Notes' },
  { key: 'checklists', label: 'My Tasks' },
];

/** A staged import, tagged with the kind it was parsed as (so a kind switch can't mix them up). */
type PendingImport =
  | { kind: 'scripts'; items: ImportedScript[] }
  | { kind: 'profiles'; items: ImportedProfile[] }
  | { kind: 'queryParams'; items: ImportedQueryParamSet[] }
  | { kind: 'notes'; items: ImportedNote[] }
  | { kind: 'checklists'; items: ImportedChecklist[] };

/** One row in the staged-import panel. */
interface PendingRow {
  key: string;
  label: string;
  conflict: boolean;
}

/** One row in an export checkbox list (id to select + the readable label). */
interface ExportRow {
  id: string;
  label: string;
}

function download(json: string, filename: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DataIOTab({ reloadNonce }: Props): ReactElement {
  const [kind, setKind] = useState<Kind>('scripts');
  const [scripts, setScripts] = useState<SavedScript[]>([]);
  const [profiles, setProfiles] = useState<ValueProfile[]>([]);
  const [sets, setSets] = useState<QueryParamSet[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [pendingSel, setPendingSel] = useState<boolean[]>([]);
  const [importMode, setImportMode] = useState<ImportMode>('overwrite');

  // Load the active kind's full list on mount and whenever it (or reloadNonce)
  // changes. Only the active kind is fetched — the other four lists are pulled
  // lazily, the first time their chip is selected.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      switch (kind) {
        case 'scripts': {
          const res = await sendRuntimeMessage<Result<SavedScript[]>>({
            type: MESSAGE_TYPES.GET_SCRIPTS,
          });
          if (!cancelled && res.ok) setScripts(res.value);
          return;
        }
        case 'profiles': {
          const res = await sendRuntimeMessage<Result<ValueProfile[]>>({
            type: MESSAGE_TYPES.GET_PROFILES,
          });
          if (!cancelled && res.ok) setProfiles(res.value);
          return;
        }
        case 'queryParams': {
          const res = await sendRuntimeMessage<Result<QueryParamSet[]>>({
            type: MESSAGE_TYPES.GET_QUERY_PARAM_SETS,
          });
          if (!cancelled && res.ok) setSets(res.value);
          return;
        }
        case 'notes': {
          const res = await sendRuntimeMessage<Result<Note[]>>({ type: MESSAGE_TYPES.GET_NOTES });
          if (!cancelled && res.ok) setNotes(res.value);
          return;
        }
        case 'checklists': {
          const res = await sendRuntimeMessage<Result<Checklist[]>>({
            type: MESSAGE_TYPES.GET_CHECKLISTS,
          });
          if (!cancelled && res.ok) setChecklists(res.value);
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, reloadNonce]);

  // Export selections and any staged import belong to whichever kind was
  // showing when they were made — switching kind starts both over.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSelected(new Set());
    setPending(null);
    setPendingSel([]);
    setStatus(null);
    setError(null);
  }, [kind]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function toggleSelect(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** A folder's checkbox cascades to all its children (both selecting and deselecting). */
  function toggleSelectFolder(folderId: string, childIds: string[]): void {
    setSelected((prev) => {
      const next = new Set(prev);
      const willSelect = !next.has(folderId);
      if (willSelect) {
        next.add(folderId);
        for (const id of childIds) next.add(id);
      } else {
        next.delete(folderId);
        for (const id of childIds) next.delete(id);
      }
      return next;
    });
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  function exportScripts(): void {
    setError(null);
    // Checking a folder auto-includes its children even if they weren't
    // individually checked, so a grouping can't be silently split on export.
    const chosen =
      selected.size > 0
        ? scripts.filter(
            (s) => selected.has(s.id) || (s.parentId !== undefined && selected.has(s.parentId))
          )
        : scripts;
    download(serializeScripts(chosen), 'senmurv-scripts.json');
    setStatus(`Exported ${chosen.length} script(s).`);
  }

  function exportProfiles(): void {
    setError(null);
    const chosen = selected.size > 0 ? profiles.filter((p) => selected.has(p.id)) : profiles;
    download(serializeProfiles(chosen), 'senmurv-profiles.json');
    setStatus(`Exported ${chosen.length} profile(s).`);
  }

  function exportQueryParamSets(): void {
    setError(null);
    const chosen = selected.size > 0 ? sets.filter((s) => selected.has(s.id)) : sets;
    download(serializeQueryParamSets(chosen), 'senmurv-query-params.json');
    setStatus(`Exported ${chosen.length} query-param set(s).`);
  }

  function exportNotes(): void {
    setError(null);
    const chosen = selected.size > 0 ? notes.filter((n) => selected.has(n.id)) : notes;
    download(serializeNotes(chosen), 'senmurv-notes.json');
    setStatus(`Exported ${chosen.length} note(s).`);
  }

  function exportChecklists(): void {
    setError(null);
    const chosen = selected.size > 0 ? checklists.filter((c) => selected.has(c.id)) : checklists;
    download(serializeChecklists(chosen), 'senmurv-checklists.json');
    setStatus(`Exported ${chosen.length} checklist(s).`);
  }

  function exportCurrent(): void {
    switch (kind) {
      case 'scripts':
        exportScripts();
        return;
      case 'profiles':
        exportProfiles();
        return;
      case 'queryParams':
        exportQueryParamSets();
        return;
      case 'notes':
        exportNotes();
        return;
      case 'checklists':
        exportChecklists();
        return;
    }
  }

  function currentCount(): number {
    switch (kind) {
      case 'scripts':
        return scripts.length;
      case 'profiles':
        return profiles.length;
      case 'queryParams':
        return sets.length;
      case 'notes':
        return notes.length;
      case 'checklists':
        return checklists.length;
    }
  }

  // ── Import ──────────────────────────────────────────────────────────────────

  async function onImportFile(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    setError(null);
    setStatus(null);
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-importing the same file
    if (!file) return;
    const text = await file.text();
    switch (kind) {
      case 'scripts': {
        const parsed = parseScriptsImport(text);
        if (!parsed.ok) {
          setError(parsed.error);
          return;
        }
        setPending({ kind: 'scripts', items: parsed.value });
        setPendingSel(parsed.value.map(() => true));
        return;
      }
      case 'profiles': {
        const parsed = parseProfilesImport(text);
        if (!parsed.ok) {
          setError(parsed.error);
          return;
        }
        setPending({ kind: 'profiles', items: parsed.value });
        setPendingSel(parsed.value.map(() => true));
        return;
      }
      case 'queryParams': {
        const parsed = parseQueryParamSetsImport(text);
        if (!parsed.ok) {
          setError(parsed.error);
          return;
        }
        setPending({ kind: 'queryParams', items: parsed.value });
        setPendingSel(parsed.value.map(() => true));
        return;
      }
      case 'notes': {
        const parsed = parseNotesImport(text);
        if (!parsed.ok) {
          setError(parsed.error);
          return;
        }
        setPending({ kind: 'notes', items: parsed.value });
        setPendingSel(parsed.value.map(() => true));
        return;
      }
      case 'checklists': {
        const parsed = parseChecklistsImport(text);
        if (!parsed.ok) {
          setError(parsed.error);
          return;
        }
        setPending({ kind: 'checklists', items: parsed.value });
        setPendingSel(parsed.value.map(() => true));
        return;
      }
    }
  }

  /** Staged-import panel rows: a readable label + a conflict flag, per kind. */
  function pendingRows(p: PendingImport): PendingRow[] {
    switch (p.kind) {
      case 'scripts':
        return p.items.map((imp, i) => ({
          key: `${imp.name}-${i}`,
          label: imp.isFolder === true ? `📁 ${imp.name}` : imp.name,
          conflict: importConflicts(scripts, imp),
        }));
      case 'profiles':
        return p.items.map((imp, i) => ({
          key: `${imp.name}-${i}`,
          label: `${imp.name} (${PROFILE_TARGET_LABELS[imp.target]})`,
          conflict: profileImportConflicts(profiles, imp),
        }));
      case 'queryParams':
        return p.items.map((imp, i) => ({
          key: `${imp.name}-${i}`,
          label: imp.name,
          conflict: queryParamSetImportConflicts(sets, imp),
        }));
      case 'notes':
        return p.items.map((imp, i) => ({
          key: `${imp.title}-${i}`,
          label: imp.title.trim() === '' ? '(untitled)' : imp.title,
          conflict: noteImportConflicts(notes, imp),
        }));
      case 'checklists':
        return p.items.map((imp, i) => ({
          key: `${imp.title}-${i}`,
          label: imp.title,
          conflict: checklistImportConflicts(checklists, imp),
        }));
    }
  }

  // Checking a staged folder's checkbox also selects its staged children (and
  // clearing it clears them) — mirrors the export tree's toggleSelectFolder, so
  // a folder can't look selected while a script inside it silently isn't.
  function togglePending(i: number): void {
    setPendingSel((prev) => {
      const next = prev.map((v, idx) => (idx === i ? !v : v));
      if (pending && pending.kind === 'scripts') {
        const folder = pending.items[i];
        if (folder?.isFolder === true && folder.id !== undefined) {
          const value = next[i]!;
          pending.items.forEach((item, idx) => {
            if (item.parentId === folder.id) next[idx] = value;
          });
        }
      }
      return next;
    });
  }

  function cancelImport(): void {
    setPending(null);
    setPendingSel([]);
  }

  async function confirmImport(): Promise<void> {
    if (!pending) return;
    const now = Date.now();

    switch (pending.kind) {
      case 'scripts': {
        const chosen = pending.items.filter((_, i) => pendingSel[i]);
        if (chosen.length === 0) {
          cancelImport();
          return;
        }
        const next = applyScriptImport(scripts, chosen, importMode, now);
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
        return;
      }
      case 'profiles': {
        const chosen = pending.items.filter((_, i) => pendingSel[i]);
        if (chosen.length === 0) {
          cancelImport();
          return;
        }
        const next = applyProfileImport(profiles, chosen, importMode, now);
        const res = await sendRuntimeMessage<Result<ValueProfile[]>>({
          type: MESSAGE_TYPES.SET_PROFILES,
          payload: { profiles: next },
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setProfiles(res.value);
        cancelImport();
        setStatus(`Imported ${chosen.length} profile(s) (${importMode}).`);
        return;
      }
      case 'queryParams': {
        const chosen = pending.items.filter((_, i) => pendingSel[i]);
        if (chosen.length === 0) {
          cancelImport();
          return;
        }
        const next = applyQueryParamSetImport(sets, chosen, importMode, now);
        const res = await sendRuntimeMessage<Result<QueryParamSet[]>>({
          type: MESSAGE_TYPES.SET_QUERY_PARAM_SETS,
          payload: { sets: next },
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setSets(res.value);
        cancelImport();
        setStatus(`Imported ${chosen.length} query-param set(s) (${importMode}).`);
        return;
      }
      case 'notes': {
        const chosen = pending.items.filter((_, i) => pendingSel[i]);
        if (chosen.length === 0) {
          cancelImport();
          return;
        }
        const next = applyNoteImport(notes, chosen, importMode, now);
        const res = await sendRuntimeMessage<Result<Note[]>>({
          type: MESSAGE_TYPES.SET_NOTES,
          payload: { notes: next },
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setNotes(res.value);
        cancelImport();
        setStatus(`Imported ${chosen.length} note(s) (${importMode}).`);
        return;
      }
      case 'checklists': {
        const chosen = pending.items.filter((_, i) => pendingSel[i]);
        if (chosen.length === 0) {
          cancelImport();
          return;
        }
        const next = applyChecklistImport(checklists, chosen, importMode, now);
        const res = await sendRuntimeMessage<Result<Checklist[]>>({
          type: MESSAGE_TYPES.SET_CHECKLISTS,
          payload: { checklists: next },
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setChecklists(res.value);
        cancelImport();
        setStatus(`Imported ${chosen.length} checklist(s) (${importMode}).`);
        return;
      }
    }
  }

  // ── Rendering ───────────────────────────────────────────────────────────────

  /** Flat checkbox list — Profiles, Query params, Notes, My Tasks. */
  function renderFlatList(rows: ExportRow[], emptyHint: string): ReactElement {
    return (
      <ul className="script-list">
        {rows.length === 0 && <li className="hint">{emptyHint}</li>}
        {rows.map((row) => (
          <li key={row.id} className="script-row">
            <input
              type="checkbox"
              checked={selected.has(row.id)}
              onChange={() => toggleSelect(row.id)}
              title="Select for export"
            />
            <span className="script-name">{row.label}</span>
          </li>
        ))}
      </ul>
    );
  }

  /** Scripts view: a read-only folder/child tree (grouping only, no drag/rename/run here). */
  function renderScriptsList(): ReactElement {
    const tree = buildScriptTree(scripts);
    return (
      <ul className="script-list">
        {scripts.length === 0 && <li className="hint">No saved scripts yet.</li>}
        {tree.map((g) => (
          <Fragment key={g.parent.id}>
            <li className="script-row">
              <input
                type="checkbox"
                checked={selected.has(g.parent.id)}
                onChange={() =>
                  g.parent.isFolder
                    ? toggleSelectFolder(
                        g.parent.id,
                        g.children.map((c) => c.id)
                      )
                    : toggleSelect(g.parent.id)
                }
                title={
                  g.parent.isFolder
                    ? 'Select folder and its scripts for export'
                    : 'Select for export'
                }
              />
              <span className="script-name">
                {g.parent.isFolder && (
                  <span className="folder-icon" aria-hidden="true">
                    📁
                  </span>
                )}
                {g.parent.name}
                {g.parent.isFolder && <span className="dim"> ({g.children.length})</span>}
              </span>
            </li>
            {g.children.map((c) => (
              <li key={c.id} className="script-row script-child">
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggleSelect(c.id)}
                  title="Select for export"
                />
                <span className="script-name">{c.name}</span>
              </li>
            ))}
          </Fragment>
        ))}
      </ul>
    );
  }

  function renderList(): ReactElement {
    switch (kind) {
      case 'scripts':
        return renderScriptsList();
      case 'profiles':
        return renderFlatList(
          profiles.map((p) => ({
            id: p.id,
            label: `${p.name} (${PROFILE_TARGET_LABELS[p.target]})`,
          })),
          'No saved profiles yet.'
        );
      case 'queryParams':
        return renderFlatList(
          sets.map((s) => ({ id: s.id, label: s.name })),
          'No saved query-param sets yet.'
        );
      case 'notes':
        return renderFlatList(
          notes.map((n) => ({ id: n.id, label: n.title.trim() === '' ? '(untitled)' : n.title })),
          'No saved notes yet.'
        );
      case 'checklists':
        return renderFlatList(
          checklists.map((c) => ({ id: c.id, label: c.title })),
          'No saved tasks yet.'
        );
    }
  }

  // pendingRows() rebuilds the tree/conflict-checks for the whole staged batch
  // (buildScriptTree + an O(n) conflict scan per item) — memoized so toggling
  // one checkbox, or any other unrelated re-render, doesn't redo that work.
  const rows = useMemo(
    () => (pending ? pendingRows(pending) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pending, scripts, profiles, sets, notes, checklists]
  );
  const hasConflicts = rows.some((r) => r.conflict);
  const selectedInPending = pendingSel.filter(Boolean).length;

  return (
    <div className="tab">
      <div className="row">
        <div className="chips">
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              className={kind === k.key ? 'chip active' : 'chip'}
              onClick={() => setKind(k.key)}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      <div className="row">
        <button type="button" onClick={exportCurrent} disabled={currentCount() === 0}>
          Export{selected.size ? ` (${selected.size})` : ''}
        </button>
        <button type="button" onClick={() => fileInputRef.current?.click()}>
          Import
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
          <h3 className="section-title">Import {pending.items.length} item(s)</h3>
          {hasConflicts && (
            <div className="row">
              <span className="field-label">Some already exist:</span>
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
            {rows.map((row, i) => (
              <li key={row.key} className="script-row">
                <input
                  type="checkbox"
                  checked={pendingSel[i] ?? false}
                  onChange={() => togglePending(i)}
                />
                <span className="script-name">{row.label}</span>
                {row.conflict && <span className="badge conflict">exists</span>}
              </li>
            ))}
          </ul>
          <div className="row">
            <button type="button" className="primary" onClick={() => void confirmImport()}>
              Import {selectedInPending}
            </button>
            <button type="button" onClick={cancelImport}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {renderList()}

      {status && <p className="status">{status}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
