import { describe, expect, it } from 'vitest';
import {
  buildBoundaryChecklist,
  explainPattern,
  readFieldContract,
} from '@/shared/tools/validation-contract';

function el(html: string): Element {
  const host = document.createElement('div');
  host.innerHTML = html.trim();
  const first = host.firstElementChild;
  if (!first) throw new Error('no element');
  return first;
}

describe('explainPattern', () => {
  it('glosses common patterns', () => {
    expect(explainPattern('\\d{5}')).toBe('exactly 5 digits');
    expect(explainPattern('^\\d{3,6}$')).toBe('3 to 6 digits');
    expect(explainPattern('[0-9]+')).toBe('digits only');
    expect(explainPattern('[a-zA-Z]+')).toBe('letters only');
    expect(explainPattern('.{8,}')).toBe('at least 8 characters');
  });

  it('falls back to the raw regex, noting whether it is anchored', () => {
    expect(explainPattern('^foo.*bar$')).toContain('the whole value must match');
    expect(explainPattern('foo')).toContain('must contain a match');
  });
});

describe('readFieldContract', () => {
  it('extracts constraints from an email input', () => {
    const c = readFieldContract(
      el('<input type="email" required maxlength="40" autocomplete="email">')
    );
    expect(c.type).toBe('email');
    expect(c.required).toBe(true);
    expect(c.isFormField).toBe(true);
    expect(c.constraints).toContainEqual({ name: 'required', value: 'yes' });
    expect(c.constraints).toContainEqual({ name: 'maxlength', value: '40' });
    expect(c.constraints).toContainEqual({ name: 'autocomplete', value: 'email' });
  });

  it('captures min/max/step for a number input', () => {
    const c = readFieldContract(el('<input type="number" min="18" max="99" step="1">'));
    const names = c.constraints.map((x) => x.name);
    expect(names).toEqual(expect.arrayContaining(['min', 'max', 'step']));
  });

  it('explains a pattern via the detail field', () => {
    const c = readFieldContract(el('<input pattern="\\d{5}">'));
    const p = c.constraints.find((x) => x.name === 'pattern');
    expect(p?.detail).toBe('exactly 5 digits');
  });

  it('treats aria-required as required', () => {
    expect(readFieldContract(el('<input aria-required="true">')).required).toBe(true);
  });

  it('marks a non-form element as not a field', () => {
    expect(readFieldContract(el('<div>hi</div>')).isFormField).toBe(false);
  });
});

describe('buildBoundaryChecklist', () => {
  it('adds empty + whitespace cases for a required field', () => {
    const cases = buildBoundaryChecklist(readFieldContract(el('<input required>')));
    const labels = cases.map((c) => c.label);
    expect(labels).toContain('Empty');
    expect(labels).toContain('Whitespace only');
    expect(cases.find((c) => c.label === 'Empty')?.expect).toBe('reject');
  });

  it('adds over/at maxlength cases with example values', () => {
    const cases = buildBoundaryChecklist(readFieldContract(el('<input maxlength="5">')));
    const over = cases.find((c) => c.label.startsWith('Over maxlength'));
    const at = cases.find((c) => c.label.startsWith('Exactly maxlength'));
    expect(at?.example).toBe('aaaaa');
    expect(over?.example).toBe('aaaaaa');
    expect(over?.expect).toBe('reject');
  });

  it('adds below/at/above range cases for min/max', () => {
    const cases = buildBoundaryChecklist(
      readFieldContract(el('<input type="number" min="18" max="99">'))
    );
    const labels = cases.map((c) => c.label);
    expect(labels).toContain('Below min (17)');
    expect(labels).toContain('At min (18)');
    expect(labels).toContain('Above max (100)');
  });

  it('adds an off-step case', () => {
    const cases = buildBoundaryChecklist(
      readFieldContract(el('<input type="number" min="0" step="5">'))
    );
    expect(cases.find((c) => c.label.startsWith('Off-step'))?.example).toBe('2.5');
  });

  it('adds format cases for typed inputs and a unicode edge case for text', () => {
    const email = buildBoundaryChecklist(readFieldContract(el('<input type="email">')));
    expect(email.map((c) => c.label)).toContain('Missing @ (invalid email)');
    const text = buildBoundaryChecklist(readFieldContract(el('<input type="text">')));
    expect(text.find((c) => c.label === 'Unicode / emoji')?.example).toBe('Zoë 你好 😀');
  });
});
