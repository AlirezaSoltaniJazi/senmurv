import type { Faker } from '@faker-js/faker';
import { generatePhone, generatePhoneIntl, getFaker } from '@/shared/faker-data';
import type { FieldType, FillInstruction, GeneratorId, Locale, PickedField } from '@/shared/types';
import { newId } from '@/utils/id';

export const GENERATOR_LABELS: Record<GeneratorId, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  fullName: 'Full name',
  email: 'Email',
  phone: 'Phone (+ code)',
  phoneNational: 'Phone (national)',
  phoneIntl: 'Phone (no 0, for +code field)',
  streetAddress: 'Street address',
  city: 'City',
  postalCode: 'Postal code',
  region: 'Region / County',
  country: 'Country',
  company: 'Company',
  word: 'Word',
  sentence: 'Sentence',
  number: 'Number',
  uuid: 'UUID',
  date: 'Date (dd/mm/yyyy)',
  pastDate: 'Past date',
  check: 'Check',
  uncheck: 'Uncheck',
  boolean: 'Random check',
  pickFirst: 'First option',
  pickRandom: 'Random option',
  custom: 'Custom value',
};

export const FIELD_TYPES: FieldType[] = [
  'text',
  'email',
  'tel',
  'number',
  'date',
  'password',
  'textarea',
  'checkbox',
  'radio',
  'select',
  'combobox',
];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Text',
  email: 'Email',
  tel: 'Phone',
  number: 'Number',
  date: 'Date',
  password: 'Password',
  textarea: 'Textarea',
  checkbox: 'Checkbox',
  radio: 'Radio',
  select: 'Select',
  combobox: 'Autocomplete',
};

const TEXT_GENERATORS: GeneratorId[] = [
  'fullName',
  'firstName',
  'lastName',
  'email',
  'phone',
  'phoneNational',
  'phoneIntl',
  'streetAddress',
  'city',
  'postalCode',
  'region',
  'country',
  'company',
  'word',
  'sentence',
  'number',
  'uuid',
  'date',
  'pastDate',
  'custom',
];

/** The generators offered for a given field type (first is a sensible default-ish). */
export function generatorsFor(type: FieldType): GeneratorId[] {
  switch (type) {
    case 'checkbox':
      return ['check', 'uncheck', 'boolean'];
    case 'radio':
    case 'select':
    case 'combobox':
      return ['pickRandom', 'pickFirst'];
    case 'email':
      return ['email', 'word', 'custom'];
    case 'tel':
      return ['phone', 'phoneNational', 'phoneIntl', 'number', 'custom'];
    case 'number':
      return ['number', 'custom'];
    case 'date':
      return ['date', 'pastDate', 'custom'];
    case 'password':
      return ['word', 'uuid', 'custom'];
    case 'textarea':
    case 'text':
    default:
      return TEXT_GENERATORS;
  }
}

/** Best-guess generator for a freshly detected field, from its type + hint text. */
export function defaultGenerator(type: FieldType, hint: string): GeneratorId {
  switch (type) {
    case 'checkbox':
      return 'check';
    case 'radio':
    case 'select':
    case 'combobox':
      return 'pickRandom';
    case 'email':
      return 'email';
    case 'tel':
      return 'phone';
    case 'number':
      return 'number';
    case 'date':
      return 'date';
    case 'password':
      return 'word';
    default:
      break;
  }
  if (/first.?name|given/.test(hint)) return 'firstName';
  if (/last.?name|surname|family/.test(hint)) return 'lastName';
  if (/full.?name|\bname\b/.test(hint)) return 'fullName';
  if (/e-?mail/.test(hint)) return 'email';
  if (/phone|mobile|\btel\b/.test(hint)) return 'phone';
  if (/post.?code|zip/.test(hint)) return 'postalCode';
  if (/city|town/.test(hint)) return 'city';
  if (/region|county|province|\bstate\b/.test(hint)) return 'region';
  if (/country/.test(hint)) return 'country';
  if (/address|street|line ?[12]/.test(hint)) return 'streetAddress';
  if (/company|organi/.test(hint)) return 'company';
  if (/date|dob|birth|dd.?mm.?yyyy/.test(hint)) return 'date';
  if (/number|amount|\bqty\b|\bid\b/.test(hint)) return 'number';
  return 'fullName';
}

