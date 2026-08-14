import { beforeAll, describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from '@/shared/constants';
import {
  ensureFaker,
  generatePhone,
  generatePhoneIntl,
  generateRandomNumber,
  generateTestData,
  RANDOM_NUMBER_LENGTH_MAX,
} from '@/shared/faker-data';
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
  'phoneAlt',
  'address',
  'city',
  'postalCode',
  'region',
  'email',
  'dateOfBirth',
  'uuid',
  'randomNumber',
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

  it('generates a well-formed UUID', () => {
    expect(generateTestData('en_GB').uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('phoneAlt carries the same digits as phone, in the opposite format', () => {
    const withCode = generateTestData('en_GB', { phoneWithCode: true });
    expect(withCode.phone.startsWith('+44')).toBe(true);
    expect(withCode.phoneAlt.startsWith('+')).toBe(false);
    expect(withCode.phone.replace(/\D/g, '')).toBe(`44${withCode.phoneAlt.replace(/^0/, '')}`);

    const withoutCode = generateTestData('en_GB', { phoneWithCode: false });
    expect(withoutCode.phone.startsWith('+')).toBe(false);
    expect(withoutCode.phoneAlt.startsWith('+44')).toBe(true);
  });

  it('honours randomNumberLength and defaults to 5 digits', () => {
    expect(generateTestData('en_GB').randomNumber).toHaveLength(5);
    expect(generateTestData('en_GB', { randomNumberLength: 8 }).randomNumber).toHaveLength(8);
    expect(generateTestData('en_GB', { randomNumberLength: 1 }).randomNumber).toHaveLength(1);
  });
});

describe('generateRandomNumber', () => {
  it('defaults to 5 digits', () => {
    expect(generateRandomNumber('en_GB')).toMatch(/^\d{5}$/);
  });

  it('honours a custom length, including a single digit', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(generateRandomNumber('en_GB', 8)).toMatch(/^\d{8}$/);
    }
    expect(generateRandomNumber('en_GB', 1)).toMatch(/^\d$/);
  });

  it('never produces a leading zero above one digit (so the length always reads correctly)', () => {
    for (let i = 0; i < 40; i += 1) {
      expect(generateRandomNumber('en_GB', 6)).toMatch(/^[1-9]\d{5}$/);
    }
  });

  it('clamps length to 1..RANDOM_NUMBER_LENGTH_MAX', () => {
    expect(generateRandomNumber('en_GB', 0)).toHaveLength(1);
    expect(generateRandomNumber('en_GB', -5)).toHaveLength(1);
    expect(generateRandomNumber('en_GB', RANDOM_NUMBER_LENGTH_MAX + 50)).toHaveLength(
      RANDOM_NUMBER_LENGTH_MAX
    );
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

  it('generates valid German mobiles (015x are 12 digits, 016x/017x are 11)', () => {
    for (let i = 0; i < 80; i += 1) {
      const national = generatePhone('de', false);
      // 015x carry an 8-digit subscriber part (12 national digits); 016x/017x carry 7 (11).
      if (national.startsWith('015')) {
        expect(national, national).toMatch(/^015[127]\d{8}$/);
      } else {
        expect(national, national).toMatch(/^01(60|70|71|72|75)\d{7}$/);
      }
    }
  });

  it('never generates a Spanish 70x personal-numbering number', () => {
    for (let i = 0; i < 80; i += 1) {
      const national = generatePhone('es', false);
      expect(national, national).toMatch(/^(6\d{8}|7[1-9]\d{7})$/);
      expect(national.startsWith('70'), national).toBe(false);
    }
  });

  it('generatePhoneIntl gives a valid UK mobile NSN with no trunk 0 (+code-field form)', () => {
    for (let i = 0; i < 40; i += 1) {
      const nsn = generatePhoneIntl('en_GB');
      // Real assignable mobile prefixes (074/075/077/078/079) so a strict server-side
      // validator (libphonenumber is_valid_number) accepts it; no leading trunk 0.
      expect(nsn, nsn).toMatch(/^7[45789]\d{8}$/);
      expect(nsn.startsWith('0'), nsn).toBe(false);
    }
  });

  it('generatePhoneIntl strips the trunk 0 for other locales', () => {
    expect(generatePhoneIntl('de').startsWith('0')).toBe(false);
    expect(generatePhoneIntl('fr').startsWith('0')).toBe(false);
  });

  it('produces digits-only mobile numbers for every locale (no landline text)', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const national = generatePhone(locale, false);
      expect(national, locale).toMatch(/^\d+$/);
      expect(national.length, locale).toBeGreaterThanOrEqual(8);
    }
  });
});
