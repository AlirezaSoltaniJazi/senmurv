import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  buildLocalePool,
  buildWorkflowScript,
  fieldToStep,
  isWorkflowScript,
  moveStepRelative,
  newStep,
  parseWorkflowScript,
  toAwaitableScript,
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

describe('buildLocalePool', () => {
  it('returns an empty pool when no step uses a locale-sensitive generator', async () => {
    const pool = await buildLocalePool(
      [
        { id: 'a', kind: 'click', text: 'Continue' },
        { id: 'b', kind: 'fill', selector: '#x', value: 'static text' },
        { id: 'c', kind: 'fill', selector: '#n', generator: 'uuid' },
      ],
      'en_GB'
    );
    expect(pool).toEqual({});
  });

  it('pools every locale-sensitive generator kind actually used, and only those', async () => {
    const pool = await buildLocalePool(
      [
        { id: 'a', kind: 'fill', selector: '#city', generator: 'city' },
        { id: 'b', kind: 'fill', selector: '#post', generator: 'postalCode' },
        { id: 'c', kind: 'fill', selector: '#num', generator: 'number' }, // not locale-sensitive
      ],
      'en_GB'
    );
    expect(Object.keys(pool).sort()).toEqual(['city', 'postalCode']);
    expect(pool.city!.length).toBeGreaterThan(0);
    expect(pool.city!.every((v) => typeof v === 'string' && v.length > 0)).toBe(true);
    expect(pool.postalCode!.length).toBeGreaterThan(0);
  });

  it('pools firstName + lastName for fullName or email steps, not a "fullName"/"email" key', async () => {
    const pool = await buildLocalePool(
      [{ id: 'a', kind: 'fill', selector: '#name', generator: 'fullName' }],
      'en_GB'
    );
    expect(Object.keys(pool).sort()).toEqual(['firstName', 'lastName']);

    const emailPool = await buildLocalePool(
      [{ id: 'a', kind: 'fill', selector: '#email', generator: 'email', genArg: 'fl' }],
      'en_GB'
    );
    expect(Object.keys(emailPool).sort()).toEqual(['firstName', 'lastName']);
  });

  it('draws from the requested locale (a different locale yields a different-shaped sample set)', async () => {
    const gb = await buildLocalePool(
      [{ id: 'a', kind: 'fill', selector: '#c', generator: 'city' }],
      'en_GB'
    );
    const de = await buildLocalePool(
      [{ id: 'a', kind: 'fill', selector: '#c', generator: 'city' }],
      'de'
    );
    // Not asserting exact values (faker's own data, not ours to pin down) —
    // just that the two locales don't produce the identical sample set.
    expect(gb.city).not.toEqual(de.city);
  });
});

