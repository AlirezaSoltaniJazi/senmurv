import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from '@/shared/constants';
import { generateTestData } from '@/shared/faker-data';
import type { GeneratedData } from '@/shared/types';

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
});