function ddmmyyyy(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * One person shared across a flow's name-synced fields (First name / Last name /
 * Full name / a name-synced Email), so the values all match. Passed into
 * {@link generateValue} / {@link buildInstruction} by a caller filling a batch.
 */
export interface PersonName {
  firstName: string;
  lastName: string;
}

/**
 * An email local-part fragment: NFD-decompose so accented letters split into a
 * base letter + combining mark, then keep only `[a-z0-9]` — which drops the marks
 * (and spaces / apostrophes) and lowercases. "O'Brien" → "obrien", "José" → "jose".
 */
function emailSlug(s: string): string {
  return s
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** Parse a digit-count arg `"dMIN-MAX"` (e.g. `"d3-5"`) into bounds, else null. */
function parseDigitArg(genArg?: string): { min: number; max: number } | null {
  if (!genArg) return null;
  const m = /^d(\d+)-(\d+)$/.exec(genArg);
  if (!m) return null;
  let min = parseInt(m[1]!, 10);
  let max = parseInt(m[2]!, 10);
  if (!Number.isFinite(min) || min < 1) min = 1;
  if (!Number.isFinite(max) || max < min) max = min;
  return { min, max };
}

/**
 * A number for the Number generator. A `"dMIN-MAX"` genArg yields a value with a
 * digit count in that range (first digit non-zero); a legacy `"lo-hi"` value
 * range still works; otherwise the default 1..99999.
 */
function numberValue(faker: Faker, genArg?: string): string {
  const digits = parseDigitArg(genArg);
  if (digits) {
    const len = faker.number.int({ min: digits.min, max: digits.max });
    if (len <= 1) return String(faker.number.int({ min: 0, max: 9 }));
    let out = String(faker.number.int({ min: 1, max: 9 }));
    for (let k = 1; k < len; k += 1) out += faker.number.int({ min: 0, max: 9 });
    return out;
  }
  if (genArg && /^\d+-\d+$/.test(genArg)) {
    const [loStr, hiStr] = genArg.split('-');
    const lo = parseInt(loStr!, 10) || 0;
    const hi = parseInt(hiStr!, 10) || lo;
    return String(faker.number.int({ min: Math.min(lo, hi), max: Math.max(lo, hi) }));
  }
  return String(faker.number.int({ min: 1, max: 99999 }));
}

/**
 * An email. A `genArg` of `f`/`l`/`fl` syncs those name parts to `person` (so the
 * email matches the flow's name fields): `first.last.NNN@example.com`. With no
 * arg it is an independent faker email.
 */
function emailValue(faker: Faker, genArg?: string, person?: PersonName): string {
  const sync = genArg ?? '';
  const parts: string[] = [];
  if (sync.includes('f')) parts.push(emailSlug(person?.firstName ?? faker.person.firstName()));
  if (sync.includes('l')) parts.push(emailSlug(person?.lastName ?? faker.person.lastName()));
  if (parts.length === 0) return faker.internet.email();
  return `${parts.join('.')}.${faker.number.int({ min: 1, max: 999 })}@example.com`;
}

/**
 * A region / county name: prefer `county()`, then `state()`, then `city()`. faker
 * throws for a dataset a locale doesn't define, so each step is guarded and the
 * always-present `city()` guarantees a non-empty result for every locale.
 */
function regionValue(faker: Faker): string {
  const loc = faker.location as {
    county?: () => string;
    state?: () => string;
    city: () => string;
  };
  try {
    if (typeof loc.county === 'function') return loc.county();
  } catch {
    /* locale has no county data — try state */
  }
  try {
    if (typeof loc.state === 'function') return loc.state();
  } catch {
    /* locale has no state data — fall back to city */
  }
  return loc.city();
}

/** Produce a concrete string value for a text-like generator (null for action generators). */
export function generateValue(
  generator: GeneratorId,
  locale: Locale,
  custom?: string,
  genArg?: string,
  person?: PersonName
): string | null {
  if (generator === 'custom') return custom ?? '';
  const faker = getFaker(locale);
  switch (generator) {
    case 'firstName':
      return person?.firstName ?? faker.person.firstName();
    case 'lastName':
      return person?.lastName ?? faker.person.lastName();
    case 'fullName':
      return person ? `${person.firstName} ${person.lastName}` : faker.person.fullName();
    case 'email':
      return emailValue(faker, genArg, person);
    case 'phone':
      return generatePhone(locale, true);
    case 'phoneNational':
      return generatePhone(locale, false);
    case 'phoneIntl':
      return generatePhoneIntl(locale);
    case 'streetAddress':
      return faker.location.streetAddress();
    case 'city':
      return faker.location.city();
    case 'postalCode':
      return faker.location.zipCode();
    case 'region':
      return regionValue(faker);
    case 'country':
      return faker.location.country();
    case 'company':
      return faker.company.name();
    case 'word':
      return faker.lorem.word();
    case 'sentence':
      return faker.lorem.sentence();
    case 'number':
      return numberValue(faker, genArg);
    case 'uuid':
      return faker.string.uuid();
    case 'date':
      return ddmmyyyy(faker.date.birthdate());
    case 'pastDate':
      return ddmmyyyy(faker.date.past());
    default:
      return null; // action-based generators
  }
}

/**
 * Turn a configured field + locale into one concrete fill instruction. A shared
 * `person` (see {@link PersonName}) keeps a batch's name-synced fields consistent.
 */
export function buildInstruction(
  field: PickedField,
  locale: Locale,
  person?: PersonName
): FillInstruction {
  const base = { selector: field.selector, fieldType: field.fieldType };
  switch (field.generator) {
    case 'check':
      return { ...base, action: 'check' };
    case 'uncheck':
      return { ...base, action: 'uncheck' };
    case 'boolean':
      return { ...base, action: Math.random() < 0.5 ? 'check' : 'uncheck' };
    case 'pickFirst':
      return { ...base, action: 'pickFirst' };
    case 'pickRandom':
      return { ...base, action: 'pickRandom' };
    default:
      return {
        ...base,
        value:
          generateValue(field.generator, locale, field.customValue, field.genArg, person) ?? '',
      };
  }
}

/** A short human preview of what an instruction will do (for the field list). */
export function instructionPreview(instruction: FillInstruction): string {
  return instruction.action ? `[${instruction.action}]` : (instruction.value ?? '');
}

/**
 * Emit a self-contained JS script that applies the given instructions. Shared by
 * "Generate & Fill" (run via the MAIN-world runner), "Copy as script", and
 * "Save to Scripts" — so all three produce identical behaviour.
 */
export function buildScript(instructions: FillInstruction[]): string {
  const data = JSON.stringify(instructions, null, 2);
  return `(async () => {
  const INSTRUCTIONS = ${data};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const iSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const tSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  const sSet = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
  const setVal = (el, v) => {
    el.focus();
    (el.tagName === 'TEXTAREA' ? tSet : iSet).call(el, v);
    for (const t of ['input', 'change', 'blur']) el.dispatchEvent(new Event(t, { bubbles: true }));
  };
  const visibleOptions = () =>
    [...document.querySelectorAll('mat-option')].filter((o) => o.offsetParent !== null);
  let filled = 0, missing = 0;
  for (const ins of INSTRUCTIONS) {
    const el = document.querySelector(ins.selector);
    if (!el) { missing++; console.warn('[fill] not found:', ins.selector); continue; }
    try {
      const tag = el.tagName.toLowerCase();
      if (ins.fieldType === 'checkbox') {
        const box = el.matches('input[type="checkbox"]') ? el : (el.querySelector('input[type="checkbox"]') || el);
        const want = ins.action !== 'uncheck';
        if (!!box.checked !== want) { box.click(); if (!!box.checked !== want) (el.querySelector('label') || el).click(); }
      } else if (ins.fieldType === 'radio') {
        (el.matches('input') ? el : (el.querySelector('input[type="radio"]') || el)).click();
      } else if (ins.fieldType === 'select' || ins.fieldType === 'combobox') {
        if (tag === 'select') {
          const opts = [...el.options].filter((o) => !o.disabled && o.value !== '');
          if (opts.length) {
            const p = ins.action === 'pickFirst' ? opts[0] : opts[Math.floor(Math.random() * opts.length)];
            sSet.call(el, p.value);
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        } else {
          (el.querySelector('.mat-mdc-select-trigger') || el).click();
          if (el.focus) el.focus();
          if (el.value === '') el.dispatchEvent(new Event('input', { bubbles: true }));
          await sleep(350);
          const opts = visibleOptions();
          if (opts.length) {
            const p = ins.action === 'pickFirst' ? opts[0] : opts[Math.floor(Math.random() * opts.length)];
            p.click();
          } else { document.body.click(); }
          await sleep(150);
        }
      } else {
        setVal(el, ins.value || '');
      }
      filled++;
    } catch (e) { console.warn('[fill] error at', ins.selector, e); }
  }
  console.info('[fill] done — filled', filled, '/ missing', missing);
})();`;
}

const ACTION_GENERATORS = new Set<GeneratorId>(['check', 'uncheck', 'pickFirst', 'pickRandom']);

/** A short label derived from a selector (formcontrolname / attr value / id / raw). */
function labelFromSelector(selector: string): string {
  const attr = /\[[a-z-]+="([^"]+)"\]/i.exec(selector);
  if (attr) return attr[1]!;
  const id = /#([\w-]+)/.exec(selector);
  if (id) return id[1]!;
  return selector;
}

