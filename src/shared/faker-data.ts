import {
  fakerEN_GB,
  fakerEN_US,
  fakerPT_PT,
  fakerNL_BE,
  fakerNL,
  fakerDE_CH,
  fakerDE,
  fakerIT,
  fakerFR,
  fakerES,
  fakerNB_NO,
  fakerSV,
  fakerFI,
  fakerCS_CZ,
  fakerDE_AT,
  type Faker,
} from '@faker-js/faker';
import { DEFAULT_LOCALE } from '@/shared/constants';
import type { GeneratedData, Locale } from '@/shared/types';

const FAKERS: Record<Locale, Faker> = {
  en_GB: fakerEN_GB,
  en_US: fakerEN_US,
  pt_PT: fakerPT_PT,
  nl_BE: fakerNL_BE,
  nl: fakerNL,
  de_CH: fakerDE_CH,
  de: fakerDE,
  it: fakerIT,
  fr: fakerFR,
  es: fakerES,
  nb_NO: fakerNB_NO,
  sv: fakerSV,
  fi: fakerFI,
  cs_CZ: fakerCS_CZ,
  de_AT: fakerDE_AT,
};

/** International dialing code per locale (for the with/without-code phone option). */
export const DIAL_CODES: Record<Locale, string> = {
  en_GB: '+44',
  en_US: '+1',
  pt_PT: '+351',
  nl_BE: '+32',
  nl: '+31',
  de_CH: '+41',
  de: '+49',
  it: '+39',
  fr: '+33',
  es: '+34',
  nb_NO: '+47',
  sv: '+46',
  fi: '+358',
  cs_CZ: '+420',
  de_AT: '+43',
};

/** Resolve the faker instance for a locale (falls back to the default locale). */
export function getFaker(locale: Locale): Faker {
  return FAKERS[locale] ?? FAKERS[DEFAULT_LOCALE];
}

/**
 * A region-correct phone number. `withCode` prepends the locale's dialing code
 * (and drops the national trunk `0`); otherwise the national format is returned.
 */
export function generatePhone(locale: Locale, withCode = true): string {
  const national = getFaker(locale)
    .phone.number()
    .replace(/^\+\d+[\s-]*/, '') // strip any country code faker already emitted
    .trim();
  if (!withCode) return national;
  const code = DIAL_CODES[locale];
  return code ? `${code} ${national.replace(/^0/, '')}`.trim() : national;
}

/** Options controlling generated data. */
export interface TestDataOptions {
  phoneWithCode?: boolean;
}

/** Generate one set of locale-aware test data. */
export function generateTestData(
  locale: Locale = DEFAULT_LOCALE,
  options: TestDataOptions = {}
): GeneratedData {
  const faker = getFaker(locale);
  const sex = faker.person.sexType();
  const firstName = faker.person.firstName(sex);
  const lastName = faker.person.lastName(sex);

  return {
    firstName,
    lastName,
    phone: generatePhone(locale, options.phoneWithCode ?? true),
    address: faker.location.streetAddress(),
    postalCode: faker.location.zipCode(),
    email: faker.internet.email({ firstName, lastName }),
    dateOfBirth: faker.date.birthdate().toLocaleDateString('en-GB'),
  };
}