describe('buildWorkflowScript', () => {
  it('emits a runnable IIFE with a STEPS array and the interpreter', () => {
    const code = buildWorkflowScript(steps);
    // The IIFE is published on a global so the runner can await the flow to completion.
    expect(code.trim().startsWith('window.__SENMURV_FLOW__ = (async () =>')).toBe(true);
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
    expect(code).toContain('hud.finish(okCount, skipped.length, stopped)');
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

describe('step name round-trip', () => {
  it('serializes an optional name and parses it back', () => {
    const named: WorkflowStep[] = [
      { id: 'x', kind: 'click', text: 'Save', name: 'Submit the form' },
    ];
    const code = buildWorkflowScript(named);
    expect(code).toContain('"name": "Submit the form"');
    const parsed = parseWorkflowScript(code);
    expect(parsed?.[0]?.name).toBe('Submit the form');
  });

  it('omits an empty name', () => {
    const code = buildWorkflowScript([{ id: 'x', kind: 'wait', ms: 10, name: '' }]);
    expect(code).not.toContain('"name"');
  });
});

describe('moveStepRelative', () => {
  const ids = (list: WorkflowStep[]): string[] => list.map((s) => s.id);

  it('moves a step after a target', () => {
    expect(ids(moveStepRelative(steps, 'a', 'c', 'after'))).toEqual(['b', 'c', 'a', 'd', 'e', 'f']);
  });

  it('moves a step before a target', () => {
    expect(ids(moveStepRelative(steps, 'f', 'b', 'before'))).toEqual([
      'a',
      'f',
      'b',
      'c',
      'd',
      'e',
    ]);
  });

  it('handles moving forward vs backward consistently', () => {
    // 'c' after 'e' (forward): b/d shift left, c lands right after e.
    expect(ids(moveStepRelative(steps, 'c', 'e', 'after'))).toEqual(['a', 'b', 'd', 'e', 'c', 'f']);
  });

  it('is a no-op for equal, missing, or unknown ids', () => {
    expect(moveStepRelative(steps, 'a', 'a', 'after')).toBe(steps);
    expect(moveStepRelative(steps, 'zzz', 'a', 'after')).toBe(steps);
    expect(moveStepRelative(steps, 'a', 'zzz', 'before')).toBe(steps);
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

  it('drops an UNKNOWN generator from an imported STEPS array (would crash the Recorder render)', () => {
    // A hand-edited / foreign script whose fill step names a generator that is not
    // a real GeneratorId. Before the guard this reached GENERATOR_LABELS[id] ==
    // undefined and threw on .toLowerCase(); now the id is dropped, non-lossily —
    // the static value is preserved so the step falls back to the "custom" dropdown.
    const code = `const STEPS = [{ kind: 'fill', selector: '#x', generator: 'bogusGen', value: 'keepme' }];`;
    const parsed = parseWorkflowScript(code);
    expect(parsed![0]).toMatchObject({ kind: 'fill', selector: '#x', value: 'keepme' });
    expect(parsed![0]!.generator).toBeUndefined();
  });

  it('keeps a KNOWN generator on an imported STEPS array unchanged', () => {
    const code = `const STEPS = [{ kind: 'fill', selector: '#e', generator: 'email' }];`;
    expect(parseWorkflowScript(code)![0]).toMatchObject({ kind: 'fill', generator: 'email' });
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

  it('bakes an empty RND_POOL when no localePool option is given', () => {
    const code = buildWorkflowScript([
      { id: '1', kind: 'fill', selector: '#c', generator: 'city' },
    ]);
    expect(code).toContain('const RND_POOL = {};');
    expect(code).toContain('poolPick');
    expect(() => new vm.Script(code)).not.toThrow();
  });

  it('bakes a given localePool as RND_POOL, so a saved script carries its own locale data', () => {
    const code = buildWorkflowScript(
      [{ id: '1', kind: 'fill', selector: '#c', generator: 'city' }],
      { localePool: { city: ['Tokyo', 'Osaka', 'Kyoto'] } }
    );
    expect(code).toContain('"city":["Tokyo","Osaka","Kyoto"]');
    expect(() => new vm.Script(code)).not.toThrow();
  });
});

describe('flow run popup (HUD) auto-close', () => {
  it('bakes the default 3s delay when no option is given', () => {
    const code = buildWorkflowScript([{ id: '1', kind: 'wait', ms: 10 }]);
    expect(code).toContain('const HUD_MS = 3000;');
    // The HUD removes itself on the baked delay (no hardcoded 6000/15000 split).
    expect(code).toContain('}, HUD_MS);');
  });

  it('bakes a configured delay (seconds → ms)', () => {
    const code = buildWorkflowScript([{ id: '1', kind: 'wait', ms: 10 }], { hudSeconds: 1 });
    expect(code).toContain('const HUD_MS = 1000;');
    const long = buildWorkflowScript([{ id: '1', kind: 'wait', ms: 10 }], { hudSeconds: 12 });
    expect(long).toContain('const HUD_MS = 12000;');
  });
});

describe('element-find timeout (FIND_MS)', () => {
  it('bakes the default 10s and uses it as the waitFor default', () => {
    const code = buildWorkflowScript([{ id: '1', kind: 'fill', selector: '#x', value: 'v' }]);
    expect(code).toContain('const FIND_MS = 10000;');
    expect(code).toContain('function waitFor(fn, desc, timeout = FIND_MS');
    expect(code).not.toContain('timeout = 15000'); // no lingering hard-coded default
    expect(code).not.toContain(': 15000'); // waitForVisible fallback also uses FIND_MS
  });

  it('bakes a configured find timeout (seconds → ms)', () => {
    const code = buildWorkflowScript([{ id: '1', kind: 'wait', ms: 5 }], { findTimeoutSeconds: 2 });
    expect(code).toContain('const FIND_MS = 2000;');
  });
});

describe('stoppable flow runner', () => {
  it('resets the stop flag at run start and checks it between steps', () => {
    const code = buildWorkflowScript([{ id: '1', kind: 'wait', ms: 5 }]);
    expect(code).toContain('window.__senmurvFlowStop = false;'); // reset per run
    expect(code).toContain('const stopRequested = ()');
    expect(code).toContain('if (stopRequested()) break;'); // loop honours it
    expect(code).toContain('hud.finish(okCount, skipped.length, stopped)');
  });

  it('makes sleep and waitFor abort-aware, and stays valid JS', () => {
    const code = buildWorkflowScript([{ id: '1', kind: 'wait', ms: 5 }]);
    expect(code).toContain('if (stopRequested()) return resolve();'); // sleep bails early
    expect(code).toContain("if (stopRequested()) return reject(new Error('stopped'));"); // waitFor bails
    expect(() => new vm.Script(code)).not.toThrow();
  });
});

describe('awaitable flow', () => {
  it('publishes the flow promise on a global so a run can be awaited to completion', () => {
    const code = buildWorkflowScript([{ id: '1', kind: 'wait', ms: 5 }]);
    expect(code).toContain('window.__SENMURV_FLOW__ = (async () =>');
    expect(() => new vm.Script(code)).not.toThrow();
  });

  it('toAwaitableScript upgrades an OLD bare-IIFE flow at run time', () => {
    const old = '(async () => {\n  const STEPS = [];\n})();';
    const upgraded = toAwaitableScript(old);
    expect(upgraded).toBe(`window.__SENMURV_FLOW__ = ${old}`);
    expect(() => new vm.Script(upgraded)).not.toThrow();
  });

  it('toAwaitableScript is a no-op for already-published or non-IIFE scripts', () => {
    const already = buildWorkflowScript([{ id: '1', kind: 'wait', ms: 5 }]);
    expect(toAwaitableScript(already)).toBe(already); // already publishes the global
    const plain = "console.log('hi'); doThing();";
    expect(toAwaitableScript(plain)).toBe(plain); // not a leading async IIFE
  });
});

describe('genArg tokens (Number digits / Email name-sync)', () => {
  it('emits a digit-count Number as {random:number:dMIN-MAX} and round-trips genArg', () => {
    const code = buildWorkflowScript([
      { id: 'n', kind: 'fill', selector: '#n', generator: 'number', genArg: 'd3-5' },
    ]);
    expect(code).toContain('"value": "{random:number:d3-5}"');
    const parsed = parseWorkflowScript(code);
    expect(parsed![0]).toMatchObject({ kind: 'fill', generator: 'number', genArg: 'd3-5' });
    expect(parsed![0]!.value).toBeUndefined();
    // Re-building preserves the bound.
    expect(buildWorkflowScript(parsed!)).toContain('"value": "{random:number:d3-5}"');
  });

  it('emits a name-synced Email as {random:email:fl} and round-trips genArg', () => {
    const code = buildWorkflowScript([
      { id: 'e', kind: 'fill', selector: '#e', generator: 'email', genArg: 'fl' },
    ]);
    expect(code).toContain('"value": "{random:email:fl}"');
    const parsed = parseWorkflowScript(code);
    expect(parsed![0]).toMatchObject({ kind: 'fill', generator: 'email', genArg: 'fl' });
  });

  it('keeps a legacy value-range {random:number:1-99} token literal (unchanged behaviour)', () => {
    const code = `const STEPS = [{ kind: 'fill', selector: '#n', value: '{random:number:1-99}' }];`;
    const parsed = parseWorkflowScript(code);
    expect(parsed![0]!.generator).toBeUndefined();
    expect(parsed![0]!.value).toBe('{random:number:1-99}');
  });

  it('drops a stale genArg when re-serialized under a non-number/email generator', () => {
    // A fullName step should never carry a digit/sync arg into its token.
    const code = buildWorkflowScript([
      { id: 'g', kind: 'fill', selector: '#f', generator: 'fullName' },
    ]);
    expect(code).toContain('"value": "{random:fullName}"');
  });
});

describe('region + shared-person runner', () => {
  it('emits a {random:region} token and the in-page resolver knows it', () => {
    const code = buildWorkflowScript([
      { id: 'r', kind: 'fill', selector: '#region', generator: 'region' },
    ]);
    expect(code).toContain('"value": "{random:region}"');
    expect(code).toContain("case 'region'");
    expect(parseWorkflowScript(code)![0]).toMatchObject({ kind: 'fill', generator: 'region' });
  });

  it('emits a {random:city} token and the in-page resolver knows it', () => {
    const code = buildWorkflowScript([
      { id: 'c', kind: 'fill', selector: '#city', generator: 'city' },
    ]);
    expect(code).toContain('"value": "{random:city}"');
    expect(code).toContain("case 'city'");
    expect(parseWorkflowScript(code)![0]).toMatchObject({ kind: 'fill', generator: 'city' });
  });

  it('emits a {random:uuid} token and the in-page resolver knows it', () => {
    const code = buildWorkflowScript([
      { id: 'u', kind: 'fill', selector: '#uuid', generator: 'uuid' },
    ]);
    expect(code).toContain('"value": "{random:uuid}"');
    expect(code).toContain("case 'uuid'");
    expect(parseWorkflowScript(code)![0]).toMatchObject({ kind: 'fill', generator: 'uuid' });
  });

  it('embeds one shared person so name fields and a synced email agree at run time', () => {
    const code = buildWorkflowScript([
      { id: '1', kind: 'fill', selector: '#f', generator: 'firstName' },
      { id: '2', kind: 'fill', selector: '#e', generator: 'email', genArg: 'fl' },
    ]);
    // The runner memoizes a single {first,last} and the email builds from it.
    expect(code).toContain('var person = ()');
    expect(code).toContain('emailValue');
    expect(() => new vm.Script(code)).not.toThrow();
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
