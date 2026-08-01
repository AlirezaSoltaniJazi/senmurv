import {
  FIND_TIMEOUT_SECONDS_DEFAULT,
  FIND_TIMEOUT_SECONDS_MAX,
  FIND_TIMEOUT_SECONDS_MIN,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  HUD_SECONDS_DEFAULT,
  HUD_SECONDS_MAX,
  HUD_SECONDS_MIN,
  STORAGE_KEYS,
} from '@/shared/constants';
import { TAG_COLOR_COUNT } from '@/shared/tasks';
import type {
  Checklist,
  FontSize,
  Note,
  Prefs,
  SavedScript,
  Subtask,
  TimeEntry,
  TimeInterval,
  ValueProfile,
} from '@/shared/types';

// ---------------------------------------------------------------------------
// Per-key write serialization
// ---------------------------------------------------------------------------

/**
 * chrome.storage has no compare-and-swap, so a read-modify-write
 * (`get → compute → set`) can interleave with another and lose a write: two
 * upserts both read the same base list, then the second `set` clobbers the
 * first's addition. Every mutation funnels through the single service worker, so
 * a per-key promise chain is enough — each locked op waits for the previous op
 * on the SAME key to finish its `set` before it reads. Reads stay unlocked (a
 * stale read is harmless; only overlapping writes lose data).
 */
const keyChains = new Map<string, Promise<unknown>>();

function withKeyLock<T>(key: string, op: () => Promise<T>): Promise<T> {
  const prev = keyChains.get(key) ?? Promise.resolve();
  // Run `op` once `prev` settles, whether it resolved or rejected (both handlers
  // are `op`), so one failed op cannot stall the queue.
  const result = prev.then(op, op);
  // Store a neutralized tail so a rejection here never poisons the next op; the
  // original caller still observes its own error through the returned `result`.
  keyChains.set(
    key,
    result.then(
      () => undefined,
      () => undefined
    )
  );
  return result;
}

/** Type guard for a stored script (rejects corrupt / legacy data). */
export function isSavedScript(value: unknown): value is SavedScript {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.code === 'string' &&
    typeof v.createdAt === 'number' &&
    typeof v.updatedAt === 'number' &&
    (v.parentId === undefined || typeof v.parentId === 'string') &&
    (v.isFolder === undefined || typeof v.isFolder === 'boolean')
  );
}

/** Read all saved scripts (silently drops anything that fails validation). */
export async function getScripts(): Promise<SavedScript[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SCRIPTS);
  const raw = result[STORAGE_KEYS.SCRIPTS];
  if (!Array.isArray(raw)) return [];
  return raw.filter(isSavedScript);
}

/** Overwrite the full script list. */
export async function saveScripts(scripts: SavedScript[]): Promise<void> {
  await withKeyLock(STORAGE_KEYS.SCRIPTS, () =>
    chrome.storage.local.set({ [STORAGE_KEYS.SCRIPTS]: scripts })
  );
}

/** Insert or update a script by id; returns the new list. */
export async function upsertScript(script: SavedScript): Promise<SavedScript[]> {
  return withKeyLock(STORAGE_KEYS.SCRIPTS, async () => {
    const scripts = await getScripts();
    const exists = scripts.some((s) => s.id === script.id);
    const next = exists
      ? scripts.map((s) => (s.id === script.id ? script : s))
      : [...scripts, script];
    await chrome.storage.local.set({ [STORAGE_KEYS.SCRIPTS]: next });
    return next;
  });
}

/** Remove a script by id; returns the new list. */
export async function deleteScript(id: string): Promise<SavedScript[]> {
  return withKeyLock(STORAGE_KEYS.SCRIPTS, async () => {
    const scripts = await getScripts();
    const next = scripts.filter((s) => s.id !== id);
    await chrome.storage.local.set({ [STORAGE_KEYS.SCRIPTS]: next });
    return next;
  });
}

// ---------------------------------------------------------------------------
// Time-logged tasks (Tasks tool)
// ---------------------------------------------------------------------------

function isTimeInterval(value: unknown): value is TimeInterval {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.start === 'number' && (v.end === null || typeof v.end === 'number');
}

/** Type guard for a stored task entry (rejects corrupt / legacy data). */
export function isTimeEntry(value: unknown): value is TimeEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    typeof v.tag === 'string' &&
    Array.isArray(v.intervals) &&
    v.intervals.every(isTimeInterval) &&
    (v.stoppedAt === null || typeof v.stoppedAt === 'number') &&
    typeof v.createdAt === 'number' &&
    typeof v.updatedAt === 'number' &&
    (v.parentId === undefined || typeof v.parentId === 'string') &&
    (v.checklistId === undefined || typeof v.checklistId === 'string') &&
    (v.subtaskId === undefined || typeof v.subtaskId === 'string')
  );
}

/** Read all logged tasks (silently drops anything that fails validation). */
export async function getTasks(): Promise<TimeEntry[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.TASKS);
  const raw = result[STORAGE_KEYS.TASKS];
  if (!Array.isArray(raw)) return [];
  return raw.filter(isTimeEntry);
}

