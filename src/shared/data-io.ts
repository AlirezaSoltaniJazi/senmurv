import { uniqueName } from '@/shared/script-io';
import type { ImportMode } from '@/shared/script-io';
import type { QueryParam, QueryParamSet } from '@/shared/tools/query-params';
import type { Checklist, Note, Result, Subtask, ValueProfile } from '@/shared/types';
import { newId } from '@/utils/id';

/**
 * Round-trippable JSON export/import for the four data kinds that don't
 * already have this: Value profiles, Query-param sets, Notes, Checklists
 * (Scripts already has its own module — `script-io.ts` — reused here only for
 * its `ImportMode` type and its generic `uniqueName` dedup helper). Each kind
 * mirrors `script-io.ts` function-for-function: `serialize*`, `parse*Import`,
 * `*ImportConflicts`, `apply*Import`.
 */
export const DATA_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Value profiles (Cookies + Storage tabs)
// ---------------------------------------------------------------------------

interface ProfileBundle {
  app: 'senmurv';
  type: 'profiles';
  schemaVersion: number;
  exportedAt: string;
  profiles: ValueProfile[];
}

/** A value profile accepted from an import file — id/timestamps optional (filled on save). */
export interface ImportedProfile {
  id?: string;
  name: string;
  target: ValueProfile['target'];
  key: string;
  path?: string;
  values: string[];
  prefix?: string;
  suffix?: string;
  enabled: boolean;
  createdAt?: number;
  updatedAt?: number;
}

/** Serialize value profiles to a versioned, timestamped JSON export bundle. */
export function serializeProfiles(profiles: ValueProfile[]): string {
  const bundle: ProfileBundle = {
    app: 'senmurv',
    type: 'profiles',
    schemaVersion: DATA_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    profiles,
  };
  return JSON.stringify(bundle, null, 2);
}

function validateImportedProfile(value: unknown, index: number): Result<ImportedProfile> {
  if (typeof value !== 'object' || value === null) {
    return { ok: false, error: `profiles[${index}] must be an object` };
  }
  const v = value as Record<string, unknown>;
  if (typeof v.name !== 'string' || v.name.trim().length === 0) {
    return { ok: false, error: `profiles[${index}].name must be a non-empty string` };
  }
  if (v.target !== 'cookie' && v.target !== 'local' && v.target !== 'session') {
    return {
      ok: false,
      error: `profiles[${index}].target must be "cookie", "local", or "session"`,
    };
  }
  if (typeof v.key !== 'string' || v.key.trim().length === 0) {
    return { ok: false, error: `profiles[${index}].key must be a non-empty string` };
  }
  if (!Array.isArray(v.values) || !v.values.every((x) => typeof x === 'string')) {
    return { ok: false, error: `profiles[${index}].values must be an array of strings` };
  }
  const out: ImportedProfile = {
    name: v.name,
    target: v.target,
    key: v.key,
    values: v.values,
    enabled: typeof v.enabled === 'boolean' ? v.enabled : true,
  };
  if (typeof v.id === 'string') out.id = v.id;
  if (typeof v.path === 'string') out.path = v.path;
  if (typeof v.prefix === 'string') out.prefix = v.prefix;
  if (typeof v.suffix === 'string') out.suffix = v.suffix;
  if (typeof v.createdAt === 'number') out.createdAt = v.createdAt;
  if (typeof v.updatedAt === 'number') out.updatedAt = v.updatedAt;
  return { ok: true, value: out };
}

/**
 * Parse an import file. Accepts a Senmurv bundle (`{ schemaVersion, profiles }`)
 * or a bare array of profiles. A bundle with an unsupported `schemaVersion` is
 * rejected; every item is validated field-by-field (fail-fast with the offending
 * index), mirroring `parseScriptsImport`.
 */
