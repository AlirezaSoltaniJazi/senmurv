import type {
  BoundaryCase,
  FieldConstraint,
  FieldContract,
  ValiditySnapshot,
} from '@/shared/types';

/**
 * Pure validation-contract extraction for the Validation Inspector: read every
 * client-side constraint a form control declares (type, required, length, range,
 * step, pattern, autocomplete, …), explain a `pattern` in plain English, and turn
 * the constraints into a boundary-test checklist.
 *
 * Chrome-free and DOM-injectable — it reads attributes off an element. The live
 * `ValidityState` is read here too but guarded, since happy-dom and non-control
 * elements may not expose one; the checklist is derived from the constraints, so
 * it stays fully deterministic under test.
 */

/** Best-effort plain-English gloss of a common `pattern` regex. */
export function explainPattern(pattern: string): string {
  const p = pattern.trim();
  const anchored = p.startsWith('^') && p.endsWith('$');
  const core = p.replace(/^\^/, '').replace(/\$$/, '');

  let m = /^(?:\\d|\[0-9\])\{(\d+)\}$/.exec(core);
  if (m) return `exactly ${m[1]} digits`;
  m = /^(?:\\d|\[0-9\])\{(\d+),(\d+)\}$/.exec(core);
  if (m) return `${m[1]} to ${m[2]} digits`;
  m = /^(?:\\d|\[0-9\])\{(\d+),\}$/.exec(core);
  if (m) return `at least ${m[1]} digits`;
  if (/^(?:\\d|\[0-9\])\+$/.test(core)) return 'digits only';
  if (/^(?:\\d|\[0-9\])\*$/.test(core)) return 'digits only (may be empty)';
  if (/^\[a-zA-Z\]\+$/.test(core)) return 'letters only';
  if (/^\[a-zA-Z0-9\]\+$/.test(core)) return 'letters and digits only';
  if (/^\[a-zA-Z0-9\\s \]\+$/.test(core)) return 'letters, digits and spaces';

  m = /^\.\{(\d+),\}$/.exec(core);
  if (m) return `at least ${m[1]} characters`;
  m = /^\.\{(\d+),(\d+)\}$/.exec(core);
  if (m) return `${m[1]} to ${m[2]} characters`;

  if (/@/.test(p)) return 'an email-style value';
  return anchored
    ? `the whole value must match /${pattern}/`
    : `the value must contain a match for /${pattern}/`;
}

const RANGE_LENGTH_ATTRS = [
  'minlength',
  'maxlength',
  'min',
  'max',
  'step',
  'inputmode',
  'autocomplete',
  'accept',
  'size',
] as const;

const READONLY_FLAGS = [
  'valueMissing',
  'typeMismatch',
  'patternMismatch',
  'tooLong',
  'tooShort',
  'rangeUnderflow',
  'rangeOverflow',
  'stepMismatch',
  'badInput',
] as const;

function readValidity(el: Element): ValiditySnapshot | null {
  const v = (el as HTMLInputElement).validity as ValidityState | undefined;
  if (!v || typeof v.valid !== 'boolean') return null;
  const flags = v as unknown as Record<string, boolean>;
  return { valid: v.valid, failing: READONLY_FLAGS.filter((f) => flags[f] === true) };
}

/** Extract the full client-side validation contract of a form control. */
export function readFieldContract(el: Element): FieldContract {
  const tag = el.tagName.toLowerCase();
  const type = tag === 'input' ? (el.getAttribute('type') ?? 'text').toLowerCase() : tag;
  const required = el.hasAttribute('required') || el.getAttribute('aria-required') === 'true';
  const readOnly = (el as HTMLInputElement).readOnly === true || el.hasAttribute('readonly');
  const isFormField =
    /^(input|select|textarea)$/.test(tag) || el.getAttribute('contenteditable') === 'true';

  const constraints: FieldConstraint[] = [];
  const add = (name: string, value: string, detail?: string): void => {
    constraints.push(detail !== undefined ? { name, value, detail } : { name, value });
  };

  if (required) add('required', 'yes');
  for (const attr of RANGE_LENGTH_ATTRS) {
    const value = el.getAttribute(attr);
    if (value !== null) add(attr, value);
  }
  if (el.hasAttribute('multiple')) add('multiple', 'yes');
  if (readOnly) add('readonly', 'yes');
  const pattern = el.getAttribute('pattern');
  if (pattern !== null) add('pattern', pattern, explainPattern(pattern));

  return {
    tag,
    label: type === tag ? tag : `input[type=${type}]`,
    type,
    required,
    isFormField,
    constraints,
    validity: readValidity(el),
  };
}

