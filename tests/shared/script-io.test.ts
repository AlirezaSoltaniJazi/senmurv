import { describe, expect, it } from 'vitest';
import {
  applyScriptImport,
  buildScriptTree,
  deleteFolder,
  filterScriptTree,
  hasChildren,
  importConflicts,
  matchesScriptQuery,
  moveScriptBefore,
  nestScript,
  newFolder,
  normalizeScripts,
  parseScriptsImport,
  reorderScripts,
  serializeScripts,
  ungroupScript,
  uniqueName,
} from '@/shared/script-io';
import type { SavedScript } from '@/shared/types';

/** Compact factories for grouping tests. */
function mk(id: string, parentId?: string): SavedScript {
  return { id, name: id, code: '', createdAt: 0, updatedAt: 0, ...(parentId ? { parentId } : {}) };
}
function fld(id: string): SavedScript {
  return { id, name: id, code: '', createdAt: 0, updatedAt: 0, isFolder: true };
}
const ids = (list: SavedScript[]): string[] => list.map((s) => s.id);

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

  it('round-trips a folder and its child, preserving isFolder/parentId', () => {
    const withFolder: SavedScript[] = [
      { id: 'fld_1', name: 'Auth', code: '', isFolder: true, createdAt: 1, updatedAt: 2 },
      { id: 'scr_2', name: 'Login', code: 'x()', parentId: 'fld_1', createdAt: 1, updatedAt: 2 },
    ];
    const res = parseScriptsImport(serializeScripts(withFolder));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toHaveLength(2);
    expect(res.value[0]).toMatchObject({ id: 'fld_1', name: 'Auth', isFolder: true });
    expect(res.value[0]!.parentId).toBeUndefined();
    expect(res.value[1]).toMatchObject({ id: 'scr_2', name: 'Login', parentId: 'fld_1' });
    expect(res.value[1]!.isFolder).toBeUndefined();
  });
});

