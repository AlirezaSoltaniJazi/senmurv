import { describe, expect, it } from 'vitest';
import { configForRegion, findRegion, REGIONS } from '@/shared/tools/region';

describe('REGIONS', () => {
  it('has presets with valid IANA timezones and BCP-47 locales', () => {
    expect(REGIONS.length).toBeGreaterThan(5);
    for (const r of REGIONS) {
      expect(r.timezone).toMatch(/^[A-Za-z]+\/[A-Za-z_]+$/);
      expect(r.locale).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
      expect(Math.abs(r.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(r.lon)).toBeLessThanOrEqual(180);
    }
  });

  it('has unique ids', () => {
    const ids = REGIONS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every timezone is one the runtime actually knows', () => {
    for (const r of REGIONS) {
      expect(() => new Intl.DateTimeFormat('en', { timeZone: r.timezone })).not.toThrow();
    }
  });
});

describe('findRegion', () => {
  it('resolves a known id and returns undefined otherwise', () => {
    expect(findRegion('fr')?.timezone).toBe('Europe/Paris');
    expect(findRegion('nope')).toBeUndefined();
  });
});

describe('configForRegion', () => {
  const fr = findRegion('fr')!;

  it('includes coords when geo is enabled', () => {
    expect(configForRegion(fr, true)).toEqual({
      timezone: 'Europe/Paris',
      locale: 'fr-FR',
      coords: { lat: fr.lat, lon: fr.lon },
    });
  });

  it('omits coords when geo is disabled', () => {
    expect(configForRegion(fr, false).coords).toBe(null);
  });
});
