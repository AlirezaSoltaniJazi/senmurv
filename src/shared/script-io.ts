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

function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} (${n})`)) n += 1;
  return `${base} (${n})`;
}

/**
 * Merge imported scripts into the current list and return the new full list.
 * - `overwrite` (merge-by-id): items with a matching id replace it; others are
 *   added (keeping their id, or a fresh one if none).
 * - `keep-both` (append-as-new): every item gets a fresh id and a unique name,
 *   so nothing existing is touched.
 * Mirrors phantom-mock's `applyImport` strategies, scoped to scripts.
 */
export function applyScriptImport(
  current: SavedScript[],
  imported: ImportedScript[],
  mode: ImportMode,
  now: number
): SavedScript[] {
  const byId = new Map(current.map((s) => [s.id, s]));
  const names = new Set(current.map((s) => s.name));

  if (mode === 'keep-both') {
    for (const imp of imported) {
      const id = newId('scr_');
      const name = uniqueName(imp.name, names);
      names.add(name);
      byId.set(id, { id, name, code: imp.code, createdAt: now, updatedAt: now });
    }
    return [...byId.values()];
  }

  for (const imp of imported) {
    const id = imp.id ?? newId('scr_');
    const existing = byId.get(id);
    byId.set(id, {
      id,
      name: imp.name,
      code: imp.code,
      createdAt: existing?.createdAt ?? imp.createdAt ?? now,
      updatedAt: now,
    });
    names.add(imp.name);
  }
  return [...byId.values()];
}
