import { describe, expect, it } from 'vitest';
import {
  activeValue,
  findProfileFor,
  newProfile,
  parseValues,
  profileFromEntry,
  profilesFor,
  profilesForAny,
  upsertProfile,
  validateProfile,
  valuesToText,
  withCandidate,
  wrapValue,
} from '@/shared/profiles';
import type { ProfileTarget, ValueProfile } from '@/shared/types';

function mk(over: Partial<ValueProfile> = {}): ValueProfile {
  return {
    id: 'prof_1',
    name: 'Locale',
    target: 'local',
    key: 'localeKey',
    values: ['en_GB', 'de_DE'],
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

describe('wrapValue', () => {
  it('returns the raw value when nothing wraps it', () => {
    expect(wrapValue({}, 'en_GB')).toBe('en_GB');
  });

  it('applies prefix and suffix (e.g. JSON quoting)', () => {
    expect(wrapValue({ prefix: '"', suffix: '"' }, 'en_GB')).toBe('"en_GB"');
    expect(wrapValue({ prefix: 'v1:' }, 'x')).toBe('v1:x');
    expect(wrapValue({ suffix: '!' }, 'x')).toBe('x!');
  });
});

describe('newProfile', () => {
  it('creates a blank, enabled profile for the target', () => {
    const p = newProfile('cookie', 1234);
    expect(p.target).toBe('cookie');
    expect(p.enabled).toBe(true);
    expect(p.values).toEqual([]);
    expect(p.name).toBe('');
    expect(p.createdAt).toBe(1234);
    expect(p.id.startsWith('prof_')).toBe(true);
  });
});

describe('parseValues / valuesToText', () => {
  it('splits on newlines, trims, and drops blanks', () => {
    expect(parseValues('en_GB\n  de_DE  \n\n\nfr_FR\n')).toEqual(['en_GB', 'de_DE', 'fr_FR']);
    expect(parseValues('   ')).toEqual([]);
  });

  it('round-trips through the textarea form', () => {
    const values = ['a', 'b', 'c'];
    expect(parseValues(valuesToText(values))).toEqual(values);
  });
});

describe('validateProfile', () => {
  it('rejects an empty name, key, or value list', () => {
    expect(validateProfile(mk({ name: '  ' })).ok).toBe(false);
    expect(validateProfile(mk({ key: '' })).ok).toBe(false);
    expect(validateProfile(mk({ values: [] })).ok).toBe(false);
  });

  it('names the right field for a cookie vs a storage profile', () => {
    const cookie = validateProfile(mk({ target: 'cookie', key: '' }));
    if (!cookie.ok) expect(cookie.error).toContain('cookie name');
    const storage = validateProfile(mk({ key: '' }));
    if (!storage.ok) expect(storage.error).toContain('storage key');
  });

  it('trims the name and key on success', () => {
    const res = validateProfile(mk({ name: '  Locale  ', key: '  localeKey  ' }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.name).toBe('Locale');
      expect(res.value.key).toBe('localeKey');
    }
  });

  it('keeps a path only for cookie profiles', () => {
    const cookie = validateProfile(mk({ target: 'cookie', path: ' /api ' }));
    if (cookie.ok) expect(cookie.value.path).toBe('/api');
    // A storage profile has no path concept — it is dropped, not stored empty.
    const storage = validateProfile(mk({ target: 'local', path: '/api' }));
    if (storage.ok) expect(storage.value.path).toBeUndefined();
  });
});

describe('profilesFor', () => {
  it('filters to one target, preserving order', () => {
    const list = [
      mk({ id: 'a', target: 'local' }),
      mk({ id: 'b', target: 'cookie' }),
      mk({ id: 'c', target: 'session' }),
      mk({ id: 'd', target: 'local' }),
    ];
    expect(profilesFor(list, 'local').map((p) => p.id)).toEqual(['a', 'd']);
    expect(profilesFor(list, 'cookie').map((p) => p.id)).toEqual(['b']);
    expect(profilesFor(list, 'nope' as ProfileTarget)).toEqual([]);
  });
});

describe('profilesForAny', () => {
  it('lists profiles across several targets, preserving order', () => {
    const list = [
      mk({ id: 'a', target: 'local' }),
      mk({ id: 'b', target: 'cookie' }),
      mk({ id: 'c', target: 'session' }),
    ];
    // The Storage tab's Profiles view shows local + session together.
    expect(profilesForAny(list, ['local', 'session']).map((p) => p.id)).toEqual(['a', 'c']);
    expect(profilesForAny(list, ['cookie']).map((p) => p.id)).toEqual(['b']);
    expect(profilesForAny(list, [])).toEqual([]);
  });
});

describe('activeValue', () => {
  it('matches the live value against the WRAPPED candidates', () => {
    const plain = mk();
    expect(activeValue(plain, 'de_DE')).toBe('de_DE');
    expect(activeValue(plain, 'zz')).toBeNull();
    expect(activeValue(plain, null)).toBeNull();

    // With wrapping, the store holds `"de_DE"` — the chip for de_DE is still active.
    const wrapped = mk({ prefix: '"', suffix: '"' });
    expect(activeValue(wrapped, '"de_DE"')).toBe('de_DE');
    expect(activeValue(wrapped, 'de_DE')).toBeNull();
  });
});

describe('profileFromEntry ("+ Profile" on a row)', () => {
  it('seeds name/key from the entry and its live value as the first candidate', () => {
    const p = profileFromEntry('local', 'localeKey', 'en_GB', 7);
    expect(p.target).toBe('local');
    expect(p.name).toBe('localeKey');
    expect(p.key).toBe('localeKey');
    expect(p.values).toEqual(['en_GB']);
    expect(p.enabled).toBe(true);
    expect(p.createdAt).toBe(7);
  });

  it('leaves the candidate list empty when the live value is blank', () => {
    // An empty candidate would be unusable — better to let the user type one.
    expect(profileFromEntry('cookie', 'c', '', 1).values).toEqual([]);
  });

  it('keeps a non-root cookie path, and never sets a path for storage', () => {
    expect(profileFromEntry('cookie', 'c', 'v', 1, '/api/admin/').path).toBe('/api/admin/');
    // "/" is the default, so it is not worth storing.
    expect(profileFromEntry('cookie', 'c', 'v', 1, '/').path).toBeUndefined();
    expect(profileFromEntry('local', 'k', 'v', 1, '/api').path).toBeUndefined();
  });
});

describe('findProfileFor', () => {
  it('finds a profile driving the same key AND target', () => {
    const list = [
      mk({ id: 'a', target: 'local', key: 'k' }),
      mk({ id: 'b', target: 'cookie', key: 'k' }),
    ];
    expect(findProfileFor(list, 'local', 'k')?.id).toBe('a');
    expect(findProfileFor(list, 'cookie', 'k')?.id).toBe('b');
    expect(findProfileFor(list, 'session', 'k')).toBeNull();
    expect(findProfileFor(list, 'local', 'other')).toBeNull();
  });
});

describe('withCandidate', () => {
  it('appends a new value', () => {
    const next = withCandidate(mk({ values: ['a'] }), 'b');
    expect(next.values).toEqual(['a', 'b']);
  });

  it('is a no-op for a duplicate or blank value (same object back)', () => {
    const p = mk({ values: ['a'] });
    expect(withCandidate(p, 'a')).toBe(p);
    expect(withCandidate(p, '')).toBe(p);
  });
});

describe('upsertProfile', () => {
  it('appends a new profile and stamps updatedAt', () => {
    const next = upsertProfile([], mk(), 99);
    expect(next).toHaveLength(1);
    expect(next[0]!.updatedAt).toBe(99);
  });

  it('replaces an existing profile by id, leaving others intact', () => {
    const list = [mk({ id: 'a' }), mk({ id: 'b', name: 'Keep' })];
    const next = upsertProfile(list, mk({ id: 'a', name: 'Changed' }), 50);
    expect(next).toHaveLength(2);
    expect(next[0]!.name).toBe('Changed');
    expect(next[0]!.updatedAt).toBe(50);
    expect(next[1]!.name).toBe('Keep');
  });
});
