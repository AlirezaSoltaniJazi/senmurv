import { STORAGE_KEYS } from '@/shared/constants';
import type { SavedScript, TimeEntry, TimeInterval } from '@/shared/types';

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
    typeof v.updatedAt === 'number'
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