export function parseProfilesImport(text: string): Result<ImportedProfile[]> {
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
    if (obj.schemaVersion !== undefined && obj.schemaVersion !== DATA_SCHEMA_VERSION) {
      return {
        ok: false,
        error: `Unsupported schemaVersion: expected ${DATA_SCHEMA_VERSION}, got ${String(obj.schemaVersion)}`,
      };
    }
    if (!Array.isArray(obj.profiles)) {
      return { ok: false, error: 'No "profiles" array found in the file.' };
    }
    rawList = obj.profiles;
  } else {
    return { ok: false, error: 'Expected a profiles bundle or an array of profiles.' };
  }

  const profiles: ImportedProfile[] = [];
  for (let i = 0; i < rawList.length; i += 1) {
    const r = validateImportedProfile(rawList[i], i);
    if (!r.ok) return r;
    profiles.push(r.value);
  }
  if (profiles.length === 0) {
    return { ok: false, error: 'No profiles found to import.' };
  }
  return { ok: true, value: profiles };
}

/** True if an imported profile collides with an existing one (by id or name). */
export function profileImportConflicts(
  current: ValueProfile[],
  imported: ImportedProfile
): boolean {
  return current.some(
    (p) => (imported.id ? p.id === imported.id : false) || p.name === imported.name
  );
}

/**
 * Merge imported profiles into the current list and return the new full list.
 * - `overwrite` (merge-by-id): items with a matching id replace it; others are
 *   added (keeping their id, or a fresh one if none).
 * - `keep-both` (append-as-new): every item gets a fresh id and a unique name,
 *   so nothing existing is touched.
 */
export function applyProfileImport(
  current: ValueProfile[],
  imported: ImportedProfile[],
  mode: ImportMode,
  now: number
): ValueProfile[] {
  const byId = new Map(current.map((p) => [p.id, p]));

  if (mode === 'keep-both') {
    const names = new Set(current.map((p) => p.name));
    for (const imp of imported) {
      const id = newId('prof_');
      const name = uniqueName(imp.name, names);
      names.add(name);
      const profile: ValueProfile = {
        id,
        name,
        target: imp.target,
        key: imp.key,
        values: imp.values,
        enabled: imp.enabled,
        createdAt: now,
        updatedAt: now,
      };
      if (imp.path !== undefined) profile.path = imp.path;
      if (imp.prefix !== undefined) profile.prefix = imp.prefix;
      if (imp.suffix !== undefined) profile.suffix = imp.suffix;
      byId.set(id, profile);
    }
    return [...byId.values()];
  }

  for (const imp of imported) {
    const id = imp.id ?? newId('prof_');
    const existing = byId.get(id);
    const profile: ValueProfile = {
      id,
      name: imp.name,
      target: imp.target,
      key: imp.key,
      values: imp.values,
      enabled: imp.enabled,
      createdAt: existing?.createdAt ?? imp.createdAt ?? now,
      updatedAt: now,
    };
    if (imp.path !== undefined) profile.path = imp.path;
    if (imp.prefix !== undefined) profile.prefix = imp.prefix;
    if (imp.suffix !== undefined) profile.suffix = imp.suffix;
    byId.set(id, profile);
  }
  return [...byId.values()];
}

// ---------------------------------------------------------------------------
// Query-param sets (Query params tool)
// ---------------------------------------------------------------------------

interface QueryParamSetBundle {
  app: 'senmurv';
  type: 'queryParamSets';
  schemaVersion: number;
  exportedAt: string;
  sets: QueryParamSet[];
}

/** A query-param set accepted from an import file — id/timestamps optional (filled on save). */
export interface ImportedQueryParamSet {
  id?: string;
  name: string;
  base: string;
  params: QueryParam[];
  hash: string;
  createdAt?: number;
  updatedAt?: number;
}

/** Serialize query-param sets to a versioned, timestamped JSON export bundle. */
export function serializeQueryParamSets(sets: QueryParamSet[]): string {
  const bundle: QueryParamSetBundle = {
    app: 'senmurv',
    type: 'queryParamSets',
    schemaVersion: DATA_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    sets,
  };
  return JSON.stringify(bundle, null, 2);
}

