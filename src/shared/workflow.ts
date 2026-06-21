import type { PickedField } from '@/shared/types';
import { newId } from '@/utils/id';

/** What the Scripts "Customize" button hands to the Fill tab. */
export type FillSeed =
  | { mode: 'fields'; fields: PickedField[] }
  | { mode: 'flow'; steps: WorkflowStep[] };

/** A workflow step kind. */
export type StepKind = 'click' | 'wait' | 'fill' | 'select' | 'check';

/** How a `select` step chooses its option. */
export type SelectMode = 'text' | 'first' | 'random';

/**
 * One step in a Fill "Flow". Targets a field by its `label` (mat-label text) or
 * by a CSS `selector`; `click` targets a button by visible `text`.
 */
export interface WorkflowStep {
  id: string;
  kind: StepKind;
  text?: string; // click: button text
  ms?: number; // wait: milliseconds
  label?: string; // fill/select/check: mat-label text
  selector?: string; // fill/select/check: CSS selector (alternative to label)
  value?: string; // fill: value to type; select(text): option text
  optionMode?: SelectMode; // select
  checked?: boolean; // check
}

export const STEP_KINDS: StepKind[] = ['click', 'wait', 'fill', 'select', 'check'];

export const STEP_KIND_LABELS: Record<StepKind, string> = {
  click: 'Click button',
  wait: 'Wait',
  fill: 'Fill field',
  select: 'Select option',
  check: 'Checkbox',
};

/** Create a step of `kind` with sensible defaults. */
export function newStep(kind: StepKind): WorkflowStep {
  const base = { id: newId('stp_'), kind } as WorkflowStep;
  switch (kind) {
    case 'click':
      return { ...base, text: '' };
    case 'wait':
      return { ...base, ms: 1000 };
    case 'fill':
      return { ...base, label: '', value: '' };
    case 'select':
      return { ...base, label: '', value: '', optionMode: 'text' };
    case 'check':
    default:
      return { ...base, label: '', checked: true };
  }
}

/** Short human description of a step, for the list. */
export function describeStep(s: WorkflowStep): string {
  const target = s.label || s.selector || '';
  switch (s.kind) {
    case 'click':
      return `Click “${s.text ?? ''}”`;
    case 'wait':
      return `Wait ${s.ms ?? 0} ms`;
    case 'fill':
      return `Fill ${target} = “${s.value ?? ''}”`;
    case 'select':
      return s.optionMode === 'text'
        ? `Select ${target} → “${s.value ?? ''}”`
        : `Select ${target} → ${s.optionMode} option`;
    case 'check':
      return `${s.checked ? 'Check' : 'Uncheck'} ${target}`;
    default:
      return s.kind;
  }
}

function serializeStep(s: WorkflowStep): Record<string, unknown> {
  const o: Record<string, unknown> = { kind: s.kind };
  if (s.kind === 'click') {
    o.text = s.text ?? '';
  } else if (s.kind === 'wait') {
    o.ms = s.ms ?? 0;
  } else {
    if (s.label) o.label = s.label;
    if (s.selector) o.selector = s.selector;
    if (s.kind === 'fill') o.value = s.value ?? '';
    if (s.kind === 'select') {
      o.value = s.value ?? '';
      o.optionMode = s.optionMode ?? 'text';
    }
    if (s.kind === 'check') o.checked = s.checked ?? true;
  }
  return o;
}

