import { browser } from '@/shared/browser-api';
import { upsertAccount } from '@/shared/accounts';
import {
  ACCOUNT_TOOLTIP_DELAY_SECONDS_DEFAULT,
  ACCOUNT_TOOLTIP_DELAY_SECONDS_MAX,
  ACCOUNT_TOOLTIP_DELAY_SECONDS_MIN,
  FIND_TIMEOUT_SECONDS_DEFAULT,
  FIND_TIMEOUT_SECONDS_MAX,
  FIND_TIMEOUT_SECONDS_MIN,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  HUD_SECONDS_DEFAULT,
  HUD_SECONDS_MAX,
  HUD_SECONDS_MIN,
  MAX_PINNED_TOOLS,
  STORAGE_KEYS,
} from '@/shared/constants';
import { TAG_COLOR_COUNT } from '@/shared/tasks';
import type { ToolKey } from '@/shared/tools';
import type {
  Account,
  AccountLocator,
  AccountsSecurityConfig,
  Checklist,
  DefaultPasswordRecord,
  EncryptedSecret,
  FontSize,
  Note,
  Prefs,
  SavedScript,
  Subtask,
  TimeEntry,
  TimeInterval,
  ValueProfile,
} from '@/shared/types';
import type { QueryParamSet } from '@/shared/tools/query-params';

// ---------------------------------------------------------------------------
// Per-key write serialization
// ---------------------------------------------------------------------------

/**
 * browser.storage has no compare-and-swap, so a read-modify-write
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
  const result = await browser.storage.local.get(STORAGE_KEYS.SCRIPTS);
  const raw = result[STORAGE_KEYS.SCRIPTS];
  if (!Array.isArray(raw)) return [];
  return raw.filter(isSavedScript);
}

/** Overwrite the full script list. */
export async function saveScripts(scripts: SavedScript[]): Promise<void> {
  await withKeyLock(STORAGE_KEYS.SCRIPTS, () =>
    browser.storage.local.set({ [STORAGE_KEYS.SCRIPTS]: scripts })
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
    await browser.storage.local.set({ [STORAGE_KEYS.SCRIPTS]: next });
    return next;
  });
}

