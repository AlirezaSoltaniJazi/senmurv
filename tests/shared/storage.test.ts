import { describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '@/shared/constants';
import {
  DEFAULT_PREFS,
  deleteChecklist,
  deleteNote,
  deleteScript,
  deleteTask,
  getChecklists,
  getNotes,
  getPrefs,
  getScripts,
  getTasks,
  isChecklist,
  isNote,
  isSavedScript,
  isTimeEntry,
  savePrefs,
  upsertChecklist,
  upsertNote,
  upsertScript,
  upsertTask,
} from '@/shared/storage';
import type { Checklist, Note, SavedScript, TimeEntry } from '@/shared/types';
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

describe('prefs storage', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await getPrefs()).toEqual(DEFAULT_PREFS);
  });

  it('merges valid stored fields and falls back on corrupt ones', async () => {
    store[STORAGE_KEYS.PREFS] = { fontSize: 'large' };
    expect((await getPrefs()).fontSize).toBe('large');

    store[STORAGE_KEYS.PREFS] = { fontSize: 'enormous' };
    expect((await getPrefs()).fontSize).toBe(DEFAULT_PREFS.fontSize);
  });

  it('round-trips through savePrefs', async () => {
    await savePrefs({ fontSize: 'small' });
    expect((await getPrefs()).fontSize).toBe('small');
  });
});
