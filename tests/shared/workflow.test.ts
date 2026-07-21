import { describe, expect, it } from 'vitest';
import {
  buildWorkflowScript,
  fieldToStep,
  isWorkflowScript,
  newStep,
  parseWorkflowScript,
} from '@/shared/workflow';
import type { WorkflowStep } from '@/shared/workflow';
import type { PickedField } from '@/shared/types';

const steps: WorkflowStep[] = [
  { id: 'a', kind: 'click', text: 'Continue' },
  { id: 'b', kind: 'fill', label: 'Full name', value: 'Jane Doe' },
  { id: 'c', kind: 'select', label: 'Country', value: 'United Kingdom', optionMode: 'text' },
  { id: 'd', kind: 'radio', value: 'yes' },
  { id: 'e', kind: 'wait', ms: 3000 },
  { id: 'f', kind: 'check', selector: 'mat-checkbox[formcontrolname="subscribe"]', checked: true },
];

describe('newStep', () => {
  it('creates sensible defaults per kind', () => {
    expect(newStep('wait').ms).toBe(1000);
    expect(newStep('select').optionMode).toBe('text');
    expect(newStep('check').checked).toBe(true);
    expect(newStep('click').text).toBe('');
  });
});

describe('buildWorkflowScript', () => {
  it('emits a runnable IIFE with a STEPS array and the interpreter', () => {
    const code = buildWorkflowScript(steps);
    expect(code.trim().startsWith('(async () =>')).toBe(true);
    expect(code).toContain('const STEPS =');
    expect(code).toContain('clickButton(step.text)');
    expect(code).toContain('setSelect(step)');
    expect(code).toContain('setRadio(step)');
    expect(code).toContain('"Continue"');
    expect(isWorkflowScript(code)).toBe(true);
  });
});

describe('parseWorkflowScript', () => {
  it('round-trips a generated script back into steps', () => {
    const parsed = parseWorkflowScript(buildWorkflowScript(steps));
    expect(parsed).not.toBeNull();
    expect(parsed).toHaveLength(6);
    expect(parsed!.map((s) => s.kind)).toEqual([
      'click',
      'fill',
      'select',
      'radio',
      'wait',
      'check',
    ]);
    expect(parsed![0]).toMatchObject({ kind: 'click', text: 'Continue' });
    expect(parsed![2]).toMatchObject({ kind: 'select', label: 'Country', value: 'United Kingdom' });
    expect(parsed![3]).toMatchObject({ kind: 'radio', value: 'yes' });
    expect(parsed![4]).toMatchObject({ kind: 'wait', ms: 3000 });
  });

  it('returns null for non-workflow scripts', () => {
    expect(parseWorkflowScript('console.log(1)')).toBeNull();
    expect(isWorkflowScript('console.log(1)')).toBe(false);
  });

  it('preserves an nth index through round-trip', () => {
    const withIndex: WorkflowStep[] = [
      {
        id: 'x',
        kind: 'fill',
        selector: 'input[formcontrolname="firstName"]',
        index: 1,
        value: 'Contact',
      },
    ];
    const code = buildWorkflowScript(withIndex);
    expect(code).toContain('"index": 1');
    expect(code).toContain('queryNth(step.selector, step.index)');
    const parsed = parseWorkflowScript(code);
    expect(parsed![0]).toMatchObject({
      kind: 'fill',
      selector: 'input[formcontrolname="firstName"]',
      index: 1,
      value: 'Contact',
    });
  });

  it('omits index 0 (equivalent to the default first match)', () => {
    const code = buildWorkflowScript([
      { id: 'y', kind: 'fill', selector: 'input', index: 0, value: 'v' },
    ]);
    expect(code).not.toContain('"index"');
  });

  it('round-trips a fill-step random generator', () => {
    const code = buildWorkflowScript([
      { id: 'g', kind: 'fill', selector: '#name', generator: 'fullName', value: 'Jane Doe' },
    ]);
    expect(code).toContain('"generator": "fullName"');
    const parsed = parseWorkflowScript(code);
    expect(parsed![0]).toMatchObject({ kind: 'fill', generator: 'fullName', value: 'Jane Doe' });
  });

  it('omits a custom (static) generator from the script', () => {
    const code = buildWorkflowScript([
      { id: 'c', kind: 'fill', selector: '#x', generator: 'custom', value: 'static' },
    ]);
    expect(code).not.toContain('"generator"');
  });
});

