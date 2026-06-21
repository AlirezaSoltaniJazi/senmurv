import type { GeneratorId, PickedField } from '@/shared/types';
import { newId } from '@/utils/id';

/** What the Scripts "Customize" button hands to the Fill tab. */
export type FillSeed =
  | { mode: 'fields'; fields: PickedField[] }
  | { mode: 'flow'; steps: WorkflowStep[] };

/** A workflow step kind. */
export type StepKind = 'click' | 'wait' | 'fill' | 'select' | 'radio' | 'check';

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
  label?: string; // fill/select/radio/check: mat-label text
  selector?: string; // fill/select/radio/check: CSS selector (alternative to label)
  value?: string; // fill: value to type; select(text)/radio: option text/value
  optionMode?: SelectMode; // select
  checked?: boolean; // check
  index?: number; // fill/select/radio/check: pick the Nth element matching `selector` (0-based)
  generator?: GeneratorId; // fill: random-value generator; falls back to the static `value`
}

export const STEP_KINDS: StepKind[] = ['click', 'wait', 'fill', 'select', 'radio', 'check'];

export const STEP_KIND_LABELS: Record<StepKind, string> = {
  click: 'Click button',
  wait: 'Wait',
  fill: 'Fill field',
  select: 'Select option',
  radio: 'Radio',
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
    case 'radio':
      return { ...base, label: '', value: '' };
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
      return s.generator && s.generator !== 'custom'
        ? `Fill ${target} = «random ${s.generator}»`
        : `Fill ${target} = “${s.value ?? ''}”`;
    case 'select':
      return s.optionMode === 'text'
        ? `Select ${target} → “${s.value ?? ''}”`
        : `Select ${target} → ${s.optionMode} option`;
    case 'radio':
      return `Radio ${target} → “${s.value ?? ''}”`;
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
    if (typeof s.index === 'number' && s.index > 0) o.index = s.index;
    if (s.kind === 'fill') {
      o.value = s.value ?? '';
      if (s.generator && s.generator !== 'custom') o.generator = s.generator;
    }
    if (s.kind === 'select') {
      o.value = s.value ?? '';
      o.optionMode = s.optionMode ?? 'text';
    }
    if (s.kind === 'radio') o.value = s.value ?? '';
    if (s.kind === 'check') o.checked = s.checked ?? true;
  }
  return o;
}

