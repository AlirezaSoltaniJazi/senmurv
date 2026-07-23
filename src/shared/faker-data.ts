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
 * Valid **mobile** number ranges per locale: real mobile prefixes (national
 * form, including the trunk `0` where the country uses one) and the total
 * national digit length. faker's `phone.number()` mixes in landline / freephone
 * / short numbers that fail "valid mobile" validation, so we build the national
 * number from these ranges instead. US is special-cased (NANP, no trunk `0`).
 *
 * A locale whose prefixes have DIFFERENT valid lengths (e.g. German 015x carry an
 * 8-digit subscriber part but 016x/017x carry 7) is expressed as an array of
 * {@link MobilePlan} groups; `nationalMobile` picks a group, then a prefix.
 */
interface MobilePlan {
  prefixes: string[];
  /** Total national digits, including the prefix (and trunk `0` where used). */
  length: number;
}

const MOBILE_PLANS: Record<Locale, MobilePlan | MobilePlan[]> = {
  en_GB: { prefixes: ['074', '075', '077', '078', '079'], length: 11 },
  en_US: { prefixes: [], length: 10 }, // special-cased in nationalMobile()
  pt_PT: { prefixes: ['91', '92', '93', '96'], length: 9 },
  nl_BE: {
    prefixes: ['0470', '0472', '0473', '0474', '0475', '0476', '0477', '0478', '0479'],
    length: 10,
  },
  nl: { prefixes: ['06'], length: 10 },
  de_CH: { prefixes: ['076', '077', '078', '079'], length: 10 },
  // 015x are 12-digit national numbers (8-digit subscriber part); 016x/017x are 11.
  de: [
    { prefixes: ['0151', '0152', '0157'], length: 12 },
    { prefixes: ['0160', '0170', '0171', '0172', '0175'], length: 11 },
  ],
  it: {
    prefixes: ['320', '328', '333', '338', '340', '347', '348', '349', '366', '380', '388', '391'],
    length: 10,
  },
  fr: { prefixes: ['06', '07'], length: 10 },
  // 6x and 71x–79x are mobile; the 70x block is personal-numbering, not mobile.
  es: { prefixes: ['6', '71', '72', '73', '74', '75', '76', '77', '78', '79'], length: 9 },
  nb_NO: { prefixes: ['4', '9'], length: 8 },
  sv: { prefixes: ['070', '072', '073', '076', '079'], length: 10 },
  fi: { prefixes: ['040', '044', '045', '050'], length: 10 },
  cs_CZ: { prefixes: ['60', '72', '73', '77', '79'], length: 9 },
  de_AT: { prefixes: ['0650', '0660', '0664', '0676', '0699'], length: 11 },
};

function randomDigits(faker: Faker, n: number): string {
  let s = '';
  for (let i = 0; i < n; i += 1) s += faker.number.int({ min: 0, max: 9 });
  return s;
}

function pickInt(faker: Faker, max: number): number {
  return faker.number.int({ min: 0, max });
}

/** A valid national-format mobile number for the locale (trunk `0` where used). */
function nationalMobile(locale: Locale, faker: Faker): string {
  if (locale === 'en_US') {
    // NANP: area and exchange codes both start 2-9; no trunk `0`.
    const nxx = (): string => String(faker.number.int({ min: 2, max: 9 })) + randomDigits(faker, 2);
    return nxx() + nxx() + randomDigits(faker, 4);
  }
  const plan = MOBILE_PLANS[locale] ?? MOBILE_PLANS.en_GB;
  const groups = Array.isArray(plan) ? plan : [plan];
  const group = groups[pickInt(faker, groups.length - 1)]!;
  const prefix = group.prefixes[pickInt(faker, group.prefixes.length - 1)]!;
  return prefix + randomDigits(faker, group.length - prefix.length);
}

/**
 * A region-correct **mobile** phone number. `withCode` prepends the locale's
 * dialing code (and drops the national trunk `0`); otherwise the national format
 * is returned. Always a valid mobile range — never a landline/freephone number.
 */
export function generatePhone(locale: Locale, withCode = true): string {
  const national = nationalMobile(locale, getFaker(locale));
  if (!withCode) return national;
  const code = DIAL_CODES[locale];
  return code ? `${code} ${national.replace(/^0/, '')}`.trim() : national;
}

/**
 * A valid mobile in **international NSN form** — the national number WITHOUT the
 * trunk `0`, which is the shape an intl-tel field (one that already carries a
 * +country-code selector) expects; a leading `0` makes such a widget read
 * `+44 0785…`, which is rejected.
 *
 * The number comes from a real, assignable mobile range so it passes strict
 * server-side validation (e.g. libphonenumber `is_valid_number`, the check behind
 * most phone-number form fields). Reserved "fictional" ranges — such as the UK
 * 07700 900xxx drama block — are deliberately NOT used: libphonenumber marks them
 * invalid, so a backend would reject them on submit. The result is therefore a
 * random valid mobile, not a guaranteed-unassigned one.
 */
export function generatePhoneIntl(locale: Locale): string {
  return nationalMobile(locale, getFaker(locale)).replace(/^0/, '');
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
