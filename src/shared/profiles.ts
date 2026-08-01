import type { ProfileTarget, Result, ValueProfile } from '@/shared/types';
import { newId } from '@/utils/id';

/**
 * Pure logic for value profiles — the saved "switchers" that flip one cookie or
 * storage key between preset values. Chrome-free and DOM-free so it unit-tests
 * cleanly; the actual reads/writes live in the Cookies / Storage tabs.
 */

/** Human labels for the store a profile drives. */
export const PROFILE_TARGET_LABELS: Record<ProfileTarget, string> = {
  cookie: 'Cookie',
  local: 'localStorage',
  session: 'sessionStorage',
};

/**
 * The value actually written for `raw`, with the profile's prefix/suffix applied.
 * Wrapping exists so a profile can drive a value that must be quoted or embedded
 * — e.g. prefix `"` + suffix `"` to store a JSON string.
 */
export function wrapValue(profile: Pick<ValueProfile, 'prefix' | 'suffix'>, raw: string): string {
  return `${profile.prefix ?? ''}${raw}${profile.suffix ?? ''}`;
}

/** A blank profile for `target`, ready for the editor. */
export function newProfile(target: ProfileTarget, now: number): ValueProfile {
  return {
    id: newId('prof_'),
    name: '',
    target,
    key: '',
    values: [],
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

/** Parse the editor's textarea (one candidate value per line, blanks dropped). */
export function parseValues(text: string): string[] {
  return text
    .split('\n')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

/** Render candidate values back into the editor's textarea. */
export function valuesToText(values: string[]): string {
  return values.join('\n');
}

/**
 * Validate a draft profile. Returns the cleaned profile (trimmed name/key/path)
 * or the first problem, so the editor can block Save and say why.
 */
export function validateProfile(draft: ValueProfile): Result<ValueProfile> {
  const name = draft.name.trim();
  if (name === '') return { ok: false, error: 'Give the profile a name.' };
  const key = draft.key.trim();
  if (key === '') {
    return {
      ok: false,
      error: draft.target === 'cookie' ? 'Enter a cookie name.' : 'Enter a storage key.',
    };
  }
  if (draft.values.length === 0) {
    return { ok: false, error: 'Add at least one candidate value (one per line).' };
  }
  const clean: ValueProfile = { ...draft, name, key, values: [...draft.values] };
  const path = draft.path?.trim();
  if (draft.target === 'cookie' && path) clean.path = path;
  else delete clean.path;
  return { ok: true, value: clean };
}

/** The profiles that drive `target`, in saved order. */
export function profilesFor(profiles: ValueProfile[], target: ProfileTarget): ValueProfile[] {
  return profiles.filter((p) => p.target === target);
}

/**
 * The profiles driving ANY of `targets`, in saved order — the Storage tab's
 * Profiles view lists localStorage and sessionStorage profiles together.
 */
export function profilesForAny(
  profiles: ValueProfile[],
  targets: readonly ProfileTarget[]
): ValueProfile[] {
  return profiles.filter((p) => targets.includes(p.target));
}

/**
 * Which candidate value is currently live, or null when the store holds something
 * else (or nothing). Compares against the WRAPPED form, since that is what was
 * written — so a prefix/suffix profile still highlights its active chip.
 */
export function activeValue(profile: ValueProfile, current: string | null): string | null {
  if (current === null) return null;
  return profile.values.find((v) => wrapValue(profile, v) === current) ?? null;
}

/**
 * Seed a profile from a cookie / storage entry you are looking at, so "add to
 * profile" starts from the real key and its live value instead of a blank form.
 */
export function profileFromEntry(
  target: ProfileTarget,
  key: string,
  currentValue: string,
  now: number,
  path?: string
): ValueProfile {
  const seed = newProfile(target, now);
  seed.name = key;
  seed.key = key;
  // A blank live value would become an unusable empty candidate.
  seed.values = currentValue === '' ? [] : [currentValue];
  if (target === 'cookie' && path && path !== '/') seed.path = path;
  return seed;
}

/**
 * An existing profile already driving `key` for this target, or null. Lets "add
 * to profile" extend the profile you already have instead of silently making a
 * second one for the same key.
 */
export function findProfileFor(
  profiles: ValueProfile[],
  target: ProfileTarget,
  key: string
): ValueProfile | null {
  return profiles.find((p) => p.target === target && p.key === key) ?? null;
}

/** `profile` with `value` appended as a candidate, unless it is blank or already there. */
export function withCandidate(profile: ValueProfile, value: string): ValueProfile {
  if (value === '' || profile.values.includes(value)) return profile;
  return { ...profile, values: [...profile.values, value] };
}

/** Insert or replace `profile` by id, stamping `updatedAt`; returns the new list. */
export function upsertProfile(
  profiles: ValueProfile[],
  profile: ValueProfile,
  now: number
): ValueProfile[] {
  const next = { ...profile, updatedAt: now };
  const at = profiles.findIndex((p) => p.id === profile.id);
  if (at === -1) return [...profiles, next];
  return profiles.map((p) => (p.id === profile.id ? next : p));
}
