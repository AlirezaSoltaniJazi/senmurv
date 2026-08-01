import { describe, expect, it } from 'vitest';
import {
  addParam,
  buildUrl,
  findIdParam,
  findParam,
  parseUrl,
  removeParam,
  setParam,
  updateParam,
} from '@/shared/tools/query-params';
import type { QueryParam } from '@/shared/tools/query-params';

const DYNAMICS =
  'https://fmc-cms-sandbox.crm4.dynamics.com/main.aspx?appid=ad4337d9-c78a-ee11-8179-000d3a2ccd7f&pagetype=entityrecord&etn=contact&id=b60383c4-a5f6-f011-8406-000d3abc5d76';

describe('parseUrl', () => {
  it('splits a real Dynamics record URL into base + ordered params', () => {
    const res = parseUrl(DYNAMICS);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.base).toBe('https://fmc-cms-sandbox.crm4.dynamics.com/main.aspx');
    expect(res.value.params.map((p) => p.name)).toEqual(['appid', 'pagetype', 'etn', 'id']);
    expect(res.value.params[3]!.value).toBe('b60383c4-a5f6-f011-8406-000d3abc5d76');
  });

  it('keeps the hash and excludes it from the base', () => {
    const res = parseUrl('https://x.test/a/b?q=1#frag');
    if (!res.ok) return;
    expect(res.value.base).toBe('https://x.test/a/b');
    expect(res.value.hash).toBe('#frag');
  });

  it('preserves duplicate names in order', () => {
    const res = parseUrl('https://x.test/?tag=a&tag=b&other=1');
    if (!res.ok) return;
    expect(res.value.params).toEqual([
      { name: 'tag', value: 'a' },
      { name: 'tag', value: 'b' },
      { name: 'other', value: '1' },
    ]);
  });

  it('percent-decodes values', () => {
    const res = parseUrl('https://x.test/?q=a%20b%26c');
    if (!res.ok) return;
    expect(res.value.params[0]!.value).toBe('a b&c');
  });

  it('reports a blank or malformed URL rather than throwing', () => {
    expect(parseUrl('   ').ok).toBe(false);
    const bad = parseUrl('not a url');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('not a url');
  });

  it('handles a URL with no query string at all', () => {
    const res = parseUrl('https://x.test/page');
    if (!res.ok) return;
    expect(res.value.params).toEqual([]);
    expect(res.value.hash).toBe('');
  });
});

describe('findParam / findIdParam', () => {
  const params: QueryParam[] = [
    { name: 'ETN', value: 'contact' },
    { name: 'ID', value: 'GUID-1' },
  ];

  it('matches case-insensitively', () => {
    expect(findParam(params, 'etn')).toBe('contact');
    expect(findParam(params, 'ETN')).toBe('contact');
    expect(findIdParam(params)?.value).toBe('GUID-1');
  });

  it('returns null for an absent or blank name', () => {
    expect(findParam(params, 'nope')).toBeNull();
    expect(findParam(params, '  ')).toBeNull();
    expect(findIdParam([{ name: 'other', value: 'x' }])).toBeNull();
  });

  it('finds the FIRST match when a name repeats', () => {
    expect(
      findParam(
        [
          { name: 'id', value: 'a' },
          { name: 'id', value: 'b' },
        ],
        'id'
      )
    ).toBe('a');
  });
});

describe('buildUrl', () => {
  it('round-trips parseUrl for a real URL', () => {
    const parsed = parseUrl(DYNAMICS);
    if (!parsed.ok) return;
    const { base, params, hash } = parsed.value;
    expect(buildUrl(base, params, hash)).toBe(DYNAMICS);
  });

  it('drops rows with a blank name but KEEPS a blank value', () => {
    const built = buildUrl('https://x.test/p', [
      { name: 'a', value: '1' },
      { name: '   ', value: 'orphan' },
      { name: 'flag', value: '' },
    ]);
    expect(built).toBe('https://x.test/p?a=1&flag=');
    expect(built).not.toContain('orphan');
  });

  it('omits the ? entirely when nothing survives', () => {
    expect(buildUrl('https://x.test/p', [{ name: '', value: 'x' }])).toBe('https://x.test/p');
    expect(buildUrl('https://x.test/p', [])).toBe('https://x.test/p');
  });

  it('re-encodes values that need it', () => {
    expect(buildUrl('https://x.test/p', [{ name: 'q', value: 'a b&c' }])).toBe(
      'https://x.test/p?q=a+b%26c'
    );
  });

  it('appends the hash last', () => {
    expect(buildUrl('https://x.test/p', [{ name: 'a', value: '1' }], '#top')).toBe(
      'https://x.test/p?a=1#top'
    );
  });
});

describe('row helpers are immutable', () => {
  const base: QueryParam[] = [
    { name: 'a', value: '1' },
    { name: 'b', value: '2' },
  ];

  it('setParam replaces by name (case-insensitive) without mutating', () => {
    const next = setParam([{ name: 'ID', value: 'old' }], 'id', 'new');
    expect(next[0]!.value).toBe('new');
    expect(next[0]!.name).toBe('ID'); // original casing preserved
  });

  it('addParam appends a blank row', () => {
    const next = addParam(base);
    expect(next).toHaveLength(3);
    expect(next[2]).toEqual({ name: '', value: '' });
    expect(base).toHaveLength(2); // untouched
  });

  it('removeParam drops one row and ignores an out-of-range index', () => {
    expect(removeParam(base, 0).map((p) => p.name)).toEqual(['b']);
    expect(removeParam(base, 9)).toEqual(base);
    expect(removeParam(base, -1)).toEqual(base);
    expect(base).toHaveLength(2);
  });

  it('updateParam patches one row only', () => {
    const next = updateParam(base, 1, { value: 'changed' });
    expect(next[1]).toEqual({ name: 'b', value: 'changed' });
    expect(next[0]).toEqual({ name: 'a', value: '1' });
    expect(base[1]!.value).toBe('2');
  });
});

describe('the record-jump flow end to end', () => {
  it('swaps the id and rebuilds the same URL shape', () => {
    // The everyday use: same app/entity, different record.
    const parsed = parseUrl(DYNAMICS);
    if (!parsed.ok) return;
    const swapped = setParam(parsed.value.params, 'id', '51883902-6715-f011-998b-000d3abdf038');
    const built = buildUrl(parsed.value.base, swapped, parsed.value.hash);
    expect(built).toBe(
      'https://fmc-cms-sandbox.crm4.dynamics.com/main.aspx?appid=ad4337d9-c78a-ee11-8179-000d3a2ccd7f&pagetype=entityrecord&etn=contact&id=51883902-6715-f011-998b-000d3abdf038'
    );
  });
});