describe('new step kinds', () => {
  it('newStep gives sensible defaults', () => {
    expect(newStep('clickEl').selector).toBe('');
    expect(newStep('waitEl').selector).toBe('');
    expect(newStep('press').key).toBe('Enter');
    expect(newStep('runjs').code).toBe('');
  });

  it('buildWorkflowScript wires every new kind into the interpreter', () => {
    const code = buildWorkflowScript([
      { id: '1', kind: 'clickEl', selector: '.save' },
      { id: '2', kind: 'waitEl', selector: '.ready', ms: 8000 },
      { id: '3', kind: 'press', key: 'Enter' },
      { id: '4', kind: 'runjs', code: 'window.scrollTo(0, 0);' },
    ]);
    expect(code).toContain('clickEl(step)');
    expect(code).toContain('waitForVisible(step)');
    expect(code).toContain('pressKey(step)');
    expect(code).toContain('runJs(step)');
    expect(code).toContain('"key": "Enter"');
    expect(code).toContain('window.scrollTo(0, 0);');
    expect(code).toContain('"ms": 8000');
  });

  it('round-trips each new kind', () => {
    const input: WorkflowStep[] = [
      { id: '1', kind: 'clickEl', selector: '.save', index: 2 },
      { id: '2', kind: 'waitEl', selector: '.ready', ms: 8000 },
      { id: '3', kind: 'press', key: 'Escape', selector: '#field' },
      { id: '4', kind: 'runjs', code: 'document.title = "x";' },
    ];
    const parsed = parseWorkflowScript(buildWorkflowScript(input));
    expect(parsed!.map((s) => s.kind)).toEqual(['clickEl', 'waitEl', 'press', 'runjs']);
    expect(parsed![0]).toMatchObject({ kind: 'clickEl', selector: '.save', index: 2 });
    expect(parsed![1]).toMatchObject({ kind: 'waitEl', selector: '.ready', ms: 8000 });
    expect(parsed![2]).toMatchObject({ kind: 'press', key: 'Escape', selector: '#field' });
    expect(parsed![3]).toMatchObject({ kind: 'runjs', code: 'document.title = "x";' });
  });

  it('serializes only the relevant keys per kind', () => {
    expect(buildWorkflowScript([{ id: '1', kind: 'press', key: 'Enter' }])).not.toContain(
      '"value"'
    );
    expect(buildWorkflowScript([{ id: '1', kind: 'runjs', code: 'x' }])).not.toContain('"label"');
    // waitEl omits a zero/absent timeout.
    expect(buildWorkflowScript([{ id: '1', kind: 'waitEl', selector: '.x' }])).not.toContain(
      '"ms"'
    );
  });

  it('still parses a legacy 6-kind script (backward-compatible)', () => {
    const legacy = buildWorkflowScript([
      { id: 'a', kind: 'click', text: 'Save' },
      { id: 'b', kind: 'fill', label: 'Name', value: 'x' },
    ]);
    const parsed = parseWorkflowScript(legacy);
    expect(parsed!.map((s) => s.kind)).toEqual(['click', 'fill']);
  });
});

describe('fieldToStep', () => {
  function field(overrides: Partial<PickedField> = {}): PickedField {
    return {
      id: 'fld_1',
      selector: '#f',
      fieldType: 'text',
      label: 'Field',
      hint: '',
      generator: 'firstName',
      ...overrides,
    };
  }

  it('maps a text field to a Fill step preserving the generator', () => {
    expect(fieldToStep(field())).toMatchObject({
      kind: 'fill',
      selector: '#f',
      generator: 'firstName',
    });
  });

  it('maps a custom text field to a Fill step with the static value', () => {
    expect(fieldToStep(field({ generator: 'custom', customValue: 'ABC' }))).toMatchObject({
      kind: 'fill',
      generator: 'custom',
      value: 'ABC',
    });
  });

  it('maps a checkbox to a Check step', () => {
    expect(fieldToStep(field({ fieldType: 'checkbox', generator: 'check' }))).toMatchObject({
      kind: 'check',
      checked: true,
    });
    expect(fieldToStep(field({ fieldType: 'checkbox', generator: 'uncheck' }))).toMatchObject({
      kind: 'check',
      checked: false,
    });
  });

  it('maps a select to a Select step with an option mode', () => {
    expect(fieldToStep(field({ fieldType: 'select', generator: 'pickFirst' }))).toMatchObject({
      kind: 'select',
      optionMode: 'first',
    });
    expect(fieldToStep(field({ fieldType: 'combobox', generator: 'pickRandom' }))).toMatchObject({
      kind: 'select',
      optionMode: 'random',
    });
  });

  it('maps a radio to a Radio step', () => {
    expect(fieldToStep(field({ fieldType: 'radio' })).kind).toBe('radio');
  });
});
