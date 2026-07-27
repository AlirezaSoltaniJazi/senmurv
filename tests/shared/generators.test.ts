import { beforeAll, describe, expect, it } from 'vitest';
import { ensureFaker } from '@/shared/faker-data';
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

// generateValue/buildInstruction read from faker's locale cache — prime it first.
beforeAll(async () => {
  await ensureFaker('en_GB');
});

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

  it('returns a non-empty region / county name', () => {
    const region = generateValue('region', 'en_GB');
    expect(typeof region).toBe('string');
    expect((region ?? '').length).toBeGreaterThan(0);
  });

  it('honours a Number digit-count genArg (dMIN-MAX)', () => {
    for (let i = 0; i < 40; i += 1) {
      const v = generateValue('number', 'en_GB', undefined, 'd3-5') ?? '';
      expect(/^\d+$/.test(v)).toBe(true);
      expect(v.length).toBeGreaterThanOrEqual(3);
      expect(v.length).toBeLessThanOrEqual(5);
      expect(v.startsWith('0')).toBe(false); // multi-digit numbers have no leading zero
    }
    // A single-digit request stays 0..9 (a leading zero is allowed at length 1).
    for (let i = 0; i < 20; i += 1) {
      const v = generateValue('number', 'en_GB', undefined, 'd1-1') ?? '';
      expect(v.length).toBe(1);
    }
  });

  it('still honours a legacy value-range Number genArg (lo-hi)', () => {
    for (let i = 0; i < 30; i += 1) {
      const n = Number(generateValue('number', 'en_GB', undefined, '10-20'));
      expect(n).toBeGreaterThanOrEqual(10);
      expect(n).toBeLessThanOrEqual(20);
    }
  });

  it('syncs the email to a shared person when the genArg asks for it', () => {
    const person = { firstName: 'Grace', lastName: 'Hopper' };
    const both = generateValue('email', 'en_GB', undefined, 'fl', person) ?? '';
    expect(both.startsWith('grace.hopper.')).toBe(true);
    expect(/^grace\.hopper\.\d+@example\.com$/.test(both)).toBe(true);

    const firstOnly = generateValue('email', 'en_GB', undefined, 'f', person) ?? '';
    expect(/^grace\.\d+@example\.com$/.test(firstOnly)).toBe(true);

    const lastOnly = generateValue('email', 'en_GB', undefined, 'l', person) ?? '';
    expect(/^hopper\.\d+@example\.com$/.test(lastOnly)).toBe(true);
  });

  it('email with no sync arg ignores the person (independent value)', () => {
    const person = { firstName: 'Grace', lastName: 'Hopper' };
    const email = generateValue('email', 'en_GB', undefined, undefined, person) ?? '';
    expect(email).toContain('@');
    expect(email.toLowerCase()).not.toContain('grace.hopper');
  });

  it('name generators use the shared person so a flow’s fields agree', () => {
    const person = { firstName: 'Ada', lastName: 'Byron' };
    expect(generateValue('firstName', 'en_GB', undefined, undefined, person)).toBe('Ada');
    expect(generateValue('lastName', 'en_GB', undefined, undefined, person)).toBe('Byron');
    expect(generateValue('fullName', 'en_GB', undefined, undefined, person)).toBe('Ada Byron');
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

  it('threads genArg + a shared person into the generated value', () => {
    const person = { firstName: 'Grace', lastName: 'Hopper' };
    const emailIns = buildInstruction(
      field({ fieldType: 'email', generator: 'email', genArg: 'fl' }),
      'en_GB',
      person
    );
    expect(/^grace\.hopper\.\d+@example\.com$/.test(emailIns.value ?? '')).toBe(true);

    const numberIns = buildInstruction(
      field({ fieldType: 'number', generator: 'number', genArg: 'd4-4' }),
      'en_GB'
    );
    expect((numberIns.value ?? '').length).toBe(4);
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
