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

describe('Material floating-label resolution', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <mat-form-field class="mat-mdc-form-field">
        <div class="mdc-notched-outline__notch">
          <label class="mdc-floating-label" id="mat-mdc-form-field-label-19" for="mat-input-15">
            <mat-label>Primary health ID (NHS number)</mat-label>
          </label>
        </div>
        <div class="mat-mdc-form-field-infix">
          <input formcontrolname="primary" id="mat-input-15" type="text" />
        </div>
      </mat-form-field>
      <mat-form-field class="mat-mdc-form-field">
        <div class="mdc-notched-outline__notch">
          <label class="mdc-floating-label" id="mat-mdc-form-field-label-16">
            <mat-label>Gender</mat-label>
          </label>
        </div>
        <mat-select formcontrolname="gender" id="mat-select-3"></mat-select>
      </mat-form-field>
    `;
  });

  it('resolves a clicked <mat-label> to its input via label for=', () => {
    const matLabel = document.querySelectorAll('mat-label')[0]!;
    expect(resolveControl(matLabel, document).id).toBe('mat-input-15');
    const d = detectField(matLabel, document);
    expect(d.fieldType).toBe('text');
    expect(d.selector).toBe('input[formcontrolname="primary"]');
  });

  it('resolves a label with no for= by climbing to the mat-select', () => {
    const genderLabel = document.querySelectorAll('mat-label')[1]!;
    expect(resolveControl(genderLabel, document).tagName.toLowerCase()).toBe('mat-select');
    const d = detectField(genderLabel, document);
    expect(d.fieldType).toBe('select');
    expect(d.selector).toBe('mat-select[formcontrolname="gender"]');
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