function constraintValue(contract: FieldContract, name: string): string | undefined {
  return contract.constraints.find((c) => c.name === name)?.value;
}
function constraintNumber(contract: FieldContract, name: string): number | null {
  const value = constraintValue(contract, name);
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const REPEAT_CAP = 64;

/** Build a boundary-test checklist from a field's constraints. */
export function buildBoundaryChecklist(contract: FieldContract): BoundaryCase[] {
  const cases: BoundaryCase[] = [];

  if (contract.required) {
    cases.push({ category: 'empty', label: 'Empty', example: '', expect: 'reject' });
    cases.push({ category: 'empty', label: 'Whitespace only', example: '   ', expect: 'review' });
  }

  const maxlength = constraintNumber(contract, 'maxlength');
  if (maxlength !== null) {
    cases.push({
      category: 'length',
      label: `Exactly maxlength (${maxlength})`,
      example: 'a'.repeat(Math.min(maxlength, REPEAT_CAP)),
      expect: 'accept',
    });
    cases.push({
      category: 'length',
      label: `Over maxlength (${maxlength + 1}, via paste)`,
      example: 'a'.repeat(Math.min(maxlength + 1, REPEAT_CAP + 1)),
      expect: 'reject',
    });
  }

  const minlength = constraintNumber(contract, 'minlength');
  if (minlength !== null && minlength > 0) {
    cases.push({
      category: 'length',
      label: `Under minlength (${minlength - 1})`,
      example: 'a'.repeat(minlength - 1),
      expect: 'reject',
    });
    cases.push({
      category: 'length',
      label: `Exactly minlength (${minlength})`,
      example: 'a'.repeat(minlength),
      expect: 'accept',
    });
  }

  const min = constraintNumber(contract, 'min');
  const max = constraintNumber(contract, 'max');
  const step = constraintNumber(contract, 'step');
  if (min !== null) {
    cases.push({
      category: 'range',
      label: `Below min (${min - 1})`,
      example: String(min - 1),
      expect: 'reject',
    });
    cases.push({
      category: 'range',
      label: `At min (${min})`,
      example: String(min),
      expect: 'accept',
    });
  }
  if (max !== null) {
    cases.push({
      category: 'range',
      label: `At max (${max})`,
      example: String(max),
      expect: 'accept',
    });
    cases.push({
      category: 'range',
      label: `Above max (${max + 1})`,
      example: String(max + 1),
      expect: 'reject',
    });
  }
  if (step !== null && step > 0) {
    const base = min ?? 0;
    cases.push({
      category: 'range',
      label: `Off-step (${base + step / 2})`,
      example: String(base + step / 2),
      expect: 'reject',
    });
  }

  if (constraintValue(contract, 'pattern') !== undefined) {
    cases.push({ category: 'pattern', label: 'Pattern mismatch', example: null, expect: 'reject' });
  }

  if (contract.type === 'email') {
    cases.push({
      category: 'format',
      label: 'Missing @ (invalid email)',
      example: 'not-an-email',
      expect: 'reject',
    });
    cases.push({
      category: 'format',
      label: 'Valid email',
      example: 'test@example.com',
      expect: 'accept',
    });
  } else if (contract.type === 'number') {
    cases.push({ category: 'format', label: 'Non-numeric', example: 'abc', expect: 'reject' });
  } else if (contract.type === 'url') {
    cases.push({ category: 'format', label: 'Not a URL', example: 'nope', expect: 'reject' });
  }

  if (/^(text|search|email|tel|url)$/.test(contract.type) || contract.tag === 'textarea') {
    cases.push({
      category: 'edge',
      label: 'Unicode / emoji',
      example: 'Zoë 你好 😀',
      expect: 'review',
    });
  }

  return cases;
}
