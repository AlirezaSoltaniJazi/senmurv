import { describe, expect, it } from 'vitest';
import {
  buildInstruction,
  buildScript,
  defaultGenerator,
  FIELD_TYPES,
  generateValue,
  generatorsFor,
  parseFillScript,
} from '@/shared/generators';
import type { FillInstruction, PickedField } from '@/shared/types';

describe('defaultGenerator', () => {
  it('maps control types to sensible generators', () => {
    expect(defaultGenerator('checkbox', '')).toBe('check');
    expect(defaultGenerator('select', '')).toBe('pickRandom');
    expect(defaultGenerator('email', '')).toBe('email');
    expect(defaultGenerator('tel', '')).toBe('phone');
  });

  it('guesses text generators from the hint', () => {
    expect(defaultGenerator('text', 'patient first name')).toBe('firstName');
    expect(defaultGenerator('text', 'surname')).toBe('lastName');
    expect(defaultGenerator('text', 'enter postcode')).toBe('postalCode');
    expect(defaultGenerator('text', 'mystery field')).toBe('fullName');
  });
});

describe('generatorsFor', () => {
  it('offers the right generators per type', () => {
    expect(generatorsFor('checkbox')).toContain('uncheck');
    expect(generatorsFor('select')).toEqual(['pickRandom', 'pickFirst']);
    expect(generatorsFor('text')).toContain('custom');
  });

  it('always includes the default generator in its option list', () => {
    for (const t of FIELD_TYPES) {
      expect(generatorsFor(t)).toContain(defaultGenerator(t, ''));
    }
  });
});

describe('generateValue', () => {
  it('returns strings for text generators and null for action generators', () => {
    expect(typeof generateValue('firstName', 'en_GB')).toBe('string');
    expect(generateValue('email', 'en_GB')).toContain('@');
    expect(generateValue('check', 'en_GB')).toBeNull();
    expect(generateValue('custom', 'en_GB', 'hello')).toBe('hello');
  });
});

function field(overrides: Partial<PickedField>): PickedField {
  return {
    id: 'x',
    selector: '#a',
    fieldType: 'text',
    label: 'l',
    hint: '',
    generator: 'fullName',
    ...overrides,
  };
}

describe('buildInstruction', () => {
  it('emits a value for text and an action for controls', () => {
    expect(buildInstruction(field({ generator: 'custom', customValue: 'Bob' }), 'en_GB')).toEqual({
      selector: '#a',
      fieldType: 'text',
      value: 'Bob',
    });
    expect(buildInstruction(field({ fieldType: 'checkbox', generator: 'check' }), 'en_GB')).toEqual(
      {
        selector: '#a',
        fieldType: 'checkbox',
        action: 'check',
      }
    );
    expect(
      buildInstruction(field({ fieldType: 'select', generator: 'pickFirst' }), 'en_GB').action
    ).toBe('pickFirst');
  });
});

describe('buildScript', () => {
  it('produces a runnable IIFE embedding the instructions', () => {
    const code = buildScript([{ selector: '#a', fieldType: 'text', value: 'Bob' }]);
    expect(code.trim().startsWith('(async () =>')).toBe(true);
    expect(code).toContain('document.querySelector');
    expect(code).toContain('"#a"');
    expect(code).toContain('Bob');
  });
});

describe('parseFillScript', () => {
  it('round-trips a generated script back into editable fields', () => {
    const instructions: FillInstruction[] = [
      { selector: 'input[formcontrolname="firstName"]', fieldType: 'text', value: 'Bob' },
      {
        selector: 'mat-select[formcontrolname="gender"]',
        fieldType: 'select',
        action: 'pickRandom',
      },
      { selector: 'mat-checkbox[formcontrolname="isRtm"]', fieldType: 'checkbox', action: 'check' },
    ];
    const fields = parseFillScript(buildScript(instructions));
    expect(fields).not.toBeNull();
    expect(fields).toHaveLength(3);

    const [text, select, checkbox] = fields!;
    expect(text).toMatchObject({
      selector: 'input[formcontrolname="firstName"]',
      fieldType: 'text',
      generator: 'custom',
      customValue: 'Bob',
      label: 'firstName',
    });
    expect(select).toMatchObject({ fieldType: 'select', generator: 'pickRandom', label: 'gender' });
    expect(checkbox).toMatchObject({ fieldType: 'checkbox', generator: 'check' });
  });

  it('returns null for a non-fill script', () => {
    expect(parseFillScript('console.log("hello")')).toBeNull();
    expect(parseFillScript('const INSTRUCTIONS = not-json;\n];')).toBeNull();
  });
});
