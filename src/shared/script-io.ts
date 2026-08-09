import type { Result, SavedScript } from '@/shared/types';
import { newId } from '@/utils/id';

export const SCRIPTS_SCHEMA_VERSION = 1;

/** How an import resolves items that already exist. */
export type ImportMode = 'overwrite' | 'keep-both';

interface ScriptBundle {
  app: 'senmurv';
  type: 'scripts';
  schemaVersion: number;
  exportedAt: string;
  scripts: SavedScript[];
}

/** A script accepted from an import file — id/timestamps optional (filled on save). */
export interface ImportedScript {
  id?: string;
  name: string;
  code: string;
  createdAt?: number;
  updatedAt?: number;
  /** The id of the folder this script is grouped under (one level deep). */
  parentId?: string;
  /** When true, this is a folder (a named container), not a runnable script. */
  isFolder?: boolean;
}

/** Serialize saved scripts to a versioned, timestamped JSON export bundle. */
export function serializeScripts(scripts: SavedScript[]): string {
  const bundle: ScriptBundle = {
    app: 'senmurv',
    type: 'scripts',
    schemaVersion: SCRIPTS_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    scripts,
  };
  return JSON.stringify(bundle, null, 2);
}

function validateScript(value: unknown, index: number): Result<ImportedScript> {
  if (typeof value !== 'object' || value === null) {
    return { ok: false, error: `scripts[${index}] must be an object` };
  }
  const v = value as Record<string, unknown>;
  if (typeof v.name !== 'string' || v.name.trim().length === 0) {
    return { ok: false, error: `scripts[${index}].name must be a non-empty string` };
  }
  if (typeof v.code !== 'string') {
    return { ok: false, error: `scripts[${index}].code must be a string` };
  }
  const out: ImportedScript = { name: v.name, code: v.code };
  if (typeof v.id === 'string') out.id = v.id;
  if (typeof v.createdAt === 'number') out.createdAt = v.createdAt;
  if (typeof v.updatedAt === 'number') out.updatedAt = v.updatedAt;
  if (typeof v.parentId === 'string') out.parentId = v.parentId;
  if (typeof v.isFolder === 'boolean') out.isFolder = v.isFolder;
  return { ok: true, value: out };
}

/**
 * Parse an import file. Accepts a Senmurv bundle (`{ schemaVersion, scripts }`)
 * or a bare array of scripts. A bundle with an unsupported `schemaVersion` is
 * rejected; every item is validated field-by-field (fail-fast with the offending
 * index), mirroring phantom-mock's `validateBundle`.
 */
export function parseScriptsImport(text: string): Result<ImportedScript[]> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: `Not valid JSON: ${(err as Error).message}` };
  }

  let rawList: unknown[];
  if (Array.isArray(data)) {
    rawList = data; // bare array — lenient, no schemaVersion
  } else if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (obj.schemaVersion !== undefined && obj.schemaVersion !== SCRIPTS_SCHEMA_VERSION) {
      return {
        ok: false,
        error: `Unsupported schemaVersion: expected ${SCRIPTS_SCHEMA_VERSION}, got ${String(obj.schemaVersion)}`,
      };
    }
    if (!Array.isArray(obj.scripts)) {
      return { ok: false, error: 'No "scripts" array found in the file.' };
    }
    rawList = obj.scripts;
  } else {
    return { ok: false, error: 'Expected a scripts bundle or an array of scripts.' };
  }

  const scripts: ImportedScript[] = [];
  for (let i = 0; i < rawList.length; i += 1) {
    const r = validateScript(rawList[i], i);
    if (!r.ok) return r;
    scripts.push(r.value);
  }
  if (scripts.length === 0) {
    return { ok: false, error: 'No scripts found to import.' };
  }
  return { ok: true, value: scripts };
}

/** True if an imported script collides with an existing one (by id or name). */
export function importConflicts(current: SavedScript[], imported: ImportedScript): boolean {
  return current.some(
    (s) => (imported.id ? s.id === imported.id : false) || s.name === imported.name
  );
}

/** Return `scripts` with the item at `from` moved to index `to` (both clamped). */
export function reorderScripts(scripts: SavedScript[], from: number, to: number): SavedScript[] {
  if (from === to || from < 0 || from >= scripts.length) return scripts;
  const next = [...scripts];
  const [moved] = next.splice(from, 1);
  if (!moved) return scripts;
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}

// ---------------------------------------------------------------------------
// Folders — one-level grouping (folder → scripts)
// ---------------------------------------------------------------------------

/** A top-level item (a folder or a top-level script) with its child scripts. */
export interface ScriptGroup {
  readonly parent: SavedScript;
  /** Child scripts — only ever non-empty for a folder. */
  readonly children: SavedScript[];
}

