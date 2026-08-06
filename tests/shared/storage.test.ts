import { describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '@/shared/constants';
import {
  DEFAULT_PREFS,
  deleteChecklist,
  deleteNote,
  deleteProfile,
  deleteQueryParamSet,
  deleteScript,
  deleteTask,
  getChecklists,
  getNotes,
  getPrefs,
  getProfiles,
  getQueryParamSets,
  getScripts,
  getTasks,
  isChecklist,
  isNote,
  isQueryParamSet,
  isSavedScript,
  isTimeEntry,
  isValueProfile,
  savePrefs,
  upsertChecklist,
  upsertNote,
  upsertProfileStored,
  upsertQueryParamSet,
  upsertScript,
  upsertTask,
} from '@/shared/storage';
import type { Checklist, Note, SavedScript, TimeEntry, ValueProfile } from '@/shared/types';
import type { QueryParamSet } from '@/shared/tools/query-params';
import { store } from '../setup';

function makeScript(overrides: Partial<SavedScript> = {}): SavedScript {
  return {
    id: 'scr_1',
    name: 'Test',
    code: 'console.log(1)',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: 'tsk_1',
    title: 'Write Test Case',
    tag: 'My Company',
    intervals: [{ start: 1000, end: 2000 }],
    stoppedAt: 2000,
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

function makeList(overrides: Partial<Checklist> = {}): Checklist {
  return {
    id: 'chk_1',
    title: 'Release v1.0',
    subtasks: [{ id: 'sub_1', title: 'Test', done: false }],
    done: false,
    deadline: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note_1',
    title: 'Standup',
    body: 'Discuss the release plan.',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function makeSet(overrides: Partial<QueryParamSet> = {}): QueryParamSet {
  return {
    id: 'qps_1',
    name: 'Account record',
    base: 'https://org.crm4.dynamics.com/main.aspx',
    params: [
      { name: 'etn', value: 'account' },
      { name: 'pagetype', value: 'entityrecord' },
    ],
    hash: '',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('isSavedScript', () => {
  it('accepts a well-formed script and rejects junk', () => {
    expect(isSavedScript(makeScript())).toBe(true);
    expect(isSavedScript({ id: 'x' })).toBe(false);
    expect(isSavedScript(null)).toBe(false);
    expect(isSavedScript({ ...makeScript(), createdAt: 'nope' })).toBe(false);
  });
});

describe('script storage', () => {
  it('returns [] when nothing is stored', async () => {
    expect(await getScripts()).toEqual([]);
  });

  it('drops corrupt entries on read', async () => {
    store[STORAGE_KEYS.SCRIPTS] = [makeScript(), { id: 'bad' }];
    expect(await getScripts()).toHaveLength(1);
  });

  it('upserts (insert then update) by id', async () => {
    await upsertScript(makeScript());
    let all = await getScripts();
    expect(all).toHaveLength(1);

    all = await upsertScript(makeScript({ name: 'Renamed', updatedAt: 2 }));
    expect(all).toHaveLength(1);
    expect(all[0]!.name).toBe('Renamed');
  });

  it('deletes by id', async () => {
    await upsertScript(makeScript());
    await upsertScript(makeScript({ id: 'scr_2' }));
    const remaining = await deleteScript('scr_1');
    expect(remaining.map((s) => s.id)).toEqual(['scr_2']);
  });

  it('serializes concurrent upserts so neither write is lost (race)', async () => {
    // Fire two upserts WITHOUT awaiting the first. Without the per-key lock both
    // read the empty base list and the second `set` clobbers the first — only
    // one script would survive. The lock makes the second op read the first's
    // committed write, so both persist.
    await Promise.all([
      upsertScript(makeScript({ id: 'scr_a' })),
      upsertScript(makeScript({ id: 'scr_b' })),
    ]);
    const all = await getScripts();
    expect(all.map((s) => s.id).sort()).toEqual(['scr_a', 'scr_b']);
  });
});

describe('isTimeEntry', () => {
  it('accepts well-formed entries (running, paused, done, and re-run children)', () => {
    expect(isTimeEntry(makeEntry())).toBe(true);
    expect(
      isTimeEntry(makeEntry({ intervals: [{ start: 1000, end: null }], stoppedAt: null }))
    ).toBe(true);
    expect(isTimeEntry(makeEntry({ tag: '', intervals: [] }))).toBe(true);
    expect(isTimeEntry(makeEntry({ parentId: 'tsk_root' }))).toBe(true);
    expect(isTimeEntry(makeEntry({ checklistId: 'chk_1' }))).toBe(true);
    expect(isTimeEntry(makeEntry({ checklistId: 'chk_1', subtaskId: 'sub_1' }))).toBe(true);
  });

  it('rejects junk and malformed fields', () => {
    expect(isTimeEntry({ id: 'x' })).toBe(false);
    expect(isTimeEntry(null)).toBe(false);
    expect(isTimeEntry(makeEntry({ intervals: [{ start: 'nope' } as never] }))).toBe(false);
    expect(isTimeEntry({ ...makeEntry(), stoppedAt: 'later' })).toBe(false);
    expect(isTimeEntry({ ...makeEntry(), intervals: 'not-an-array' })).toBe(false);
    expect(isTimeEntry({ ...makeEntry(), parentId: 123 })).toBe(false);
  });
});

describe('task storage', () => {
  it('returns [] when nothing is stored', async () => {
    expect(await getTasks()).toEqual([]);
  });

  it('drops corrupt entries on read', async () => {
    store[STORAGE_KEYS.TASKS] = [makeEntry(), { id: 'bad' }];
    expect(await getTasks()).toHaveLength(1);
  });

  it('upserts (insert then update) by id', async () => {
    await upsertTask(makeEntry());
    let all = await getTasks();
    expect(all).toHaveLength(1);

    all = await upsertTask(makeEntry({ title: 'Renamed', updatedAt: 3 }));
    expect(all).toHaveLength(1);
    expect(all[0]!.title).toBe('Renamed');
  });

  it('deletes by id', async () => {
    await upsertTask(makeEntry());
    await upsertTask(makeEntry({ id: 'tsk_2' }));
    const remaining = await deleteTask('tsk_1');
    expect(remaining.map((t) => t.id)).toEqual(['tsk_2']);
  });
});

describe('isChecklist', () => {
  it('accepts well-formed checklists (with/without subtasks, deadline null or set)', () => {
    expect(isChecklist(makeList())).toBe(true);
    expect(isChecklist(makeList({ subtasks: [], done: true }))).toBe(true);
    expect(isChecklist(makeList({ deadline: 123456 }))).toBe(true);
  });

  it('rejects junk and malformed fields', () => {
    expect(isChecklist({ id: 'x' })).toBe(false);
    expect(isChecklist(null)).toBe(false);
    expect(isChecklist({ ...makeList(), subtasks: [{ id: 'sub_1', title: 'x' }] })).toBe(false);
    expect(isChecklist({ ...makeList(), done: 'nope' })).toBe(false);
    expect(isChecklist({ ...makeList(), deadline: 'soon' })).toBe(false);
  });
});

describe('checklist storage', () => {
  it('returns [] when nothing is stored', async () => {
    expect(await getChecklists()).toEqual([]);
  });

  it('drops corrupt entries on read', async () => {
    store[STORAGE_KEYS.CHECKLISTS] = [makeList(), { id: 'bad' }];
    expect(await getChecklists()).toHaveLength(1);
  });

  it('upserts (insert then update) by id', async () => {
    await upsertChecklist(makeList());
    let all = await getChecklists();
    expect(all).toHaveLength(1);

    all = await upsertChecklist(makeList({ title: 'Renamed', updatedAt: 3 }));
    expect(all).toHaveLength(1);
    expect(all[0]!.title).toBe('Renamed');
  });

  it('deletes by id', async () => {
    await upsertChecklist(makeList());
    await upsertChecklist(makeList({ id: 'chk_2' }));
    const remaining = await deleteChecklist('chk_1');
    expect(remaining.map((c) => c.id)).toEqual(['chk_2']);
  });
});

describe('isNote', () => {
  it('accepts a well-formed note (incl. empty title/body) and rejects junk', () => {
    expect(isNote(makeNote())).toBe(true);
    expect(isNote(makeNote({ title: '', body: '' }))).toBe(true);
    expect(isNote({ id: 'x' })).toBe(false);
    expect(isNote(null)).toBe(false);
    expect(isNote({ ...makeNote(), body: 123 })).toBe(false);
  });
});

describe('note storage', () => {
  it('returns [] when nothing is stored', async () => {
    expect(await getNotes()).toEqual([]);
  });

  it('drops corrupt entries on read', async () => {
    store[STORAGE_KEYS.NOTES] = [makeNote(), { id: 'bad' }];
    expect(await getNotes()).toHaveLength(1);
  });

  it('upserts (insert then update) by id', async () => {
    await upsertNote(makeNote());
    let all = await getNotes();
    expect(all).toHaveLength(1);

    all = await upsertNote(makeNote({ title: 'Renamed', updatedAt: 3 }));
    expect(all).toHaveLength(1);
    expect(all[0]!.title).toBe('Renamed');
  });

  it('deletes by id', async () => {
    await upsertNote(makeNote());
    await upsertNote(makeNote({ id: 'note_2' }));
    const remaining = await deleteNote('note_1');
    expect(remaining.map((n) => n.id)).toEqual(['note_2']);
  });
});

describe('isQueryParamSet', () => {
  it('accepts a well-formed set and rejects junk', () => {
    expect(isQueryParamSet(makeSet())).toBe(true);
    expect(isQueryParamSet({ ...makeSet(), params: [{ name: 'a' }] })).toBe(false);
    expect(isQueryParamSet({ ...makeSet(), base: 5 })).toBe(false);
    expect(isQueryParamSet(null)).toBe(false);
  });
});

describe('query param set storage', () => {
  it('returns [] when nothing is stored', async () => {
    expect(await getQueryParamSets()).toEqual([]);
  });

  it('drops corrupt entries on read', async () => {
    store[STORAGE_KEYS.QUERY_PARAM_SETS] = [makeSet(), { id: 'bad' }];
    expect(await getQueryParamSets()).toHaveLength(1);
  });

  it('upserts (insert then update) by id', async () => {
    await upsertQueryParamSet(makeSet());
    let all = await getQueryParamSets();
    expect(all).toHaveLength(1);

    all = await upsertQueryParamSet(makeSet({ name: 'Renamed', updatedAt: 3 }));
    expect(all).toHaveLength(1);
    expect(all[0]!.name).toBe('Renamed');
  });

  it('deletes by id', async () => {
    await upsertQueryParamSet(makeSet());
    await upsertQueryParamSet(makeSet({ id: 'qps_2' }));
    const remaining = await deleteQueryParamSet('qps_1');
    expect(remaining.map((s) => s.id)).toEqual(['qps_2']);
  });
});

describe('value profiles storage', () => {
  function mk(over: Partial<ValueProfile> = {}): ValueProfile {
    return {
      id: 'prof_1',
      name: 'Locale',
      target: 'local',
      key: 'localeKey',
      values: ['en_GB'],
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
      ...over,
    };
  }

  it('isValueProfile rejects corrupt / foreign data', () => {
    expect(isValueProfile(mk())).toBe(true);
    expect(isValueProfile(mk({ target: 'nope' as ValueProfile['target'] }))).toBe(false);
    expect(isValueProfile({ ...mk(), values: [1, 2] })).toBe(false);
    expect(isValueProfile({ ...mk(), enabled: 'yes' })).toBe(false);
    expect(isValueProfile(null)).toBe(false);
    // Optional fields must still be the right type when present.
    expect(isValueProfile({ ...mk(), path: 5 })).toBe(false);
    expect(isValueProfile({ ...mk(), prefix: '"', suffix: '"' })).toBe(true);
  });

  it('returns [] when nothing is stored, and drops invalid entries', async () => {
    expect(await getProfiles()).toEqual([]);
    store[STORAGE_KEYS.PROFILES] = [mk({ id: 'good' }), { junk: true }];
    expect((await getProfiles()).map((p) => p.id)).toEqual(['good']);
  });

  it('upserts by id and deletes', async () => {
    await upsertProfileStored(mk({ id: 'a' }));
    await upsertProfileStored(mk({ id: 'b', name: 'Flag' }));
    expect((await getProfiles()).map((p) => p.id)).toEqual(['a', 'b']);

    await upsertProfileStored(mk({ id: 'a', name: 'Renamed' }));
    const afterUpdate = await getProfiles();
    expect(afterUpdate).toHaveLength(2); // replaced, not appended
    expect(afterUpdate.find((p) => p.id === 'a')?.name).toBe('Renamed');

    const afterDelete = await deleteProfile('a');
    expect(afterDelete.map((p) => p.id)).toEqual(['b']);
    expect((await getProfiles()).map((p) => p.id)).toEqual(['b']);
  });
});

describe('prefs storage', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await getPrefs()).toEqual(DEFAULT_PREFS);
  });

  it('merges valid stored fields and falls back on corrupt ones', async () => {
    store[STORAGE_KEYS.PREFS] = { fontSize: 'large' };
    expect((await getPrefs()).fontSize).toBe('large');

    store[STORAGE_KEYS.PREFS] = { fontSize: 'xlarge' };
    expect((await getPrefs()).fontSize).toBe('xlarge');

    store[STORAGE_KEYS.PREFS] = { fontSize: 'enormous' };
    expect((await getPrefs()).fontSize).toBe(DEFAULT_PREFS.fontSize);
  });

  it('reads a manual fontScale, clamped to the slider bounds', async () => {
    store[STORAGE_KEYS.PREFS] = { fontSize: 'medium', fontScale: 1.25 };
    expect((await getPrefs()).fontScale).toBe(1.25);

    store[STORAGE_KEYS.PREFS] = { fontSize: 'medium', fontScale: 99 };
    expect((await getPrefs()).fontScale).toBe(1.7); // FONT_SCALE_MAX

    store[STORAGE_KEYS.PREFS] = { fontSize: 'medium', fontScale: 0.1 };
    expect((await getPrefs()).fontScale).toBe(0.8); // FONT_SCALE_MIN
  });

  it('omits fontScale when absent or non-numeric', async () => {
    store[STORAGE_KEYS.PREFS] = { fontSize: 'medium' };
    expect((await getPrefs()).fontScale).toBeUndefined();

    store[STORAGE_KEYS.PREFS] = { fontSize: 'medium', fontScale: 'big' };
    expect((await getPrefs()).fontScale).toBeUndefined();
  });

  it('round-trips through savePrefs (preset and manual scale)', async () => {
    // getPrefs always fills the default hudSeconds + findTimeoutSeconds, so a saved
    // prefs object without them reads back with those defaults (3 / 10).
    await savePrefs({ fontSize: 'small' });
    expect(await getPrefs()).toEqual({ fontSize: 'small', hudSeconds: 3, findTimeoutSeconds: 10 });

    await savePrefs({ fontSize: 'large', fontScale: 1.4 });
    expect(await getPrefs()).toEqual({
      fontSize: 'large',
      fontScale: 1.4,
      hudSeconds: 3,
      findTimeoutSeconds: 10,
    });
  });

  it('reads a stored findTimeoutSeconds, clamped and rounded to the bounds', async () => {
    store[STORAGE_KEYS.PREFS] = { fontSize: 'medium', findTimeoutSeconds: 25 };
    expect((await getPrefs()).findTimeoutSeconds).toBe(25);

    store[STORAGE_KEYS.PREFS] = { fontSize: 'medium', findTimeoutSeconds: 9999 };
    expect((await getPrefs()).findTimeoutSeconds).toBe(120); // FIND_TIMEOUT_SECONDS_MAX

    store[STORAGE_KEYS.PREFS] = { fontSize: 'medium', findTimeoutSeconds: 0 };
    expect((await getPrefs()).findTimeoutSeconds).toBe(1); // FIND_TIMEOUT_SECONDS_MIN

    store[STORAGE_KEYS.PREFS] = { fontSize: 'medium' };
    expect((await getPrefs()).findTimeoutSeconds).toBe(10); // default
  });

  it('reads valid tagColors and drops malformed / out-of-range entries', async () => {
    store[STORAGE_KEYS.PREFS] = {
      fontSize: 'medium',
      tagColors: { Work: 3, Home: 0, Bad: 99, Neg: -1, NaNy: 'x' },
    };
    expect((await getPrefs()).tagColors).toEqual({ Work: 3, Home: 0 });

    store[STORAGE_KEYS.PREFS] = { fontSize: 'medium' };
    expect((await getPrefs()).tagColors).toBeUndefined();
  });

  it('reads a stored hudSeconds, clamped and rounded to the bounds', async () => {
    store[STORAGE_KEYS.PREFS] = { fontSize: 'medium', hudSeconds: 5 };
    expect((await getPrefs()).hudSeconds).toBe(5);

    store[STORAGE_KEYS.PREFS] = { fontSize: 'medium', hudSeconds: 999 };
    expect((await getPrefs()).hudSeconds).toBe(60); // HUD_SECONDS_MAX

    store[STORAGE_KEYS.PREFS] = { fontSize: 'medium', hudSeconds: 0 };
    expect((await getPrefs()).hudSeconds).toBe(1); // HUD_SECONDS_MIN

    store[STORAGE_KEYS.PREFS] = { fontSize: 'medium', hudSeconds: 4.6 };
    expect((await getPrefs()).hudSeconds).toBe(5); // rounded
  });

  it('reads autoReloadOnChange, defaulting to absent (off)', async () => {
    store[STORAGE_KEYS.PREFS] = { fontSize: 'medium' };
    expect((await getPrefs()).autoReloadOnChange).toBeUndefined();

    store[STORAGE_KEYS.PREFS] = { fontSize: 'medium', autoReloadOnChange: true };
    expect((await getPrefs()).autoReloadOnChange).toBe(true);

    // A non-boolean is ignored rather than coerced.
    store[STORAGE_KEYS.PREFS] = { fontSize: 'medium', autoReloadOnChange: 'yes' };
    expect((await getPrefs()).autoReloadOnChange).toBeUndefined();
  });

  it('reads pinnedTools: dedupes and caps at MAX_PINNED_TOOLS', async () => {
    // This layer only checks shape (string, non-empty, deduped, capped) — not
    // whether an entry is still a real ToolKey. That check is deliberately
    // done by the sidepanel's validPinnedTools (shared/tools.test.ts), not
    // here, so the service worker's bundle never needs a value import of the
    // TOOLS registry (see the comment on readPinnedTools).
    store[STORAGE_KEYS.PREFS] = {
      fontSize: 'medium',
      pinnedTools: ['bypass', 'bypass', 'measure', 'color', 'a11y', 'font', 'assert'],
    };
    expect((await getPrefs()).pinnedTools).toEqual(['bypass', 'measure', 'color', 'a11y', 'font']);

    store[STORAGE_KEYS.PREFS] = { fontSize: 'medium' };
    expect((await getPrefs()).pinnedTools).toBeUndefined();

    // A non-array is ignored rather than coerced.
    store[STORAGE_KEYS.PREFS] = { fontSize: 'medium', pinnedTools: 'bypass' };
    expect((await getPrefs()).pinnedTools).toBeUndefined();
  });

  it('falls back to the default hudSeconds when absent or non-numeric', async () => {
    store[STORAGE_KEYS.PREFS] = { fontSize: 'medium' };
    expect((await getPrefs()).hudSeconds).toBe(3);

    store[STORAGE_KEYS.PREFS] = { fontSize: 'medium', hudSeconds: 'soon' };
    expect((await getPrefs()).hudSeconds).toBe(3);
  });
});
