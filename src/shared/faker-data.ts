import {
  fakerEN_GB,
  fakerEN_US,
  fakerDE,
  fakerFR,
  fakerES,
  fakerIT,
  type Faker,
} from '@faker-js/faker';
import { DEFAULT_LOCALE } from '@/shared/constants';
import type { GeneratedData, Locale } from '@/shared/types';

const FAKERS: Record<Locale, Faker> = {
  en_GB: fakerEN_GB,
  en_US: fakerEN_US,
  de: fakerDE,
  fr: fakerFR,
  es: fakerES,
  it: fakerIT,
};

/** Resolve the faker instance for a locale (falls back to the default locale). */
export function getFaker(locale: Locale): Faker {
  return FAKERS[locale] ?? FAKERS[DEFAULT_LOCALE];
}

/** Generate one set of locale-aware test data. */
export function generateTestData(locale: Locale = DEFAULT_LOCALE): GeneratedData {
  const faker = getFaker(locale);
  const sex = faker.person.sexType();
  const firstName = faker.person.firstName(sex);
  const lastName = faker.person.lastName(sex);

  return {
    firstName,
    lastName,
    phone: faker.phone.number(),
    address: faker.location.streetAddress(),
    postalCode: faker.location.zipCode(),
    email: faker.internet.email({ firstName, lastName }),
    dateOfBirth: faker.date.birthdate().toLocaleDateString('en-GB'),
  };
}