function isImportedQueryParamArray(value: unknown): value is QueryParam[] {
  return (
    Array.isArray(value) &&
    value.every(
      (p) =>
        typeof p === 'object' &&
        p !== null &&
        typeof (p as Record<string, unknown>).name === 'string' &&
        typeof (p as Record<string, unknown>).value === 'string'
    )
  );
}

function validateImportedQueryParamSet(
  value: unknown,
  index: number
): Result<ImportedQueryParamSet> {
  if (typeof value !== 'object' || value === null) {
    return { ok: false, error: `sets[${index}] must be an object` };
  }
  const v = value as Record<string, unknown>;
  if (typeof v.name !== 'string' || v.name.trim().length === 0) {
    return { ok: false, error: `sets[${index}].name must be a non-empty string` };
  }
  if (typeof v.base !== 'string') {
    return { ok: false, error: `sets[${index}].base must be a string` };
  }
  if (!isImportedQueryParamArray(v.params)) {
    return {
      ok: false,
      error: `sets[${index}].params must be an array of { name, value } strings`,
    };
  }
  if (typeof v.hash !== 'string') {
    return { ok: false, error: `sets[${index}].hash must be a string` };
  }
  const out: ImportedQueryParamSet = { name: v.name, base: v.base, params: v.params, hash: v.hash };
  if (typeof v.id === 'string') out.id = v.id;
  if (typeof v.createdAt === 'number') out.createdAt = v.createdAt;
  if (typeof v.updatedAt === 'number') out.updatedAt = v.updatedAt;
  return { ok: true, value: out };
}

/**
 * Parse an import file. Accepts a Senmurv bundle (`{ schemaVersion, sets }`) or
 * a bare array of sets. A bundle with an unsupported `schemaVersion` is
 * rejected; every item is validated field-by-field (fail-fast with the
 * offending index), mirroring `parseScriptsImport`.
 */
export function parseQueryParamSetsImport(text: string): Result<ImportedQueryParamSet[]> {
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
    if (obj.schemaVersion !== undefined && obj.schemaVersion !== DATA_SCHEMA_VERSION) {
      return {
        ok: false,
        error: `Unsupported schemaVersion: expected ${DATA_SCHEMA_VERSION}, got ${String(obj.schemaVersion)}`,
      };
    }
    if (!Array.isArray(obj.sets)) {
      return { ok: false, error: 'No "sets" array found in the file.' };
    }
    rawList = obj.sets;
  } else {
    return { ok: false, error: 'Expected a query-param sets bundle or an array of sets.' };
  }

  const sets: ImportedQueryParamSet[] = [];
  for (let i = 0; i < rawList.length; i += 1) {
    const r = validateImportedQueryParamSet(rawList[i], i);
    if (!r.ok) return r;
    sets.push(r.value);
  }
  if (sets.length === 0) {
    return { ok: false, error: 'No query-param sets found to import.' };
  }
  return { ok: true, value: sets };
}

/** True if an imported query-param set collides with an existing one (by id or name). */
export function queryParamSetImportConflicts(
  current: QueryParamSet[],
  imported: ImportedQueryParamSet
): boolean {
  return current.some(
    (s) => (imported.id ? s.id === imported.id : false) || s.name === imported.name
  );
}

/**
 * Merge imported query-param sets into the current list and return the new
 * full list.
 * - `overwrite` (merge-by-id): items with a matching id replace it; others are
 *   added (keeping their id, or a fresh one if none).
 * - `keep-both` (append-as-new): every item gets a fresh id and a unique name,
 *   so nothing existing is touched.
 */
