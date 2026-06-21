import { beforeEach, describe, expect, it } from 'vitest';
import { detectField, detectFieldType, resolveControl } from '@/shared/field-detect';

beforeEach(() => {
  document.body.innerHTML = `
    <form>
      <mat-form-field>
        <mat-label>First name</mat-label>
        <input formcontrolname="firstName" placeholder="First name" id="fn" />
      </mat-form-field>
      <label>Email <input type="email" name="email" id="em" /></label>
      <mat-checkbox><label>Consent <input type="checkbox" id="cb" /></label></mat-checkbox>
      <select id="country"><option value="uk">UK</option></select>
      <textarea id="notes"></textarea>
    </form>
  `;
});

describe('detectFieldType', () => {
  it('classifies common controls', () => {
    expect(detectFieldType(document.querySelector('#fn')!)).toBe('text');
    expect(detectFieldType(document.querySelector('#em')!)).toBe('email');
    expect(detectFieldType(document.querySelector('#cb')!)).toBe('checkbox');
    expect(detectFieldType(document.querySelector('#country')!)).toBe('select');
    expect(detectFieldType(document.querySelector('#notes')!)).toBe('textarea');
  });
});

describe('resolveControl', () => {
  it('resolves a clicked wrapper to its inner control', () => {
    expect(resolveControl(document.querySelector('mat-checkbox')!).id).toBe('cb');
    expect(resolveControl(document.querySelector('mat-form-field')!).id).toBe('fn');
  });
});

describe('detectField', () => {
  it('returns selector, type, label and hint', () => {
    const d = detectField(document.querySelector('#fn')!, document);
    expect(d.fieldType).toBe('text');
    expect(d.label).toBe('First name');
    expect(d.hint).toContain('firstname');
    expect(d.selector).toBe('#fn');
  });

  it('resolves a mat-form-field click down to the input', () => {
    const d = detectField(document.querySelector('mat-form-field')!, document);
    expect(d.fieldType).toBe('text');
    expect(d.selector).toBe('#fn');
  });
});