/** Create a new, empty folder. */
export function newFolder(name: string, now: number): SavedScript {
  return { id: newId('fld_'), name, code: '', isFolder: true, createdAt: now, updatedAt: now };
}

/**
 * Group a flat list into top-level items with their children. Folders are the
 * only containers: a script belongs to a folder when its `parentId` points at
 * one; a `parentId` that is missing or is not a folder makes the script
 * top-level. Folders are always top-level and never nest (one level deep).
 */
export function buildScriptTree(scripts: SavedScript[]): ScriptGroup[] {
  const byId = new Map(scripts.map((s) => [s.id, s]));
  const isFolder = (id: string): boolean => byId.get(id)?.isFolder === true;
  const childrenOf = new Map<string, SavedScript[]>();
  const topLevel: SavedScript[] = [];
  for (const s of scripts) {
    if (!s.isFolder && s.parentId !== undefined && isFolder(s.parentId)) {
      const list = childrenOf.get(s.parentId) ?? [];
      list.push(s);
      childrenOf.set(s.parentId, list);
    } else {
      topLevel.push(s);
    }
  }
  return topLevel.map((parent) => ({
    parent,
    children: parent.isFolder ? (childrenOf.get(parent.id) ?? []) : [],
  }));
}

/** Rewrite the flat array into grouped render order (folder then its scripts). */
export function normalizeScripts(scripts: SavedScript[]): SavedScript[] {
  const out: SavedScript[] = [];
  for (const group of buildScriptTree(scripts)) {
    out.push(group.parent);
    for (const child of group.children) out.push(child);
  }
  return out;
}

/** The folder id a drop `targetId` resolves to (the folder itself, or the folder
 *  a target script lives in), or undefined when the target is not in any folder. */
function targetFolderId(byId: Map<string, SavedScript>, targetId: string): string | undefined {
  const target = byId.get(targetId);
  if (!target) return undefined;
  if (target.isFolder) return target.id;
  if (target.parentId !== undefined && byId.get(target.parentId)?.isFolder === true) {
    return target.parentId;
  }
  return undefined;
}

/**
 * Move script `movingId` into the folder that `targetId` resolves to (dropping
 * onto a folder, or onto a script already inside one). Refused when `movingId`
 * is a folder, the target is not in any folder, or it is already there. The moved
 * script becomes the folder's last child.
 */
export function nestScript(
  scripts: SavedScript[],
  movingId: string,
  targetId: string
): SavedScript[] {
  if (movingId === targetId) return scripts;
  const byId = new Map(scripts.map((s) => [s.id, s]));
  const moving = byId.get(movingId);
  if (!moving || moving.isFolder) return scripts;
  const folderId = targetFolderId(byId, targetId);
  if (folderId === undefined || moving.parentId === folderId) return scripts;
  const rest = scripts.filter((s) => s.id !== movingId);
  rest.push({ ...moving, parentId: folderId });
  return normalizeScripts(rest);
}

/** Move script `id` out of its folder, back to the top level (at the end). */
export function ungroupScript(scripts: SavedScript[], id: string): SavedScript[] {
  const item = scripts.find((s) => s.id === id);
  if (!item || item.parentId === undefined) return scripts;
  const { parentId: _drop, ...rest } = item;
  return normalizeScripts([...scripts.filter((s) => s.id !== id), rest]);
}

/** True when `id` has child scripts (used to show a folder's count). */
export function hasChildren(scripts: SavedScript[], id: string): boolean {
  return scripts.some((s) => s.parentId === id);
}

/** Delete a folder, moving its scripts back to the top level. */
export function deleteFolder(scripts: SavedScript[], folderId: string): SavedScript[] {
  const folder = scripts.find((s) => s.id === folderId);
  if (!folder || folder.isFolder !== true) return scripts;
  const next = scripts
    .filter((s) => s.id !== folderId)
    .map((s) => {
      if (s.parentId !== folderId) return s;
      const { parentId: _drop, ...rest } = s;
      return rest;
    });
  return normalizeScripts(next);
}

/**
 * Reorder `movingId` to just before `targetId` — only when they are at the SAME
 * level (both top-level, or children of the same parent). A top-level move carries
 * the group's children with it; a cross-level drop is a no-op.
 */