export function applyQueryParamSetImport(
  current: QueryParamSet[],
  imported: ImportedQueryParamSet[],
  mode: ImportMode,
  now: number
): QueryParamSet[] {
  const byId = new Map(current.map((s) => [s.id, s]));

  if (mode === 'keep-both') {
    const names = new Set(current.map((s) => s.name));
    for (const imp of imported) {
      const id = newId('qps_');
      const name = uniqueName(imp.name, names);
      names.add(name);
      byId.set(id, {
        id,
        name,
        base: imp.base,
        params: imp.params,
        hash: imp.hash,
        createdAt: now,
        updatedAt: now,
      });
    }
    return [...byId.values()];
  }

  for (const imp of imported) {
    const id = imp.id ?? newId('qps_');
    const existing = byId.get(id);
    byId.set(id, {
      id,
      name: imp.name,
      base: imp.base,
      params: imp.params,
      hash: imp.hash,
      createdAt: existing?.createdAt ?? imp.createdAt ?? now,
      updatedAt: now,
    });
  }
  return [...byId.values()];
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

interface NoteBundle {
  app: 'senmurv';
  type: 'notes';
  schemaVersion: number;
  exportedAt: string;
  notes: Note[];
}

/** A note accepted from an import file — id/timestamps optional (filled on save). */
export interface ImportedNote {
  id?: string;
  title: string;
  body: string;
  createdAt?: number;
  updatedAt?: number;
}

/** Serialize notes to a versioned, timestamped JSON export bundle. */
export function serializeNotes(notes: Note[]): string {
  const bundle: NoteBundle = {
    app: 'senmurv',
    type: 'notes',
    schemaVersion: DATA_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    notes,
  };
  return JSON.stringify(bundle, null, 2);
}

function validateImportedNote(value: unknown, index: number): Result<ImportedNote> {
  if (typeof value !== 'object' || value === null) {
    return { ok: false, error: `notes[${index}] must be an object` };
  }
  const v = value as Record<string, unknown>;
  if (typeof v.title !== 'string') {
    return { ok: false, error: `notes[${index}].title must be a string` };
  }
  if (typeof v.body !== 'string') {
    return { ok: false, error: `notes[${index}].body must be a string` };
  }
  const out: ImportedNote = { title: v.title, body: v.body };
  if (typeof v.id === 'string') out.id = v.id;
  if (typeof v.createdAt === 'number') out.createdAt = v.createdAt;
  if (typeof v.updatedAt === 'number') out.updatedAt = v.updatedAt;
  return { ok: true, value: out };
}

/**
 * Parse an import file. Accepts a Senmurv bundle (`{ schemaVersion, notes }`)
 * or a bare array of notes. A bundle with an unsupported `schemaVersion` is
 * rejected; every item is validated field-by-field (fail-fast with the
 * offending index), mirroring `parseScriptsImport`.
 */
export function parseNotesImport(text: string): Result<ImportedNote[]> {
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
    if (obj.schemaVersion !== undefined && obj.schemaVersion !== DATA_SCHEMA_VERSION) {
      return {
        ok: false,
        error: `Unsupported schemaVersion: expected ${DATA_SCHEMA_VERSION}, got ${String(obj.schemaVersion)}`,
      };
    }
    if (!Array.isArray(obj.notes)) {
      return { ok: false, error: 'No "notes" array found in the file.' };
    }
    rawList = obj.notes;
  } else {
    return { ok: false, error: 'Expected a notes bundle or an array of notes.' };
  }

  const notes: ImportedNote[] = [];
  for (let i = 0; i < rawList.length; i += 1) {
    const r = validateImportedNote(rawList[i], i);
    if (!r.ok) return r;
    notes.push(r.value);
  }
  if (notes.length === 0) {
    return { ok: false, error: 'No notes found to import.' };
  }
  return { ok: true, value: notes };
}

/** True if an imported note collides with an existing one (by id or title). */
export function noteImportConflicts(current: Note[], imported: ImportedNote): boolean {
  return current.some(
    (n) => (imported.id ? n.id === imported.id : false) || n.title === imported.title
  );
}

/**
 * Merge imported notes into the current list and return the new full list.
 * - `overwrite` (merge-by-id): items with a matching id replace it; others are
 *   added (keeping their id, or a fresh one if none).
 * - `keep-both` (append-as-new): every item gets a fresh id and a unique
 *   title, so nothing existing is touched.
 */
