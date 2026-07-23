import { describe, expect, it } from 'vitest';
import {
  applyScriptImport,
  importConflicts,
  parseScriptsImport,
  reorderScripts,
  serializeScripts,
  uniqueName,
} from '@/shared/script-io';
import type { SavedScript } from '@/shared/types';

const sample: SavedScript[] = [
  { id: 'scr_1', name: 'A', code: 'console.log(1)', createdAt: 1, updatedAt: 2 },
];

describe('script-io', () => {
  it('round-trips export → import preserving ids, and stamps the bundle', () => {
    const json = serializeScripts(sample);
    const bundle = JSON.parse(json);
    expect(bundle.schemaVersion).toBe(1);
    expect(typeof bundle.exportedAt).toBe('string');

    const res = parseScriptsImport(json);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toHaveLength(1);
      expect(res.value[0]).toMatchObject({ id: 'scr_1', name: 'A', code: 'console.log(1)' });
    }
  });

  it('accepts a bare array of { name, code }', () => {
    const res = parseScriptsImport(JSON.stringify([{ name: 'X', code: 'y()' }]));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value[0]).toEqual({ name: 'X', code: 'y()' });
  });

  it('rejects an unsupported schemaVersion', () => {
    const res = parseScriptsImport(
      JSON.stringify({ schemaVersion: 99, scripts: [{ name: 'a', code: 'b' }] })
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('schemaVersion');
  });

  it('reports the offending item with an index', () => {
    const res = parseScriptsImport(
      JSON.stringify({
        scripts: [
          { name: 'ok', code: 'x' },
          { name: '', code: 'y' },
        ],
      })
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('scripts[1].name');
  });

  it('rejects bad JSON and content without a scripts array', () => {
    expect(parseScriptsImport('{not json').ok).toBe(false);
    expect(parseScriptsImport(JSON.stringify({ foo: 1 })).ok).toBe(false);
  });
});

describe('importConflicts', () => {
  it('detects a conflict by id or name', () => {
    expect(importConflicts(sample, { id: 'scr_1', name: 'whatever', code: 'x' })).toBe(true);
    expect(importConflicts(sample, { name: 'A', code: 'x' })).toBe(true);
    expect(importConflicts(sample, { name: 'New', code: 'x' })).toBe(false);
  });
});

describe('applyScriptImport', () => {
  it('overwrite mode replaces a matching id and keeps createdAt', () => {
    const next = applyScriptImport(
      sample,
      [{ id: 'scr_1', name: 'A renamed', code: 'new()' }],
      'overwrite',
      999
    );
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      id: 'scr_1',
      name: 'A renamed',
      code: 'new()',
      createdAt: 1,
      updatedAt: 999,
    });
  });

  it('overwrite mode adds non-matching scripts', () => {
    const next = applyScriptImport(sample, [{ name: 'B', code: 'b()' }], 'overwrite', 999);
    expect(next).toHaveLength(2);
    expect(next.map((s) => s.name)).toContain('B');
  });

  it('keep-both mode never overwrites and de-duplicates names', () => {
    const next = applyScriptImport(
      sample,
      [{ id: 'scr_1', name: 'A', code: 'x' }],
      'keep-both',
      999
    );
    expect(next).toHaveLength(2);
    expect(next[0]!.id).toBe('scr_1'); // original untouched
    expect(next[1]!.name).toBe('A (2)'); // renamed copy
    expect(next[1]!.id).not.toBe('scr_1');
  });

  it('uniqueName returns the base when free, else the first free “base (n)”', () => {
    expect(uniqueName('Flow', new Set())).toBe('Flow');
    expect(uniqueName('Flow', new Set(['Flow']))).toBe('Flow (2)');
    expect(uniqueName('Flow', new Set(['Flow', 'Flow (2)', 'Flow (3)']))).toBe('Flow (4)');
  });

  it('uniqueName matches case-insensitively but keeps the base casing', () => {
    // A case-only clash still gets a suffix (so "login" next to "Login" is disambiguated).
    expect(uniqueName('login', new Set(['Login']))).toBe('login (2)');
    expect(uniqueName('FLOW', new Set(['flow', 'Flow (2)']))).toBe('FLOW (3)');
  });

  it('reorderScripts moves an item and leaves the array otherwise intact', () => {
    const list: SavedScript[] = ['a', 'b', 'c', 'd'].map((n) => ({
      id: `scr_${n}`,
      name: n,
      code: '',
      createdAt: 1,
      updatedAt: 1,
    }));
    // Move down: a,b,c,d → b,c,a,d (drop 'a' onto index 2).
    expect(reorderScripts(list, 0, 2).map((s) => s.name)).toEqual(['b', 'c', 'a', 'd']);
    // Move up: a,b,c,d → d,a,b,c (drop 'd' onto index 0).
    expect(reorderScripts(list, 3, 0).map((s) => s.name)).toEqual(['d', 'a', 'b', 'c']);
    // No-op and out-of-range are returned unchanged (same reference).
    expect(reorderScripts(list, 1, 1)).toBe(list);
    expect(reorderScripts(list, 9, 0)).toBe(list);
  });
});