describe('folder grouping', () => {
  it('newFolder makes a folder', () => {
    const f = newFolder('Auth', 100);
    expect(f.isFolder).toBe(true);
    expect(f.name).toBe('Auth');
    expect(f.code).toBe('');
  });

  it('buildScriptTree groups scripts under a folder; plain scripts stay top-level', () => {
    const list = [fld('F'), mk('a', 'F'), mk('b', 'F'), mk('c')];
    const tree = buildScriptTree(list);
    expect(tree.map((g) => g.parent.id)).toEqual(['F', 'c']);
    expect(ids(tree[0]!.children)).toEqual(['a', 'b']);
    expect(tree[1]!.children).toEqual([]); // a top-level script never has children
  });

  it('treats a parentId that is missing or not a folder as top-level', () => {
    expect(buildScriptTree([mk('x', 'gone')]).map((g) => g.parent.id)).toEqual(['x']);
    // parentId pointing at a normal script (not a folder) → x is top-level.
    expect(buildScriptTree([mk('p'), mk('x', 'p')]).map((g) => g.parent.id)).toEqual(['p', 'x']);
  });

  it('nestScript moves a script into a folder (drop on the folder or a script inside it)', () => {
    const onFolder = nestScript([fld('F'), mk('a')], 'a', 'F');
    expect(onFolder.find((s) => s.id === 'a')?.parentId).toBe('F');
    expect(ids(onFolder)).toEqual(['F', 'a']);
    // Dropping onto a script already inside F nests into F too.
    const onChild = nestScript([fld('F'), mk('a', 'F'), mk('b')], 'b', 'a');
    expect(onChild.find((s) => s.id === 'b')?.parentId).toBe('F');
  });

  it('nestScript refuses to nest a folder, or to nest onto a top-level script', () => {
    const list = [fld('F'), fld('G'), mk('a')];
    expect(nestScript(list, 'F', 'G')).toBe(list); // a folder can't be nested
    expect(nestScript([mk('a'), mk('b')], 'a', 'b')).toEqual([mk('a'), mk('b')]); // no folder → no-op
  });

  it('ungroupScript moves a script out of its folder', () => {
    const next = ungroupScript([fld('F'), mk('a', 'F')], 'a');
    expect(next.find((s) => s.id === 'a')?.parentId).toBeUndefined();
    expect(buildScriptTree(next).map((g) => g.parent.id)).toEqual(['F', 'a']);
  });

  it('deleteFolder removes the folder and frees its scripts to the top level', () => {
    const next = deleteFolder([fld('F'), mk('a', 'F'), mk('b', 'F'), mk('c')], 'F');
    expect(next.some((s) => s.id === 'F')).toBe(false);
    expect(next.every((s) => s.parentId === undefined)).toBe(true);
    expect(ids(next)).toEqual(['a', 'b', 'c']);
  });

  it('moveScriptBefore reorders same-level items and no-ops across levels', () => {
    const list = [fld('F'), mk('a', 'F'), mk('c')];
    // Reorder top-level: folder F before top-level script c → move c before F.
    expect(ids(moveScriptBefore(list, 'c', 'F'))).toEqual(['c', 'F', 'a']);
    // Reorder children within a folder.
    const kids = [fld('F'), mk('a', 'F'), mk('b', 'F')];
    expect(ids(moveScriptBefore(kids, 'b', 'a'))).toEqual(['F', 'b', 'a']);
    // Cross-level (child vs top-level) is a no-op.
    expect(moveScriptBefore(list, 'a', 'c')).toBe(list);
  });

  it('normalizeScripts and hasChildren', () => {
    expect(ids(normalizeScripts([fld('F'), mk('c'), mk('a', 'F')]))).toEqual(['F', 'a', 'c']);
    expect(hasChildren([fld('F'), mk('a', 'F')], 'F')).toBe(true);
    expect(hasChildren([fld('F')], 'F')).toBe(false);
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

  it('overwrite mode copies isFolder/parentId onto the merged record', () => {
    const next = applyScriptImport(
      sample,
      [{ id: 'fld_1', name: 'Auth', code: '', isFolder: true }],
      'overwrite',
      999
    );
    const folder = next.find((s) => s.id === 'fld_1');
    expect(folder).toMatchObject({ isFolder: true });
    expect(folder?.parentId).toBeUndefined();
  });

  it('keep-both re-groups a folder and its child under fresh, remapped ids', () => {
    const next = applyScriptImport(
      [],
      [
        { id: 'fld_1', name: 'Auth', code: '', isFolder: true },
        { id: 'scr_2', name: 'Login', code: 'x()', parentId: 'fld_1' },
      ],
      'keep-both',
      999
    );
    expect(next).toHaveLength(2);
    const folder = next.find((s) => s.isFolder === true);
    const child = next.find((s) => s.isFolder !== true);
    expect(folder).toBeDefined();
    expect(child).toBeDefined();
    expect(folder!.id).not.toBe('fld_1'); // fresh id
    expect(child!.id).not.toBe('scr_2'); // fresh id
    expect(child!.parentId).toBe(folder!.id); // remapped, still grouped
  });

  it('keep-both degrades a child re-imported without its folder to top-level', () => {
    const next = applyScriptImport(
      [],
      [{ id: 'scr_2', name: 'Login', code: 'x()', parentId: 'fld_missing' }],
      'keep-both',
      999
    );
    expect(next).toHaveLength(1);
    expect(next[0]!.parentId).toBeUndefined();
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

describe('matchesScriptQuery', () => {
  it('is case-insensitive, blank matches everything, and matches the name only', () => {
    expect(matchesScriptQuery('Login flow', '')).toBe(true);
    expect(matchesScriptQuery('Login flow', '   ')).toBe(true);
    expect(matchesScriptQuery('Login flow', 'LOGIN')).toBe(true);
    expect(matchesScriptQuery('Login flow', 'flow')).toBe(true);
    expect(matchesScriptQuery('Login flow', 'nope')).toBe(false);
  });
});

describe('filterScriptTree', () => {
  const tree = buildScriptTree([fld('F'), mk('alpha', 'F'), mk('beta', 'F'), mk('gamma')]);

  it('returns the tree unchanged for a blank query', () => {
    expect(filterScriptTree(tree, '')).toBe(tree);
  });

  it('keeps a folder and ALL its children when the folder name matches', () => {
    const filtered = filterScriptTree(tree, 'f');
    expect(filtered.map((g) => g.parent.id)).toEqual(['F']);
    expect(ids(filtered[0]!.children)).toEqual(['alpha', 'beta']);
  });

  it('keeps a folder but ONLY the matching children when a child name matches', () => {
    const filtered = filterScriptTree(tree, 'alpha');
    expect(filtered.map((g) => g.parent.id)).toEqual(['F']);
    expect(ids(filtered[0]!.children)).toEqual(['alpha']);
  });

  it('drops a folder whose name and every child fail to match', () => {
    const other = buildScriptTree([fld('G'), mk('x', 'G')]);
    expect(filterScriptTree(other, 'zzz')).toEqual([]);
  });

  it('keeps or drops a top-level script on its own name match', () => {
    expect(filterScriptTree(tree, 'gamma').map((g) => g.parent.id)).toEqual(['gamma']);
    expect(filterScriptTree(tree, 'nope')).toEqual([]);
  });
});