export function applyNoteImport(
  current: Note[],
  imported: ImportedNote[],
  mode: ImportMode,
  now: number
): Note[] {
  const byId = new Map(current.map((n) => [n.id, n]));

  if (mode === 'keep-both') {
    const titles = new Set(current.map((n) => n.title));
    for (const imp of imported) {
      const id = newId('note_');
      const title = uniqueName(imp.title, titles);
      titles.add(title);
      byId.set(id, { id, title, body: imp.body, createdAt: now, updatedAt: now });
    }
    return [...byId.values()];
  }

  for (const imp of imported) {
    const id = imp.id ?? newId('note_');
    const existing = byId.get(id);
    byId.set(id, {
      id,
      title: imp.title,
      body: imp.body,
      createdAt: existing?.createdAt ?? imp.createdAt ?? now,
      updatedAt: now,
    });
  }
  return [...byId.values()];
}

// ---------------------------------------------------------------------------
// Checklists (My Tasks)
// ---------------------------------------------------------------------------

interface ChecklistBundle {
  app: 'senmurv';
  type: 'checklists';
  schemaVersion: number;
  exportedAt: string;
  checklists: Checklist[];
}

/** A subtask accepted from an import file — id optional (filled on save). */
export interface ImportedSubtask {
  id?: string;
  title: string;
  done: boolean;
}

/** A checklist accepted from an import file — id/timestamps optional (filled on save). */
export interface ImportedChecklist {
  id?: string;
  title: string;
  subtasks: ImportedSubtask[];
  done: boolean;
  deadline: number | null;
  createdAt?: number;
  updatedAt?: number;
}

/** Serialize checklists to a versioned, timestamped JSON export bundle. */
export function serializeChecklists(checklists: Checklist[]): string {
  const bundle: ChecklistBundle = {
    app: 'senmurv',
    type: 'checklists',
    schemaVersion: DATA_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    checklists,
  };
  return JSON.stringify(bundle, null, 2);
}

function validateImportedSubtask(
  value: unknown,
  checklistIndex: number,
  subIndex: number
): Result<ImportedSubtask> {
  if (typeof value !== 'object' || value === null) {
    return {
      ok: false,
      error: `checklists[${checklistIndex}].subtasks[${subIndex}] must be an object`,
    };
  }
  const v = value as Record<string, unknown>;
  if (typeof v.title !== 'string') {
    return {
      ok: false,
      error: `checklists[${checklistIndex}].subtasks[${subIndex}].title must be a string`,
    };
  }
  if (typeof v.done !== 'boolean') {
    return {
      ok: false,
      error: `checklists[${checklistIndex}].subtasks[${subIndex}].done must be a boolean`,
    };
  }
  const out: ImportedSubtask = { title: v.title, done: v.done };
  if (typeof v.id === 'string') out.id = v.id;
  return { ok: true, value: out };
}

function validateImportedChecklist(value: unknown, index: number): Result<ImportedChecklist> {
  if (typeof value !== 'object' || value === null) {
    return { ok: false, error: `checklists[${index}] must be an object` };
  }
  const v = value as Record<string, unknown>;
  if (typeof v.title !== 'string' || v.title.trim().length === 0) {
    return { ok: false, error: `checklists[${index}].title must be a non-empty string` };
  }
  if (!Array.isArray(v.subtasks)) {
    return { ok: false, error: `checklists[${index}].subtasks must be an array` };
  }
  const subtasks: ImportedSubtask[] = [];
  for (let i = 0; i < v.subtasks.length; i += 1) {
    const r = validateImportedSubtask(v.subtasks[i], index, i);
    if (!r.ok) return r;
    subtasks.push(r.value);
  }
  if (typeof v.done !== 'boolean') {
    return { ok: false, error: `checklists[${index}].done must be a boolean` };
  }
  if (v.deadline !== null && typeof v.deadline !== 'number') {
    return { ok: false, error: `checklists[${index}].deadline must be a number or null` };
  }
  const out: ImportedChecklist = { title: v.title, subtasks, done: v.done, deadline: v.deadline };
  if (typeof v.id === 'string') out.id = v.id;
  if (typeof v.createdAt === 'number') out.createdAt = v.createdAt;
  if (typeof v.updatedAt === 'number') out.updatedAt = v.updatedAt;
  return { ok: true, value: out };
}

