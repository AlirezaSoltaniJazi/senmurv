import { describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '@/shared/constants';
import {
  deleteScript,
  deleteTask,
  getScripts,
  getTasks,
  isSavedScript,
  isTimeEntry,
  upsertScript,
  upsertTask,
} from '@/shared/storage';
import type { SavedScript, TimeEntry } from '@/shared/types';
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
  it('accepts well-formed entries (running, paused, and done)', () => {
    expect(isTimeEntry(makeEntry())).toBe(true);
    expect(
      isTimeEntry(makeEntry({ intervals: [{ start: 1000, end: null }], stoppedAt: null }))
    ).toBe(true);
    expect(isTimeEntry(makeEntry({ tag: '', intervals: [] }))).toBe(true);
  });

  it('rejects junk and malformed fields', () => {
    expect(isTimeEntry({ id: 'x' })).toBe(false);
    expect(isTimeEntry(null)).toBe(false);
    expect(isTimeEntry(makeEntry({ intervals: [{ start: 'nope' } as never] }))).toBe(false);
    expect(isTimeEntry({ ...makeEntry(), stoppedAt: 'later' })).toBe(false);
    expect(isTimeEntry({ ...makeEntry(), intervals: 'not-an-array' })).toBe(false);
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
