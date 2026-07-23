import vm from 'node:vm';
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

  it('drives a live progress HUD and no longer blocks with an alert', () => {
    const code = buildWorkflowScript(steps);
    expect(code).toContain('createHud(STEPS)');
    expect(code).toContain('hud.setRunning(i)');
    expect(code).toContain('hud.setOk(i)');
    expect(code).toContain('hud.setFail(i, e.message)');
    expect(code).toContain('hud.finish(okCount, skipped.length)');
    expect(code).not.toContain('alert(');
  });

  it('fails a click when the button is not found (no silent success)', () => {
    const code = buildWorkflowScript(steps);
    expect(code).toContain("throw new Error('button not found:");
    expect(code).not.toContain('button not found, skipping');
  });

  it('scrolls each step target into view before acting on it', () => {
    const code = buildWorkflowScript(steps);
    // The reveal() helper is defined and used by the fill / checkbox interpreters.
    expect(code).toContain("el.scrollIntoView({ block: 'center', inline: 'nearest' })");
    expect(code).toContain('reveal(input)');
    expect(code).toContain('reveal(el)');
  });

  it('scans the page (scrolls) while a target is not yet found', () => {
    const code = buildWorkflowScript(steps);
    expect(code).toContain('scanStep');
    expect(code).toContain('window.innerHeight');
    expect(code).toContain("behavior: 'smooth'");
  });

  it('generates syntactically valid JS across every step kind', () => {
    const code = buildWorkflowScript([
      { id: '1', kind: 'click', text: 'Save' },
      { id: '2', kind: 'clickEl', selector: '.x' },
      { id: '3', kind: 'wait', ms: 100 },
      { id: '4', kind: 'waitEl', selector: '.y', ms: 5000 },
      { id: '5', kind: 'press', key: 'Enter' },
      { id: '6', kind: 'fill', selector: '#z', value: 'v' },
      { id: '7', kind: 'select', selector: 'sel', optionMode: 'first' },
      { id: '8', kind: 'radio', selector: 'r', value: 'a' },
      { id: '9', kind: 'check', selector: 'c', checked: true },
      { id: '10', kind: 'runjs', code: 'void 0;' },
    ]);
    // Compile-only (no execution) — catches any syntax error in the generated
    // interpreter / HUD string.
    expect(() => new vm.Script(code)).not.toThrow();
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

  it('emits a random fill generator as an in-page {random:…} token (re-randomizes each run)', () => {
    const code = buildWorkflowScript([
      { id: 'g', kind: 'fill', selector: '#name', generator: 'fullName', value: 'Jane Doe' },
    ]);
    // The static value is replaced by a token — nothing is baked/frozen.
    expect(code).toContain('"value": "{random:fullName}"');
    expect(code).not.toContain('"generator"');
    expect(code).not.toContain('Jane Doe');
    const parsed = parseWorkflowScript(code);
    expect(parsed![0]).toMatchObject({ kind: 'fill', generator: 'fullName' });
    expect(parsed![0]!.value).toBeUndefined();
  });

  it('keeps a custom (static) fill value literal, with no generator/token', () => {
    const code = buildWorkflowScript([
      { id: 'c', kind: 'fill', selector: '#x', generator: 'custom', value: 'static' },
    ]);
    expect(code).toContain('"value": "static"');
    expect(code).not.toContain('"generator"');
    // The step's value must not be a random token (the resolver itself mentions
    // {random:…} in its comments/regex, so scope the check to the STEPS value).
    expect(code).not.toContain('"value": "{random:');
  });

  it('keeps a ranged {random:number:1-99} token literal (does not drop the bound)', () => {
    const step: WorkflowStep = {
      id: 'r',
      kind: 'fill',
      selector: '#n',
      value: '{random:number:1-99}',
    };
    const code = buildWorkflowScript([step]);
    expect(code).toContain('"value": "{random:number:1-99}"');
    const parsed = parseWorkflowScript(code);
    // A token WITH an arg stays a literal value (the generator dropdown has nowhere
    // to hold the arg), so it must NOT collapse to generator:'number'.
    expect(parsed![0]!.generator).toBeUndefined();
    expect(parsed![0]!.value).toBe('{random:number:1-99}');
    // Re-saving keeps the 1-99 bound instead of re-emitting an unbounded token.
    expect(buildWorkflowScript(parsed!)).toContain('"value": "{random:number:1-99}"');
  });

  it('emits the phoneIntl generator as a {random:phoneIntl} token and round-trips it', () => {
    const code = buildWorkflowScript([
      { id: 'p', kind: 'fill', selector: '#tel', generator: 'phoneIntl' },
    ]);
    expect(code).toContain('"value": "{random:phoneIntl}"');
    // The in-page resolver must know the token (Ofcom reserved NSN, no trunk 0).
    expect(code).toContain("case 'phoneIntl'");
    expect(parseWorkflowScript(code)![0]).toMatchObject({ kind: 'fill', generator: 'phoneIntl' });
  });

  it('still collapses a BARE {random:number} token to the generator dropdown', () => {
    const code = buildWorkflowScript([
      { id: 'b', kind: 'fill', selector: '#n', value: '{random:number}' },
    ]);
    const parsed = parseWorkflowScript(code);
    expect(parsed![0]).toMatchObject({ kind: 'fill', generator: 'number' });
    expect(parsed![0]!.value).toBeUndefined();
  });

  it('round-trips control characters (\\uXXXX / \\b / \\f escapes) without corruption', () => {
    const raw = 'a\u000bb\u0008c\u000cd\u0000e'; // vertical tab, backspace, form feed, NUL
    const code = buildWorkflowScript([{ id: 'u', kind: 'fill', selector: '#c', value: raw }]);
    expect(parseWorkflowScript(code)![0]!.value).toBe(raw);
  });

  it('embeds the in-page random resolver so tokens work in a saved script', () => {
    const code = buildWorkflowScript([
      { id: '1', kind: 'fill', selector: '#e', generator: 'email' },
    ]);
    expect(code).toContain('"value": "{random:email}"');
    expect(code).toContain('function randomValue');
    expect(code).toContain('random:([a-zA-Z]+)');
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

describe('disabled steps', () => {
  it('round-trips a disabled step and wires the interpreter to skip it', () => {
    const code = buildWorkflowScript([
      { id: '1', kind: 'fill', selector: '#a', value: 'x', disabled: true },
      { id: '2', kind: 'click', text: 'Save' },
    ]);
    expect(code).toContain('"disabled": true');
    expect(code).toContain('if (step.disabled) continue;');
    const parsed = parseWorkflowScript(code);
    expect(parsed![0]).toMatchObject({ kind: 'fill', disabled: true });
    expect(parsed![1]!.disabled).toBeUndefined();
  });

  it('omits the disabled flag for enabled steps', () => {
    const code = buildWorkflowScript([{ id: '1', kind: 'click', text: 'Go' }]);
    expect(code).not.toContain('"disabled"');
  });

  it('counts only enabled steps in the run-HUD total', () => {
    const code = buildWorkflowScript([
      { id: '1', kind: 'click', text: 'A', disabled: true },
      { id: '2', kind: 'click', text: 'B' },
    ]);
    expect(code).toContain('if (!steps[ti].disabled) total += 1;');
  });

  it('generates syntactically valid JS with a disabled step present', () => {
    const code = buildWorkflowScript([
      { id: '1', kind: 'fill', selector: '#a', value: 'x', disabled: true },
      { id: '2', kind: 'click', text: 'B' },
    ]);
    expect(() => new vm.Script(code)).not.toThrow();
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

describe('parseWorkflowScript — hand-written STEPS', () => {
  it('parses a JS-object array (single quotes, unquoted keys, comments, trailing comma, embedded quotes)', () => {
    const code = `(async () => {
  const STEPS = [
    // ---- Demographics (mandatory) ----
    { kind: 'fill', selector: 'input[aria-label="Mobile number input"]', index: 0, value: '7700900123' },
    { kind: 'select', selector: 'mat-select[formcontrolname="gender"]', optionMode: 'first' },
    { kind: 'fill', label: 'Home treatment start date', value: '{today+1}' },
    { kind: 'check', label: 'Patient consent obtained', checked: true },
  ];
  const FLOW = 'LIGHT';
})();`;
    const parsed = parseWorkflowScript(code);
    expect(parsed).not.toBeNull();
    expect(parsed!.map((s) => s.kind)).toEqual(['fill', 'select', 'fill', 'check']);
    // The single-quoted selector keeps its embedded double quotes intact.
    expect(parsed![0]).toMatchObject({
      kind: 'fill',
      selector: 'input[aria-label="Mobile number input"]',
      value: '7700900123',
    });
    expect(parsed![1]).toMatchObject({ kind: 'select', optionMode: 'first' });
    expect(parsed![2]).toMatchObject({ kind: 'fill', value: '{today+1}' });
    expect(parsed![3]).toMatchObject({ kind: 'check', checked: true });
  });

  it('the generated engine resolves {today} date tokens at run time', () => {
    const code = buildWorkflowScript([
      { id: '1', kind: 'fill', selector: '#d', value: '{today+1}' },
    ]);
    expect(code).toContain('function resolveValue');
    expect(code).toContain('resolveValue(step.value)');
  });

  it('parses a hand-written {random:…} token back into a random generator', () => {
    const code = `const STEPS = [{ kind: 'fill', selector: '#p', value: '{random:phone}' }];`;
    const parsed = parseWorkflowScript(code);
    expect(parsed![0]).toMatchObject({ kind: 'fill', generator: 'phone' });
    expect(parsed![0]!.value).toBeUndefined();
  });

  it('leaves an unknown {random:…} token as a literal static value', () => {
    const code = `const STEPS = [{ kind: 'fill', selector: '#p', value: '{random:bogus}' }];`;
    const parsed = parseWorkflowScript(code);
    expect(parsed![0]).toMatchObject({ kind: 'fill', value: '{random:bogus}' });
    expect(parsed![0]!.generator).toBeUndefined();
  });

  it('does not treat a {random:…} value on a non-fill step as a generator', () => {
    const code = `const STEPS = [{ kind: 'radio', value: '{random:phone}' }];`;
    const parsed = parseWorkflowScript(code);
    expect(parsed![0]).toMatchObject({ kind: 'radio', value: '{random:phone}' });
    expect(parsed![0]!.generator).toBeUndefined();
  });
});
