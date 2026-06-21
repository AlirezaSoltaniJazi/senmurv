import type { Faker } from '@faker-js/faker';
import { DEFAULT_LOCALE } from '@/shared/constants';
import type { GeneratedData, Locale } from '@/shared/types';

// Per-locale dynamic loaders. Each import() becomes its own lazy chunk, so the
// Data/Fill tools only fetch + parse the locale(s) actually used — instead of
// the ~1 MB monolith that statically importing all fifteen produced.
const LOADERS: Record<Locale, () => Promise<{ faker: Faker }>> = {
  en_GB: () => import('@faker-js/faker/locale/en_GB'),
  en_US: () => import('@faker-js/faker/locale/en_US'),
  pt_PT: () => import('@faker-js/faker/locale/pt_PT'),
  nl_BE: () => import('@faker-js/faker/locale/nl_BE'),
  nl: () => import('@faker-js/faker/locale/nl'),
  de_CH: () => import('@faker-js/faker/locale/de_CH'),
  de: () => import('@faker-js/faker/locale/de'),
  it: () => import('@faker-js/faker/locale/it'),
  fr: () => import('@faker-js/faker/locale/fr'),
  es: () => import('@faker-js/faker/locale/es'),
  nb_NO: () => import('@faker-js/faker/locale/nb_NO'),
  sv: () => import('@faker-js/faker/locale/sv'),
  fi: () => import('@faker-js/faker/locale/fi'),
  cs_CZ: () => import('@faker-js/faker/locale/cs_CZ'),
  de_AT: () => import('@faker-js/faker/locale/de_AT'),
};

const cache = new Map<Locale, Faker>();

/**
 * Load (and memoize) the faker instance for `locale`. Await this before calling
 * the synchronous generators below; an unknown locale falls back to the default.
 */
export async function ensureFaker(locale: Locale = DEFAULT_LOCALE): Promise<Faker> {
  const key: Locale = locale in LOADERS ? locale : DEFAULT_LOCALE;
  const hit = cache.get(key);
  if (hit) return hit;
  const mod = await LOADERS[key]();
  cache.set(key, mod.faker);
  return mod.faker;
}

/**
 * The cached faker for `locale` (with a default-locale fallback). A prior
 * {@link ensureFaker} for the locale is required, which the UI awaits.
 */
export function getFaker(locale: Locale = DEFAULT_LOCALE): Faker {
  const faker = cache.get(locale) ?? cache.get(DEFAULT_LOCALE);
  if (!faker) {
    throw new Error(`Faker locale "${locale}" is not loaded — call ensureFaker(locale) first.`);
  }
  return faker;
}

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