// Self-contained interpreter helpers, embedded into the generated script. Mirrors
// the proven hand-written automation helpers; uses string concatenation (no
// nested template literals) so nothing needs escaping at generation time.
const PREAMBLE = `const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  const isVisible = (el) => !!el && el.offsetParent !== null;
  function waitFor(fn, desc, timeout = 15000, interval = 200) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      (function poll() {
        let v = null; try { v = fn(); } catch (e) { v = null; }
        if (v) return resolve(v);
        if (Date.now() - start > timeout) return reject(new Error('Timed out waiting for ' + desc));
        setTimeout(poll, interval);
      })();
    });
  }
  function findButton(text) {
    const g = norm(text);
    const els = [...document.querySelectorAll('button, a')].filter(isVisible);
    return els.find((b) => norm(b.textContent) === g) || els.find((b) => norm(b.textContent).includes(g));
  }
  async function clickButton(text) {
    const b = await waitFor(() => findButton(text), 'button "' + text + '"');
    b.click();
    await sleep(400);
  }
  function resolveField(step, sel) {
    if (step.label) {
      const g = norm(step.label);
      for (const f of document.querySelectorAll('mat-form-field, .mat-mdc-form-field')) {
        const lbl = f.querySelector('mat-label');
        if (!lbl || norm(lbl.textContent) !== g) continue;
        const ctrl = f.querySelector(sel);
        if (ctrl && isVisible(ctrl)) return ctrl;
      }
      return null;
    }
    if (step.selector) return document.querySelector(step.selector);
    return null;
  }
  async function setInput(step) {
    const input = await waitFor(() => resolveField(step, 'input, textarea'), 'input ' + (step.label || step.selector));
    const iSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const tSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    input.focus();
    (input.tagName === 'TEXTAREA' ? tSet : iSet).call(input, step.value || '');
    for (const t of ['input', 'change', 'blur']) input.dispatchEvent(new Event(t, { bubbles: true }));
  }
  async function setSelect(step) {
    const el = await waitFor(() => resolveField(step, 'mat-select, select'), 'select ' + (step.label || step.selector));
    const pick = (opts) => {
      if (!opts.length) return null;
      if (step.optionMode === 'first') return opts[0];
      if (step.optionMode === 'random') return opts[Math.floor(Math.random() * opts.length)];
      const g = norm(step.value);
      return opts.find((o) => norm(o.textContent) === g) || opts.find((o) => norm(o.textContent).includes(g));
    };
    if (el.tagName.toLowerCase() === 'select') {
      const opts = [...el.options].filter((o) => !o.disabled && o.value !== '');
      const o = pick(opts);
      if (o) {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, o.value);
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }
    (el.querySelector('.mat-mdc-select-trigger') || el).click();
    await sleep(350);
    const opt = await waitFor(() => pick([...document.querySelectorAll('mat-option')].filter(isVisible)), 'option "' + (step.value || step.optionMode) + '"');
    opt.click();
    await sleep(300);
  }
  async function setCheck(step) {
    const el = await waitFor(() => resolveField(step, 'input[type="checkbox"], mat-checkbox'), 'checkbox ' + (step.label || step.selector));
    const box = el.matches && el.matches('input[type="checkbox"]') ? el : (el.querySelector('input[type="checkbox"]') || el);
    if (!!box.checked !== !!step.checked) { box.click(); }
  }`;

/**
 * Emit a runnable workflow script that interprets the embedded `STEPS` array.
 * Shared by Flow's Generate & Run / Copy / Save, and round-trippable via
 * {@link parseWorkflowScript}.
 */
export function buildWorkflowScript(steps: WorkflowStep[]): string {
  const data = JSON.stringify(steps.map(serializeStep), null, 2);
  return `(async () => {
  const STEPS = ${data};
  ${PREAMBLE}
  try {
    for (const step of STEPS) {
      if (step.kind === 'click') await clickButton(step.text);
      else if (step.kind === 'wait') await sleep(step.ms);
      else if (step.kind === 'fill') await setInput(step);
      else if (step.kind === 'select') await setSelect(step);
      else if (step.kind === 'check') await setCheck(step);
      console.info('[flow] ok:', step.kind, step.label || step.text || step.selector || step.ms);
    }
    console.info('[flow] done.');
  } catch (e) {
    console.error('[flow] failed:', e);
    alert('Flow failed: ' + e.message + ' — see the console.');
  }
})();`;
}

/** Was this script produced by the Flow builder (has a STEPS array)? */
export function isWorkflowScript(code: string): boolean {
  return /const STEPS\s*=\s*\[/.test(code);
}

function toStep(item: unknown): WorkflowStep | null {
  if (typeof item !== 'object' || item === null) return null;
  const o = item as Record<string, unknown>;
  if (!STEP_KINDS.includes(o.kind as StepKind)) return null;
  const step: WorkflowStep = { id: newId('stp_'), kind: o.kind as StepKind };
  if (typeof o.text === 'string') step.text = o.text;
  if (typeof o.ms === 'number') step.ms = o.ms;
  if (typeof o.label === 'string') step.label = o.label;
  if (typeof o.selector === 'string') step.selector = o.selector;
  if (typeof o.value === 'string') step.value = o.value;
  if (o.optionMode === 'text' || o.optionMode === 'first' || o.optionMode === 'random') {
    step.optionMode = o.optionMode;
  }
  if (typeof o.checked === 'boolean') step.checked = o.checked;
  return step;
}

/** Reverse of {@link buildWorkflowScript}: rebuild editable steps, or null. */
export function parseWorkflowScript(code: string): WorkflowStep[] | null {
  const match = /const STEPS\s*=\s*(\[[\s\S]*?\n\]);/.exec(code);
  if (!match) return null;
  let arr: unknown;
  try {
    arr = JSON.parse(match[1]!);
  } catch {
    return null;
  }
  if (!Array.isArray(arr)) return null;
  const steps: WorkflowStep[] = [];
  for (const item of arr) {
    const step = toStep(item);
    if (step) steps.push(step);
  }
  return steps.length > 0 ? steps : null;
}
