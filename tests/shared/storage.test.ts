import { describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '@/shared/constants';
import { deleteScript, getScripts, isSavedScript, upsertScript } from '@/shared/storage';
import type { SavedScript } from '@/shared/types';
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
