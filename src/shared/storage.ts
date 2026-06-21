import { STORAGE_KEYS } from '@/shared/constants';
import type { SavedScript } from '@/shared/types';

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
