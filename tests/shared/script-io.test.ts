import { describe, expect, it } from 'vitest';
import {
  applyScriptImport,
  importConflicts,
  parseScriptsImport,
  serializeScripts,
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
});
