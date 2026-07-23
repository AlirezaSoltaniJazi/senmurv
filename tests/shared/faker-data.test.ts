import { beforeAll, describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from '@/shared/constants';
import { ensureFaker, generatePhone, generateTestData } from '@/shared/faker-data';
import type { GeneratedData } from '@/shared/types';

// Lazy per-locale loading means the cache must be primed before the synchronous
// generators run; load every supported locale once up front.
beforeAll(async () => {
  await Promise.all(SUPPORTED_LOCALES.map((l) => ensureFaker(l)));
});

const REQUIRED_FIELDS: (keyof GeneratedData)[] = [
  'firstName',
  'lastName',
  'phone',
  'address',
  'postalCode',
  'email',
  'dateOfBirth',
];

describe('generateTestData', () => {
  it('returns all fields as non-empty strings for the default locale', () => {
    const data = generateTestData();
    for (const field of REQUIRED_FIELDS) {
      expect(typeof data[field]).toBe('string');
      expect(data[field].length).toBeGreaterThan(0);
    }
  });

  for (const locale of SUPPORTED_LOCALES) {
    it(`returns complete data for locale ${locale}`, () => {
      const data = generateTestData(locale);
      for (const field of REQUIRED_FIELDS) {
        expect(data[field], `${locale}.${field}`).toBeTruthy();
      }
      expect(data.email).toContain('@');
    });
  }

  it('honours the phoneWithCode option', () => {
    expect(generateTestData('en_GB', { phoneWithCode: true }).phone.startsWith('+44')).toBe(true);
    expect(generateTestData('en_GB', { phoneWithCode: false }).phone.startsWith('+')).toBe(false);
  });
});

describe('generatePhone', () => {
  it('prepends the locale dial code when requested', () => {
    expect(generatePhone('en_GB', true).startsWith('+44')).toBe(true);
    expect(generatePhone('en_US', true).startsWith('+1')).toBe(true);
    expect(generatePhone('de', true).startsWith('+49')).toBe(true);
  });

  it('returns national format without a code', () => {
    expect(generatePhone('en_GB', false).startsWith('+')).toBe(false);
  });

  it('generates valid UK mobiles (11 national digits, 07[4/5/7/8/9] prefix)', () => {
    for (let i = 0; i < 40; i += 1) {
      expect(generatePhone('en_GB', false)).toMatch(/^07[45789]\d{8}$/);
      expect(generatePhone('en_GB', true)).toMatch(/^\+44 7[45789]\d{8}$/);
    }
  });

  it('generates valid US mobiles (NANP: area & exchange start 2-9, 10 digits)', () => {
    for (let i = 0; i < 40; i += 1) {
      expect(generatePhone('en_US', false)).toMatch(/^[2-9]\d{2}[2-9]\d{6}$/);
    }
  });

  it('produces digits-only mobile numbers for every locale (no landline text)', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const national = generatePhone(locale, false);
      expect(national, locale).toMatch(/^\d+$/);
      expect(national.length, locale).toBeGreaterThanOrEqual(8);
    }
  });
});