export function moveScriptBefore(
  scripts: SavedScript[],
  movingId: string,
  targetId: string
): SavedScript[] {
  if (movingId === targetId) return scripts;
  const moving = scripts.find((s) => s.id === movingId);
  const target = scripts.find((s) => s.id === targetId);
  if (!moving || !target) return scripts;
  if ((moving.parentId ?? '') !== (target.parentId ?? '')) return scripts;
  const rest = scripts.filter((s) => s.id !== movingId);
  const at = rest.findIndex((s) => s.id === targetId);
  rest.splice(at, 0, moving);
  return normalizeScripts(rest);
}

/**
 * `base` if free, else the first `base (n)` (n ≥ 2) not already in `taken`.
 * Matching is case-insensitive (so "login" collides with an existing "Login" and
 * becomes "login (2)"), while the returned name keeps `base`'s original casing.
 */
export function uniqueName(base: string, taken: Set<string>): string {
  const lower = new Set([...taken].map((name) => name.toLowerCase()));
  if (!lower.has(base.toLowerCase())) return base;
  let n = 2;
  while (lower.has(`${base} (${n})`.toLowerCase())) n += 1;
  return `${base} (${n})`;
}

/**
 * Merge imported scripts into the current list and return the new full list.
 * - `overwrite` (merge-by-id): items with a matching id replace it; others are
 *   added (keeping their id, or a fresh one if none). Ids pass through unchanged
 *   so a child's `parentId` reference stays valid automatically.
 * - `keep-both` (append-as-new): every item gets a fresh id and a unique name,
 *   so nothing existing is touched. A two-pass id remap keeps a re-imported
 *   folder and its children grouped together: pass 1 assigns every imported
 *   item (that had an id) a fresh id; pass 2 builds each record, mapping
 *   `parentId` through that same table. A child whose folder wasn't part of
 *   this import (no entry in the map) degrades to top-level rather than
 *   dangling.
 * Mirrors phantom-mock's `applyImport` strategies, scoped to scripts.
 */
export function applyScriptImport(
  current: SavedScript[],
  imported: ImportedScript[],
  mode: ImportMode,
  now: number
): SavedScript[] {
  const byId = new Map(current.map((s) => [s.id, s]));

  if (mode === 'keep-both') {
    // Only needed for this branch's uniqueName() dedup — the overwrite branch
    // below never reads a name collision set.
    const names = new Set(current.map((s) => s.name));
    const idMap = new Map<string, string>();
    for (const imp of imported) {
      if (imp.id !== undefined) idMap.set(imp.id, newId(imp.isFolder === true ? 'fld_' : 'scr_'));
    }
    for (const imp of imported) {
      const id =
        imp.id !== undefined ? idMap.get(imp.id)! : newId(imp.isFolder === true ? 'fld_' : 'scr_');
      const name = uniqueName(imp.name, names);
      names.add(name);
      const record: SavedScript = { id, name, code: imp.code, createdAt: now, updatedAt: now };
      const mappedParent = imp.parentId !== undefined ? idMap.get(imp.parentId) : undefined;
      if (mappedParent !== undefined) record.parentId = mappedParent;
      if (imp.isFolder !== undefined) record.isFolder = imp.isFolder;
      byId.set(id, record);
    }
    return [...byId.values()];
  }

  for (const imp of imported) {
    const id = imp.id ?? newId('scr_');
    const existing = byId.get(id);
    const record: SavedScript = {
      id,
      name: imp.name,
      code: imp.code,
      createdAt: existing?.createdAt ?? imp.createdAt ?? now,
      updatedAt: now,
    };
    if (imp.parentId !== undefined) record.parentId = imp.parentId;
    if (imp.isFolder !== undefined) record.isFolder = imp.isFolder;
    byId.set(id, record);
  }
  return [...byId.values()];
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** True if `name` matches `query` (case-insensitive substring; a blank query matches everything). */
export function matchesScriptQuery(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return name.toLowerCase().includes(q);
}

/**
 * Filter an already-built `buildScriptTree()` result by `query`. Filtering the
 * tree (rather than the flat array before grouping) matters: pre-filtering
 * would silently orphan a matching child whose folder name doesn't match,
 * since its `parentId` would no longer resolve to anything in the filtered
 * set. A folder survives when its own name matches (all of its children are
 * kept) or when at least one child matches (only the matching children are
 * kept); a top-level script survives on its own name match.
 */
export function filterScriptTree(tree: ScriptGroup[], query: string): ScriptGroup[] {
  const q = query.trim().toLowerCase();
  if (q === '') return tree;
  const out: ScriptGroup[] = [];
  for (const group of tree) {
    if (matchesScriptQuery(group.parent.name, q)) {
      out.push(group);
      continue;
    }
    const children = group.children.filter((c) => matchesScriptQuery(c.name, q));
    if (children.length > 0) out.push({ parent: group.parent, children });
  }
  return out;
}