/** Overwrite the full task list. */
export async function saveTasks(tasks: TimeEntry[]): Promise<void> {
  await withKeyLock(STORAGE_KEYS.TASKS, () =>
    chrome.storage.local.set({ [STORAGE_KEYS.TASKS]: tasks })
  );
}

/** Insert or update a task by id; returns the new list. */
export async function upsertTask(task: TimeEntry): Promise<TimeEntry[]> {
  return withKeyLock(STORAGE_KEYS.TASKS, async () => {
    const tasks = await getTasks();
    const exists = tasks.some((t) => t.id === task.id);
    const next = exists ? tasks.map((t) => (t.id === task.id ? task : t)) : [...tasks, task];
    await chrome.storage.local.set({ [STORAGE_KEYS.TASKS]: next });
    return next;
  });
}

/** Remove a task by id; returns the new list. */
export async function deleteTask(id: string): Promise<TimeEntry[]> {
  return withKeyLock(STORAGE_KEYS.TASKS, async () => {
    const tasks = await getTasks();
    const next = tasks.filter((t) => t.id !== id);
    await chrome.storage.local.set({ [STORAGE_KEYS.TASKS]: next });
    return next;
  });
}

// ---------------------------------------------------------------------------
// My Tasks (checklists)
// ---------------------------------------------------------------------------

function isSubtask(value: unknown): value is Subtask {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.title === 'string' && typeof v.done === 'boolean';
}

/** Type guard for a stored checklist (rejects corrupt / legacy data). */
export function isChecklist(value: unknown): value is Checklist {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    Array.isArray(v.subtasks) &&
    v.subtasks.every(isSubtask) &&
    typeof v.done === 'boolean' &&
    (v.deadline === null || typeof v.deadline === 'number') &&
    typeof v.createdAt === 'number' &&
    typeof v.updatedAt === 'number'
  );
}

/** Read all checklists (silently drops anything that fails validation). */
export async function getChecklists(): Promise<Checklist[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CHECKLISTS);
  const raw = result[STORAGE_KEYS.CHECKLISTS];
  if (!Array.isArray(raw)) return [];
  return raw.filter(isChecklist);
}

/** Overwrite the full checklist list. */
export async function saveChecklists(checklists: Checklist[]): Promise<void> {
  await withKeyLock(STORAGE_KEYS.CHECKLISTS, () =>
    chrome.storage.local.set({ [STORAGE_KEYS.CHECKLISTS]: checklists })
  );
}

/** Insert or update a checklist by id; returns the new list. */
export async function upsertChecklist(checklist: Checklist): Promise<Checklist[]> {
  return withKeyLock(STORAGE_KEYS.CHECKLISTS, async () => {
    const checklists = await getChecklists();
    const exists = checklists.some((c) => c.id === checklist.id);
    const next = exists
      ? checklists.map((c) => (c.id === checklist.id ? checklist : c))
      : [...checklists, checklist];
    await chrome.storage.local.set({ [STORAGE_KEYS.CHECKLISTS]: next });
    return next;
  });
}

/** Remove a checklist by id; returns the new list. */
export async function deleteChecklist(id: string): Promise<Checklist[]> {
  return withKeyLock(STORAGE_KEYS.CHECKLISTS, async () => {
    const checklists = await getChecklists();
    const next = checklists.filter((c) => c.id !== id);
    await chrome.storage.local.set({ [STORAGE_KEYS.CHECKLISTS]: next });
    return next;
  });
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

/** Type guard for a stored note (rejects corrupt / legacy data). */
export function isNote(value: unknown): value is Note {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    typeof v.body === 'string' &&
    typeof v.createdAt === 'number' &&
    typeof v.updatedAt === 'number'
  );
}

/** Read all notes (silently drops anything that fails validation). */
export async function getNotes(): Promise<Note[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.NOTES);
  const raw = result[STORAGE_KEYS.NOTES];
  if (!Array.isArray(raw)) return [];
  return raw.filter(isNote);
}

/** Overwrite the full note list. */
export async function saveNotes(notes: Note[]): Promise<void> {
  await withKeyLock(STORAGE_KEYS.NOTES, () =>
    chrome.storage.local.set({ [STORAGE_KEYS.NOTES]: notes })
  );
}

/** Insert or update a note by id; returns the new list. */
export async function upsertNote(note: Note): Promise<Note[]> {
  return withKeyLock(STORAGE_KEYS.NOTES, async () => {
    const notes = await getNotes();
    const exists = notes.some((n) => n.id === note.id);
    const next = exists ? notes.map((n) => (n.id === note.id ? note : n)) : [...notes, note];
    await chrome.storage.local.set({ [STORAGE_KEYS.NOTES]: next });
    return next;
  });
}

/** Remove a note by id; returns the new list. */
export async function deleteNote(id: string): Promise<Note[]> {
  return withKeyLock(STORAGE_KEYS.NOTES, async () => {
    const notes = await getNotes();
    const next = notes.filter((n) => n.id !== id);
    await chrome.storage.local.set({ [STORAGE_KEYS.NOTES]: next });
    return next;
  });
}

