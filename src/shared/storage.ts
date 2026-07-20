import { STORAGE_KEYS } from '@/shared/constants';
import type {
  Checklist,
  FontSize,
  Prefs,
  SavedScript,
  Subtask,
  TimeEntry,
  TimeInterval,
} from '@/shared/types';

/** Type guard for a stored script (rejects corrupt / legacy data). */
export function isSavedScript(value: unknown): value is SavedScript {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.code === 'string' &&
    typeof v.createdAt === 'number' &&
    typeof v.updatedAt === 'number'
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
  await chrome.storage.local.set({ [STORAGE_KEYS.SCRIPTS]: scripts });
}

/** Insert or update a script by id; returns the new list. */
export async function upsertScript(script: SavedScript): Promise<SavedScript[]> {
  const scripts = await getScripts();
  const exists = scripts.some((s) => s.id === script.id);
  const next = exists
    ? scripts.map((s) => (s.id === script.id ? script : s))
    : [...scripts, script];
  await saveScripts(next);
  return next;
}

/** Remove a script by id; returns the new list. */
export async function deleteScript(id: string): Promise<SavedScript[]> {
  const scripts = await getScripts();
  const next = scripts.filter((s) => s.id !== id);
  await saveScripts(next);
  return next;
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
    (v.checklistId === undefined || typeof v.checklistId === 'string')
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
  await chrome.storage.local.set({ [STORAGE_KEYS.TASKS]: tasks });
}

/** Insert or update a task by id; returns the new list. */
export async function upsertTask(task: TimeEntry): Promise<TimeEntry[]> {
  const tasks = await getTasks();
  const exists = tasks.some((t) => t.id === task.id);
  const next = exists ? tasks.map((t) => (t.id === task.id ? task : t)) : [...tasks, task];
  await saveTasks(next);
  return next;
}

/** Remove a task by id; returns the new list. */
export async function deleteTask(id: string): Promise<TimeEntry[]> {
  const tasks = await getTasks();
  const next = tasks.filter((t) => t.id !== id);
  await saveTasks(next);
  return next;
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
  await chrome.storage.local.set({ [STORAGE_KEYS.CHECKLISTS]: checklists });
}

/** Insert or update a checklist by id; returns the new list. */
export async function upsertChecklist(checklist: Checklist): Promise<Checklist[]> {
  const checklists = await getChecklists();
  const exists = checklists.some((c) => c.id === checklist.id);
  const next = exists
    ? checklists.map((c) => (c.id === checklist.id ? checklist : c))
    : [...checklists, checklist];
  await saveChecklists(next);
  return next;
}

/** Remove a checklist by id; returns the new list. */
export async function deleteChecklist(id: string): Promise<Checklist[]> {
  const checklists = await getChecklists();
  const next = checklists.filter((c) => c.id !== id);
  await saveChecklists(next);
  return next;
}

// ---------------------------------------------------------------------------
// User preferences (single object, not a list)
// ---------------------------------------------------------------------------

export const DEFAULT_PREFS: Prefs = { fontSize: 'medium' };

function isFontSize(value: unknown): value is FontSize {
  return value === 'small' || value === 'medium' || value === 'large';
}

/** Read prefs, merging stored valid fields over the defaults. */
export async function getPrefs(): Promise<Prefs> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.PREFS);
  const raw = result[STORAGE_KEYS.PREFS];
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_PREFS };
  const v = raw as Record<string, unknown>;
  return { fontSize: isFontSize(v.fontSize) ? v.fontSize : DEFAULT_PREFS.fontSize };
}

/** Overwrite the stored prefs object. */
export async function savePrefs(prefs: Prefs): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.PREFS]: prefs });
}