/** Remove a script by id; returns the new list. */
export async function deleteScript(id: string): Promise<SavedScript[]> {
  return withKeyLock(STORAGE_KEYS.SCRIPTS, async () => {
    const scripts = await getScripts();
    const next = scripts.filter((s) => s.id !== id);
    await browser.storage.local.set({ [STORAGE_KEYS.SCRIPTS]: next });
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
  const result = await browser.storage.local.get(STORAGE_KEYS.TASKS);
  const raw = result[STORAGE_KEYS.TASKS];
  if (!Array.isArray(raw)) return [];
  return raw.filter(isTimeEntry);
}

/** Overwrite the full task list. */
export async function saveTasks(tasks: TimeEntry[]): Promise<void> {
  await withKeyLock(STORAGE_KEYS.TASKS, () =>
    browser.storage.local.set({ [STORAGE_KEYS.TASKS]: tasks })
  );
}

/** Insert or update a task by id; returns the new list. */
export async function upsertTask(task: TimeEntry): Promise<TimeEntry[]> {
  return withKeyLock(STORAGE_KEYS.TASKS, async () => {
    const tasks = await getTasks();
    const exists = tasks.some((t) => t.id === task.id);
    const next = exists ? tasks.map((t) => (t.id === task.id ? task : t)) : [...tasks, task];
    await browser.storage.local.set({ [STORAGE_KEYS.TASKS]: next });
    return next;
  });
}

/** Remove a task by id; returns the new list. */
export async function deleteTask(id: string): Promise<TimeEntry[]> {
  return withKeyLock(STORAGE_KEYS.TASKS, async () => {
    const tasks = await getTasks();
    const next = tasks.filter((t) => t.id !== id);
    await browser.storage.local.set({ [STORAGE_KEYS.TASKS]: next });
    return next;
  });
}

/**
 * Read-modify-write the whole task list under the same lock upsertTask/
 * deleteTask use, so a bulk transform (e.g. renaming a tag across every
 * entry) can't lose a concurrent write the way an unlocked getTasks() +
 * saveTasks() pair would — the exact race withKeyLock exists to prevent.
 */
export async function transformTasks(
  fn: (tasks: TimeEntry[]) => TimeEntry[]
): Promise<TimeEntry[]> {
  return withKeyLock(STORAGE_KEYS.TASKS, async () => {
    const next = fn(await getTasks());
    await browser.storage.local.set({ [STORAGE_KEYS.TASKS]: next });
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
  const result = await browser.storage.local.get(STORAGE_KEYS.CHECKLISTS);
  const raw = result[STORAGE_KEYS.CHECKLISTS];
  if (!Array.isArray(raw)) return [];
  return raw.filter(isChecklist);
}

/** Overwrite the full checklist list. */
export async function saveChecklists(checklists: Checklist[]): Promise<void> {
  await withKeyLock(STORAGE_KEYS.CHECKLISTS, () =>
    browser.storage.local.set({ [STORAGE_KEYS.CHECKLISTS]: checklists })
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
    await browser.storage.local.set({ [STORAGE_KEYS.CHECKLISTS]: next });
    return next;
  });
}

/** Remove a checklist by id; returns the new list. */
export async function deleteChecklist(id: string): Promise<Checklist[]> {
  return withKeyLock(STORAGE_KEYS.CHECKLISTS, async () => {
    const checklists = await getChecklists();
    const next = checklists.filter((c) => c.id !== id);
    await browser.storage.local.set({ [STORAGE_KEYS.CHECKLISTS]: next });
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
  const result = await browser.storage.local.get(STORAGE_KEYS.NOTES);
  const raw = result[STORAGE_KEYS.NOTES];
  if (!Array.isArray(raw)) return [];
  return raw.filter(isNote);
}

/** Overwrite the full note list. */
export async function saveNotes(notes: Note[]): Promise<void> {
  await withKeyLock(STORAGE_KEYS.NOTES, () =>
    browser.storage.local.set({ [STORAGE_KEYS.NOTES]: notes })
  );
}

/** Insert or update a note by id; returns the new list. */
export async function upsertNote(note: Note): Promise<Note[]> {
  return withKeyLock(STORAGE_KEYS.NOTES, async () => {
    const notes = await getNotes();
    const exists = notes.some((n) => n.id === note.id);
    const next = exists ? notes.map((n) => (n.id === note.id ? note : n)) : [...notes, note];
    await browser.storage.local.set({ [STORAGE_KEYS.NOTES]: next });
    return next;
  });
}

/** Remove a note by id; returns the new list. */
export async function deleteNote(id: string): Promise<Note[]> {
  return withKeyLock(STORAGE_KEYS.NOTES, async () => {
    const notes = await getNotes();
    const next = notes.filter((n) => n.id !== id);
    await browser.storage.local.set({ [STORAGE_KEYS.NOTES]: next });
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
  const result = await browser.storage.local.get(STORAGE_KEYS.PROFILES);
  const raw = result[STORAGE_KEYS.PROFILES];
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValueProfile);
}

/** Overwrite the full profile list. */
export async function saveProfiles(profiles: ValueProfile[]): Promise<void> {
  await withKeyLock(STORAGE_KEYS.PROFILES, () =>
    browser.storage.local.set({ [STORAGE_KEYS.PROFILES]: profiles })
  );
}

/** Insert or update a profile by id; returns the new list. */
export async function upsertProfileStored(profile: ValueProfile): Promise<ValueProfile[]> {
  return withKeyLock(STORAGE_KEYS.PROFILES, async () => {
    const profiles = await getProfiles();
    const exists = profiles.some((p) => p.id === profile.id);
    const next = exists
      ? profiles.map((p) => (p.id === profile.id ? profile : p))
      : [...profiles, profile];
    await browser.storage.local.set({ [STORAGE_KEYS.PROFILES]: next });
    return next;
  });
}

/** Remove a profile by id; returns the new list. */
export async function deleteProfile(id: string): Promise<ValueProfile[]> {
  return withKeyLock(STORAGE_KEYS.PROFILES, async () => {
    const profiles = await getProfiles();
    const next = profiles.filter((p) => p.id !== id);
    await browser.storage.local.set({ [STORAGE_KEYS.PROFILES]: next });
    return next;
  });
}

// ---------------------------------------------------------------------------
// Query param sets (Query params tool)
// ---------------------------------------------------------------------------

/** Type guard for a stored query-param set (rejects corrupt / legacy data). */
export function isQueryParamSet(value: unknown): value is QueryParamSet {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.base === 'string' &&
    Array.isArray(v.params) &&
    v.params.every(
      (p) =>
        typeof p === 'object' &&
        p !== null &&
        typeof (p as Record<string, unknown>).name === 'string' &&
        typeof (p as Record<string, unknown>).value === 'string'
    ) &&
    typeof v.hash === 'string' &&
    typeof v.createdAt === 'number' &&
    typeof v.updatedAt === 'number'
  );
}

/** Read all query-param sets (silently drops anything that fails validation). */
export async function getQueryParamSets(): Promise<QueryParamSet[]> {
  const result = await browser.storage.local.get(STORAGE_KEYS.QUERY_PARAM_SETS);
  const raw = result[STORAGE_KEYS.QUERY_PARAM_SETS];
  if (!Array.isArray(raw)) return [];
  return raw.filter(isQueryParamSet);
}

/** Overwrite the full query-param set list. */
export async function saveQueryParamSets(sets: QueryParamSet[]): Promise<void> {
  await withKeyLock(STORAGE_KEYS.QUERY_PARAM_SETS, () =>
    browser.storage.local.set({ [STORAGE_KEYS.QUERY_PARAM_SETS]: sets })
  );
}

/** Insert or update a query-param set by id; returns the new list. */
export async function upsertQueryParamSet(set: QueryParamSet): Promise<QueryParamSet[]> {
  return withKeyLock(STORAGE_KEYS.QUERY_PARAM_SETS, async () => {
    const sets = await getQueryParamSets();
    const exists = sets.some((s) => s.id === set.id);
    const next = exists ? sets.map((s) => (s.id === set.id ? set : s)) : [...sets, set];
    await browser.storage.local.set({ [STORAGE_KEYS.QUERY_PARAM_SETS]: next });
    return next;
  });
}

/** Remove a query-param set by id; returns the new list. */
export async function deleteQueryParamSet(id: string): Promise<QueryParamSet[]> {
  return withKeyLock(STORAGE_KEYS.QUERY_PARAM_SETS, async () => {
    const sets = await getQueryParamSets();
    const next = sets.filter((s) => s.id !== id);
    await browser.storage.local.set({ [STORAGE_KEYS.QUERY_PARAM_SETS]: next });
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
  accountTooltipDelaySeconds: ACCOUNT_TOOLTIP_DELAY_SECONDS_DEFAULT,
};

function isFontSize(value: unknown): value is FontSize {
  return value === 'small' || value === 'medium' || value === 'large' || value === 'xlarge';
}

/**
 * Validate a stored pinned-tools list: keep deduplicated, non-empty string
 * entries, in their stored order, capped at MAX_PINNED_TOOLS. This layer only
 * checks shape — whether an entry is still a REAL ToolKey (vs. a stale key
 * from a renamed/removed tool) is filtered by the sidepanel's validPinnedTools
 * (shared/tools.ts), which already has the live TOOLS registry in its own
 * bundle. A value import of TOOLS here would pull shared/tools.ts into the
 * service worker's bundle too, forking it into a shared chunk that collides
 * in name with content/tools.ts's lazy Tools chunk (see
 * tests/build/bundle-placement.test.ts).
 */
function readPinnedTools(value: unknown): ToolKey[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: ToolKey[] = [];
  for (const v of value) {
    if (typeof v === 'string' && v.length > 0 && !out.includes(v as ToolKey)) {
      out.push(v as ToolKey);
    }
    if (out.length >= MAX_PINNED_TOOLS) break;
  }
  return out.length > 0 ? out : undefined;
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
  const result = await browser.storage.local.get(STORAGE_KEYS.PREFS);
  const raw = result[STORAGE_KEYS.PREFS];
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_PREFS };
  const v = raw as Record<string, unknown>;
  const prefs: Prefs = {
    fontSize: isFontSize(v.fontSize) ? v.fontSize : DEFAULT_PREFS.fontSize,
    hudSeconds: HUD_SECONDS_DEFAULT,
    findTimeoutSeconds: FIND_TIMEOUT_SECONDS_DEFAULT,
    accountTooltipDelaySeconds: ACCOUNT_TOOLTIP_DELAY_SECONDS_DEFAULT,
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
  if (
    typeof v.accountTooltipDelaySeconds === 'number' &&
    Number.isFinite(v.accountTooltipDelaySeconds)
  ) {
    prefs.accountTooltipDelaySeconds = Math.min(
      ACCOUNT_TOOLTIP_DELAY_SECONDS_MAX,
      Math.max(ACCOUNT_TOOLTIP_DELAY_SECONDS_MIN, Math.round(v.accountTooltipDelaySeconds))
    );
  }
  const tagColors = readTagColors(v.tagColors);
  if (tagColors) prefs.tagColors = tagColors;
  if (typeof v.autoReloadOnChange === 'boolean') prefs.autoReloadOnChange = v.autoReloadOnChange;
  const pinnedTools = readPinnedTools(v.pinnedTools);
  if (pinnedTools) prefs.pinnedTools = pinnedTools;
  return prefs;
}

/** Overwrite the stored prefs object. */
export async function savePrefs(prefs: Prefs): Promise<void> {
  await withKeyLock(STORAGE_KEYS.PREFS, () =>
    browser.storage.local.set({ [STORAGE_KEYS.PREFS]: prefs })
  );
}

// ---------------------------------------------------------------------------
// Accounts (saved logins, PIN-locked encryption)
// ---------------------------------------------------------------------------

function isEncryptedSecret(value: unknown): value is EncryptedSecret {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.ciphertext === 'string' && typeof v.iv === 'string';
}

function isAccountLocator(value: unknown): value is AccountLocator {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (v.kind === 'css' || v.kind === 'xpath') && typeof v.query === 'string';
}

/** Type guard for a stored account (rejects corrupt / legacy data). */
export function isAccount(value: unknown): value is Account {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.address === 'string' &&
    typeof v.username === 'string' &&
    typeof v.useDefaultPassword === 'boolean' &&
    isAccountLocator(v.usernameField) &&
    isAccountLocator(v.passwordField) &&
    isAccountLocator(v.loginButton) &&
    typeof v.createdAt === 'number' &&
    typeof v.updatedAt === 'number' &&
    (v.encryptedPassword === undefined || isEncryptedSecret(v.encryptedPassword)) &&
    (v.group === undefined || typeof v.group === 'string') &&
    (v.description === undefined || typeof v.description === 'string')
  );
}

/** Read all saved accounts (silently drops anything that fails validation). */
export async function getAccounts(): Promise<Account[]> {
  const result = await browser.storage.local.get(STORAGE_KEYS.ACCOUNTS);
  const raw = result[STORAGE_KEYS.ACCOUNTS];
  if (!Array.isArray(raw)) return [];
  return raw.filter(isAccount);
}

/** Overwrite the full account list. */
export async function saveAccounts(accounts: Account[]): Promise<void> {
  await withKeyLock(STORAGE_KEYS.ACCOUNTS, () =>
    browser.storage.local.set({ [STORAGE_KEYS.ACCOUNTS]: accounts })
  );
}

/** Insert or update an account by id; returns the new list. */
export async function upsertAccountStored(account: Account): Promise<Account[]> {
  return withKeyLock(STORAGE_KEYS.ACCOUNTS, async () => {
    const accounts = await getAccounts();
    const next = upsertAccount(accounts, account, Date.now());
    await browser.storage.local.set({ [STORAGE_KEYS.ACCOUNTS]: next });
    return next;
  });
}

/** Remove an account by id; returns the new list. */
export async function deleteAccount(id: string): Promise<Account[]> {
  return withKeyLock(STORAGE_KEYS.ACCOUNTS, async () => {
    const accounts = await getAccounts();
    const next = accounts.filter((a) => a.id !== id);
    await browser.storage.local.set({ [STORAGE_KEYS.ACCOUNTS]: next });
    return next;
  });
}

/** Type guard for the stored default-password record. */
export function isDefaultPasswordRecord(value: unknown): value is DefaultPasswordRecord {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return isEncryptedSecret(v.encryptedPassword) && typeof v.updatedAt === 'number';
}

/** Read the shared default password record, or undefined if none is set. */
export async function getDefaultPasswordRecord(): Promise<DefaultPasswordRecord | undefined> {
  const result = await browser.storage.local.get(STORAGE_KEYS.DEFAULT_PASSWORD);
  const raw = result[STORAGE_KEYS.DEFAULT_PASSWORD];
  return isDefaultPasswordRecord(raw) ? raw : undefined;
}

/** Set (or replace) the shared default password record. */
export async function setDefaultPasswordRecord(record: DefaultPasswordRecord): Promise<void> {
  await withKeyLock(STORAGE_KEYS.DEFAULT_PASSWORD, () =>
    browser.storage.local.set({ [STORAGE_KEYS.DEFAULT_PASSWORD]: record })
  );
}

/** Clear the shared default password. */
export async function clearDefaultPasswordRecord(): Promise<void> {
  await withKeyLock(STORAGE_KEYS.DEFAULT_PASSWORD, () =>
    browser.storage.local.remove(STORAGE_KEYS.DEFAULT_PASSWORD)
  );
}

/** Type guard for the stored PIN/security config. */
export function isAccountsSecurityConfig(value: unknown): value is AccountsSecurityConfig {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.salt === 'string' &&
    isEncryptedSecret(v.pinCheck) &&
    typeof v.sessionMinutes === 'number' &&
    typeof v.updatedAt === 'number'
  );
}

/** Read the PIN/security config, or undefined if no PIN has been set up yet. */
export async function getAccountsSecurityConfig(): Promise<AccountsSecurityConfig | undefined> {
  const result = await browser.storage.local.get(STORAGE_KEYS.ACCOUNTS_SECURITY);
  const raw = result[STORAGE_KEYS.ACCOUNTS_SECURITY];
  return isAccountsSecurityConfig(raw) ? raw : undefined;
}

/** Set (or replace) the PIN/security config. */
export async function setAccountsSecurityConfig(config: AccountsSecurityConfig): Promise<void> {
  await withKeyLock(STORAGE_KEYS.ACCOUNTS_SECURITY, () =>
    browser.storage.local.set({ [STORAGE_KEYS.ACCOUNTS_SECURITY]: config })
  );
}
