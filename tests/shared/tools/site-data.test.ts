import { describe, expect, it } from 'vitest';
import {
  buildClearPlan,
  CLEAR_TYPES,
  describePlan,
  formatBytes,
  isSessionDestroying,
  normalizeOrigin,
  PRESET_BUST_CACHE,
  PRESET_FRESH_VISITOR,
} from '@/shared/tools/site-data';
import type { ClearTypeId } from '@/shared/types';

const ORIGIN = 'https://app.example.com/dashboard?x=1#frag';

describe('normalizeOrigin', () => {
  it('reduces a full URL to its origin', () => {
    expect(normalizeOrigin(ORIGIN)).toEqual({ ok: true, value: 'https://app.example.com' });
  });

  it('keeps a non-default port, which is part of the origin', () => {
    expect(normalizeOrigin('http://localhost:3000/x')).toEqual({
      ok: true,
      value: 'http://localhost:3000',
    });
  });

  it('allowlists by PROTOCOL, so non-web schemes are refused by construction', () => {
    // Deliberately not an `.origin === "null"` test: blob:/sandboxed origins
    // differ between Chrome and happy-dom, so that check would pass here and
    // behave differently in the browser.
    for (const url of ['chrome://extensions', 'file:///tmp/x.html', 'data:text/html,hi']) {
      expect(normalizeOrigin(url).ok).toBe(false);
    }
  });

  it('rejects a value that is not a URL at all', () => {
    expect(normalizeOrigin('').ok).toBe(false);
    expect(normalizeOrigin('not a url').ok).toBe(false);
  });
});

describe('buildClearPlan', () => {
  it('rejects an empty selection rather than silently doing nothing', () => {
    const plan = buildClearPlan(ORIGIN, []);
    expect(plan.ok).toBe(false);
  });

  it('rejects a type outside CLEAR_TYPES, so the injection can never see one', () => {
    const plan = buildClearPlan(ORIGIN, ['passwords' as ClearTypeId]);
    expect(plan.ok).toBe(false);
    expect(plan.ok === false && plan.error).toMatch(/passwords/);
  });

  it('refuses a page the tool must never act on', () => {
    expect(buildClearPlan('chrome://extensions', ['localStorage']).ok).toBe(false);
  });

  it('canonicalises order and drops duplicates', () => {
    const plan = buildClearPlan(ORIGIN, ['cookies', 'localStorage', 'cookies']);
    expect(plan.ok && plan.value.types).toEqual(['localStorage', 'cookies']);
  });

  it('scopes the plan to the exact origin, never a bare host', () => {
    const plan = buildClearPlan(ORIGIN, ['localStorage']);
    expect(plan.ok && plan.value.origin).toBe('https://app.example.com');
  });
});

describe('presets', () => {
  it('Bust cache never touches anything that signs you out', () => {
    expect(isSessionDestroying(PRESET_BUST_CACHE)).toBe(false);
    expect([...PRESET_BUST_CACHE]).toEqual(['cacheStorage', 'serviceWorkers']);
  });

  it('Fresh visitor covers every clearable type', () => {
    expect([...PRESET_FRESH_VISITOR]).toEqual([...CLEAR_TYPES]);
    expect(isSessionDestroying(PRESET_FRESH_VISITOR)).toBe(true);
  });
});

describe('describePlan — the last line of defence', () => {
  const describe_ = (types: ClearTypeId[]): string => {
    const plan = buildClearPlan(ORIGIN, types);
    if (!plan.ok) throw new Error(plan.error);
    return describePlan(plan.value);
  };

  it('names what will be cleared, and for which origin', () => {
    expect(describe_(['localStorage'])).toContain(
      'Clear Local storage for https://app.example.com.'
    );
  });

  it('warns VERBATIM that HttpOnly cookies survive', () => {
    expect(describe_(['cookies'])).toContain(
      'Cookies marked HttpOnly cannot be removed from the page and will be left behind'
    );
  });

  it('warns about being signed out only when that is true', () => {
    expect(describe_(['cookies'])).toContain('sign you out');
    expect(describe_(['cacheStorage'])).not.toContain('sign you out');
  });

  it('always states that the HTTP cache is untouched', () => {
    // The tool is named "Site data" precisely because it cannot do this; if the
    // sentence ever goes missing the tool starts over-promising.
    for (const types of [['cacheStorage'], ['cookies'], [...CLEAR_TYPES]] as ClearTypeId[][]) {
      expect(describe_(types)).toContain('HTTP cache is not touched');
    }
  });
});

describe('formatBytes', () => {
  it('formats across units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1024 * 1024 * 15)).toBe('15 MB');
    expect(formatBytes(1024 ** 3 * 2.5)).toBe('2.5 GB');
  });

  it('says "unknown" rather than inventing a number', () => {
    expect(formatBytes(null)).toBe('unknown');
    expect(formatBytes(Number.NaN)).toBe('unknown');
  });
});