// Self-contained interpreter helpers, embedded into the generated script. Uses
// string concatenation (no nested template literals) so nothing needs escaping.
const PREAMBLE = `const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  const isVisible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const queryNth = (sel, i) => (typeof i === 'number' ? (document.querySelectorAll(sel)[i] || null) : document.querySelector(sel));
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
    const start = Date.now();
    let b = findButton(text);
    while (!b && Date.now() - start < 6000) { await sleep(200); b = findButton(text); }
    if (b) { b.click(); await sleep(500); return; }
    console.warn('[flow] button not found, skipping:', text);
  }
  function resolveField(step, sel) {
    if (step.selector) return queryNth(step.selector, step.index);
    if (step.label) {
      const g = norm(step.label);
      const fields = [...document.querySelectorAll('mat-form-field, .mat-mdc-form-field')];
      const find = (cmp) => {
        for (const f of fields) {
          const lbl = f.querySelector('mat-label');
          if (!lbl || !cmp(norm(lbl.textContent))) continue;
          const ctrl = f.querySelector(sel);
          if (ctrl && isVisible(ctrl)) return ctrl;
        }
        return null;
      };
      return find((t) => t === g) || find((t) => t.includes(g) || g.includes(t));
    }
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
  function pickOption(step, opts) {
    if (!opts.length) return null;
    if (step.optionMode === 'first') return opts[0];
    if (step.optionMode === 'random') return opts[Math.floor(Math.random() * opts.length)];
    const g = norm(step.value);
    return opts.find((o) => norm(o.textContent) === g)
      || opts.find((o) => (o.getAttribute('title') || '') === step.value)
      || opts.find((o) => norm(o.textContent).includes(g));
  }
  async function dismissOverlay() {
    if (document.querySelector('.cdk-overlay-backdrop')) {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      document.body.click();
      await sleep(300);
    }
  }
  async function setSelect(step) {
    const el = await waitFor(() => resolveField(step, 'mat-select, select, [role="combobox"]'), 'select ' + (step.label || step.selector));
    const tag = el.tagName.toLowerCase();
    if (tag === 'select') {
      const opts = [...el.options].filter((o) => !o.disabled && o.value !== '');
      const o = pickOption(step, opts);
      if (o) {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, o.value);
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }
    if (el.scrollIntoView) el.scrollIntoView({ block: 'center' });
    const optSel = 'mat-option, [role="option"], [role="listbox"] li';
    const open = () => {
      if (tag === 'input' && el.getAttribute('role') === 'combobox') {
        el.focus();
        if ((step.optionMode || 'text') === 'text' && step.value) {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, step.value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          el.click();
        }
      } else {
        const trg = el.querySelector('.mat-mdc-select-trigger') || el;
        trg.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        trg.click();
      }
    };
    let opt = null;
    for (let attempt = 0; attempt < 3 && !opt; attempt += 1) {
      await dismissOverlay(); // a previous select's backdrop can swallow this click
      open();
      const start = Date.now();
      while (!opt && Date.now() - start < 3000) {
        opt = pickOption(step, [...document.querySelectorAll(optSel)].filter(isVisible));
        if (!opt) await sleep(150);
      }
    }
    if (!opt) {
      const disabled = el.getAttribute('aria-disabled') === 'true' || (el.classList && el.classList.contains('mat-mdc-select-disabled'));
      throw new Error(disabled ? 'select is disabled (a prior field may be required first)' : 'opened but no options appeared');
    }
    opt.click();
    await sleep(300);
  }
  async function setRadio(step) {
    const click = (el) => { if (el) (el.matches && el.matches('input') ? el : (el.querySelector('input[type="radio"]') || el)).click(); };
    if (step.selector) {
      const el = await waitFor(() => queryNth(step.selector, step.index), 'radio ' + step.selector);
      click(el);
      await sleep(150);
      return;
    }
    const g = norm(step.value);
    const el = await waitFor(() => {
      const byVal = document.querySelector('mat-radio-button[value="' + (step.value || '') + '"], input[type="radio"][value="' + (step.value || '') + '"]');
      if (byVal) return byVal;
      const cands = [...document.querySelectorAll('mat-radio-button, [role="radio"], label')].filter(isVisible);
      return cands.find((x) => norm(x.textContent) === g) || cands.find((x) => norm(x.textContent).includes(g));
    }, 'radio "' + (step.value || '') + '"');
    click(el);
    await sleep(150);
  }
  async function setCheck(step) {
    const byText = () => {
      if (!step.label) return null;
      const g = norm(step.label);
      const cands = [...document.querySelectorAll('mat-checkbox, mat-slide-toggle, [role="checkbox"], [role="switch"]')].filter(isVisible);
      return cands.find((x) => norm(x.textContent).includes(g)) || null;
    };
    const el = await waitFor(() => resolveField(step, 'input[type="checkbox"], input.msos-checkbox, mat-checkbox, mat-slide-toggle, [role="checkbox"], [role="switch"]') || byText(), 'checkbox ' + (step.label || step.selector), 8000);
    const box = el.matches && el.matches('input') ? el : (el.querySelector('input[type="checkbox"], input.msos-checkbox') || el);
    const msos = box.closest && box.closest('li.msos-option');
    const on = !!box.checked || !!(msos && msos.classList.contains('msos-option-selected'));
    if (on !== !!step.checked) (box.click ? box : el).click();
  }`;

/**
 * Emit a runnable workflow script that interprets the embedded `STEPS` array.
 * Shared by Flow's Run / Copy / Save, and round-trippable via
 * {@link parseWorkflowScript}.
 */
export function buildWorkflowScript(steps: WorkflowStep[]): string {
  const data = JSON.stringify(steps.map(serializeStep), null, 2);
  return `(async () => {
  const STEPS = ${data};
  ${PREAMBLE}
  const skipped = [];
  let okCount = 0;
  for (const step of STEPS) {
    const tag = step.label || step.text || step.selector || (step.ms + 'ms');
    try {
      if (step.kind === 'click') await clickButton(step.text);
      else if (step.kind === 'wait') await sleep(step.ms);
      else if (step.kind === 'fill') await setInput(step);
      else if (step.kind === 'select') await setSelect(step);
      else if (step.kind === 'radio') await setRadio(step);
      else if (step.kind === 'check') await setCheck(step);
      okCount += 1;
      console.info('[flow] ok:', step.kind, tag);
    } catch (e) {
      skipped.push(step.kind + ' ' + tag + ' (' + e.message + ')');
      console.warn('[flow] SKIPPED:', step.kind, tag, '-', e.message);
    }
  }
  console.info('[flow] done. ok=' + okCount + ', skipped=' + skipped.length);
  if (skipped.length) {
    const labels = [...document.querySelectorAll('mat-label')].filter(isVisible).map((l) => l.textContent.replace(/\\s+/g, ' ').trim()).filter(Boolean);
    console.warn('[flow] skipped steps:', skipped);
    console.warn('[flow] labels on page:', labels);
    alert('Flow done — filled ' + okCount + ', skipped ' + skipped.length + ':\\n\\n' + skipped.join('\\n'));
  } else {
    alert('Flow done — ' + okCount + ' steps completed.');
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
  if (typeof o.index === 'number') step.index = o.index;
  if (typeof o.generator === 'string') step.generator = o.generator as GeneratorId;
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