function instructionToField(item: unknown): PickedField | null {
  if (typeof item !== 'object' || item === null) return null;
  const o = item as Record<string, unknown>;
  if (typeof o.selector !== 'string') return null;
  const fieldType: FieldType = (FIELD_TYPES as string[]).includes(o.fieldType as string)
    ? (o.fieldType as FieldType)
    : 'text';
  const base = {
    id: newId('fld_'),
    selector: o.selector,
    fieldType,
    label: labelFromSelector(o.selector),
    hint: o.selector.toLowerCase(),
  };
  if (typeof o.action === 'string' && ACTION_GENERATORS.has(o.action as GeneratorId)) {
    return { ...base, generator: o.action as GeneratorId };
  }
  return { ...base, generator: 'custom', customValue: typeof o.value === 'string' ? o.value : '' };
}

/**
 * Reverse of {@link buildScript}: extract the embedded `INSTRUCTIONS` array from
 * a generated fill script and rebuild editable fields. Text values come back as
 * the `custom` generator (the original random generator isn't stored in the
 * script), so they can be re-randomized or tweaked. Returns null if the code
 * isn't a Senmurv fill script.
 */
/** Cheap check: was this script produced by the Fill tool (has an INSTRUCTIONS array)? */
export function isFillScript(code: string): boolean {
  return /const INSTRUCTIONS\s*=\s*\[/.test(code);
}

export function parseFillScript(code: string): PickedField[] | null {
  const match = /const INSTRUCTIONS\s*=\s*(\[[\s\S]*?\n\]);/.exec(code);
  if (!match) return null;
  let arr: unknown;
  try {
    arr = JSON.parse(match[1]!);
  } catch {
    return null;
  }
  if (!Array.isArray(arr)) return null;
  const fields: PickedField[] = [];
  for (const item of arr) {
    const field = instructionToField(item);
    if (field) fields.push(field);
  }
  return fields.length > 0 ? fields : null;
}