/**
 * Parse an import file. Accepts a Senmurv bundle (`{ schemaVersion, checklists }`)
 * or a bare array of checklists. A bundle with an unsupported `schemaVersion`
 * is rejected; every item (and every inline subtask) is validated
 * field-by-field (fail-fast with the offending index), mirroring
 * `parseScriptsImport`.
 */
export function parseChecklistsImport(text: string): Result<ImportedChecklist[]> {
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
    if (obj.schemaVersion !== undefined && obj.schemaVersion !== DATA_SCHEMA_VERSION) {
      return {
        ok: false,
        error: `Unsupported schemaVersion: expected ${DATA_SCHEMA_VERSION}, got ${String(obj.schemaVersion)}`,
      };
    }
    if (!Array.isArray(obj.checklists)) {
      return { ok: false, error: 'No "checklists" array found in the file.' };
    }
    rawList = obj.checklists;
  } else {
    return { ok: false, error: 'Expected a checklists bundle or an array of checklists.' };
  }

  const checklists: ImportedChecklist[] = [];
  for (let i = 0; i < rawList.length; i += 1) {
    const r = validateImportedChecklist(rawList[i], i);
    if (!r.ok) return r;
    checklists.push(r.value);
  }
  if (checklists.length === 0) {
    return { ok: false, error: 'No checklists found to import.' };
  }
  return { ok: true, value: checklists };
}

/** True if an imported checklist collides with an existing one (by id or title). */
export function checklistImportConflicts(
  current: Checklist[],
  imported: ImportedChecklist
): boolean {
  return current.some(
    (c) => (imported.id ? c.id === imported.id : false) || c.title === imported.title
  );
}

/**
 * Merge imported checklists into the current list and return the new full
 * list. Subtasks travel inline with their parent.
 * - `overwrite` (merge-by-id): items with a matching id replace it; others are
 *   added (keeping their id, or a fresh one if none). Subtasks keep their id,
 *   or get a fresh one if none.
 * - `keep-both` (append-as-new): every item gets a fresh id and a unique
 *   title, and every subtask gets a fresh id, so nothing existing is touched.
 */
export function applyChecklistImport(
  current: Checklist[],
  imported: ImportedChecklist[],
  mode: ImportMode,
  now: number
): Checklist[] {
  const byId = new Map(current.map((c) => [c.id, c]));

  if (mode === 'keep-both') {
    const titles = new Set(current.map((c) => c.title));
    for (const imp of imported) {
      const id = newId('chk_');
      const title = uniqueName(imp.title, titles);
      titles.add(title);
      const subtasks: Subtask[] = imp.subtasks.map((s) => ({
        id: newId('sub_'),
        title: s.title,
        done: s.done,
      }));
      byId.set(id, {
        id,
        title,
        subtasks,
        done: imp.done,
        deadline: imp.deadline,
        createdAt: now,
        updatedAt: now,
      });
    }
    return [...byId.values()];
  }

  for (const imp of imported) {
    const id = imp.id ?? newId('chk_');
    const existing = byId.get(id);
    const subtasks: Subtask[] = imp.subtasks.map((s) => ({
      id: s.id ?? newId('sub_'),
      title: s.title,
      done: s.done,
    }));
    byId.set(id, {
      id,
      title: imp.title,
      subtasks,
      done: imp.done,
      deadline: imp.deadline,
      createdAt: existing?.createdAt ?? imp.createdAt ?? now,
      updatedAt: now,
    });
  }
  return [...byId.values()];
}