// ---------------------------------------------------------------------------
// Value profiles (Cookies + Storage tabs)
// ---------------------------------------------------------------------------

/** Type guard for a stored value profile (rejects corrupt / legacy data). */
export function isValueProfile(value: unknown): value is ValueProfile {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    (v.target === 'cookie' || v.target === 'local' || v.target === 'session') &&
    typeof v.key === 'string' &&
    Array.isArray(v.values) &&
    v.values.every((x) => typeof x === 'string') &&
    typeof v.enabled === 'boolean' &&
    typeof v.createdAt === 'number' &&
    typeof v.updatedAt === 'number' &&
    (v.path === undefined || typeof v.path === 'string') &&
    (v.prefix === undefined || typeof v.prefix === 'string') &&
    (v.suffix === undefined || typeof v.suffix === 'string')
  );
}

/** Read all value profiles (silently drops anything that fails validation). */
export async function getProfiles(): Promise<ValueProfile[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.PROFILES);
  const raw = result[STORAGE_KEYS.PROFILES];
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValueProfile);
}

/** Insert or update a profile by id; returns the new list. */
export async function upsertProfileStored(profile: ValueProfile): Promise<ValueProfile[]> {
  return withKeyLock(STORAGE_KEYS.PROFILES, async () => {
    const profiles = await getProfiles();
    const exists = profiles.some((p) => p.id === profile.id);
    const next = exists
      ? profiles.map((p) => (p.id === profile.id ? profile : p))
      : [...profiles, profile];
    await chrome.storage.local.set({ [STORAGE_KEYS.PROFILES]: next });
    return next;
  });
}

/** Remove a profile by id; returns the new list. */
export async function deleteProfile(id: string): Promise<ValueProfile[]> {
  return withKeyLock(STORAGE_KEYS.PROFILES, async () => {
    const profiles = await getProfiles();
    const next = profiles.filter((p) => p.id !== id);
    await chrome.storage.local.set({ [STORAGE_KEYS.PROFILES]: next });
    return next;
  });
}

// ---------------------------------------------------------------------------
// User preferences (single object, not a list)
// ---------------------------------------------------------------------------

export const DEFAULT_PREFS: Prefs = {
  fontSize: 'medium',
  hudSeconds: HUD_SECONDS_DEFAULT,
  findTimeoutSeconds: FIND_TIMEOUT_SECONDS_DEFAULT,
};

function isFontSize(value: unknown): value is FontSize {
  return value === 'small' || value === 'medium' || value === 'large' || value === 'xlarge';
}

/** Validate a stored tag→palette-index map, keeping only well-formed entries. */
function readTagColors(value: unknown): Record<string, number> | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const out: Record<string, number> = {};
  for (const [tag, idx] of Object.entries(value as Record<string, unknown>)) {
    if (typeof idx === 'number' && Number.isInteger(idx) && idx >= 0 && idx < TAG_COLOR_COUNT) {
      out[tag] = idx;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Read prefs, merging stored valid fields over the defaults. */
export async function getPrefs(): Promise<Prefs> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.PREFS);
  const raw = result[STORAGE_KEYS.PREFS];
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_PREFS };
  const v = raw as Record<string, unknown>;
  const prefs: Prefs = {
    fontSize: isFontSize(v.fontSize) ? v.fontSize : DEFAULT_PREFS.fontSize,
    hudSeconds: HUD_SECONDS_DEFAULT,
    findTimeoutSeconds: FIND_TIMEOUT_SECONDS_DEFAULT,
  };
  if (typeof v.fontScale === 'number' && Number.isFinite(v.fontScale)) {
    prefs.fontScale = Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, v.fontScale));
  }
  if (typeof v.hudSeconds === 'number' && Number.isFinite(v.hudSeconds)) {
    prefs.hudSeconds = Math.min(
      HUD_SECONDS_MAX,
      Math.max(HUD_SECONDS_MIN, Math.round(v.hudSeconds))
    );
  }
  if (typeof v.findTimeoutSeconds === 'number' && Number.isFinite(v.findTimeoutSeconds)) {
    prefs.findTimeoutSeconds = Math.min(
      FIND_TIMEOUT_SECONDS_MAX,
      Math.max(FIND_TIMEOUT_SECONDS_MIN, Math.round(v.findTimeoutSeconds))
    );
  }
  const tagColors = readTagColors(v.tagColors);
  if (tagColors) prefs.tagColors = tagColors;
  if (typeof v.autoReloadOnChange === 'boolean') prefs.autoReloadOnChange = v.autoReloadOnChange;
  return prefs;
}

/** Overwrite the stored prefs object. */
export async function savePrefs(prefs: Prefs): Promise<void> {
  await withKeyLock(STORAGE_KEYS.PREFS, () =>
    chrome.storage.local.set({ [STORAGE_KEYS.PREFS]: prefs })
  );
}
