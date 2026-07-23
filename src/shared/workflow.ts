import type { GeneratorId, PickedField } from '@/shared/types';
import { newId } from '@/utils/id';

/** What the Scripts "Customize" button hands to the Recorder tab. */
export interface RecorderSeed {
  steps: WorkflowStep[];
  /** The source script's name, pre-filled into the Recorder's save box. */
  name?: string;
}

/** A step streamed from the in-page recorder (the panel mints the `id`). */
export type RecordedStep = Omit<WorkflowStep, 'id'>;

/** A workflow step kind. */
export type StepKind =
  | 'click'
  | 'clickEl'
  | 'wait'
  | 'waitEl'
  | 'press'
  | 'fill'
  | 'select'
  | 'radio'
  | 'check'
  | 'runjs';

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
  ms?: number; // wait: milliseconds; waitEl: timeout
  label?: string; // fill/select/radio/check/clickEl: mat-label text
  selector?: string; // fill/select/radio/check/clickEl/waitEl/press: CSS selector
  value?: string; // fill: value to type; select(text)/radio: option text/value
  optionMode?: SelectMode; // select
  checked?: boolean; // check
  index?: number; // target-by-selector kinds: pick the Nth match (0-based)
  generator?: GeneratorId; // fill: random-value generator; falls back to the static `value`
  key?: string; // press: key name (e.g. "Enter")
  code?: string; // runjs: JS source to run
  disabled?: boolean; // when true the step is kept in the flow but skipped at run time
}

export const STEP_KINDS: StepKind[] = [
  'click',
  'clickEl',
  'wait',
  'waitEl',
  'press',
  'fill',
  'select',
  'radio',
  'check',
  'runjs',
];

export const STEP_KIND_LABELS: Record<StepKind, string> = {
  click: 'Click button',
  clickEl: 'Click element',
  wait: 'Wait',
  waitEl: 'Wait for element',
  press: 'Press key',
  fill: 'Fill field',
  select: 'Select option',
  radio: 'Radio',
  check: 'Checkbox',
  runjs: 'Run JS',
};

/** Create a step of `kind` with sensible defaults. */
export function newStep(kind: StepKind): WorkflowStep {
  const base = { id: newId('stp_'), kind } as WorkflowStep;
  switch (kind) {
    case 'click':
      return { ...base, text: '' };
    case 'clickEl':
      return { ...base, selector: '' };
    case 'wait':
      return { ...base, ms: 1000 };
    case 'waitEl':
      return { ...base, selector: '' };
    case 'press':
      return { ...base, key: 'Enter' };
    case 'runjs':
      return { ...base, code: '' };
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
    case 'clickEl':
      return `Click ${target}`;
    case 'wait':
      return `Wait ${s.ms ?? 0} ms`;
    case 'waitEl':
      return `Wait for ${s.selector ?? ''}`;
    case 'press':
      return `Press ${s.key ?? ''}`;
    case 'runjs':
      return `Run JS (${(s.code ?? '').length} chars)`;
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

/**
 * Fill generators that map to an in-page `{random:…}` token (resolved by the
 * PREAMBLE's `randomValue` on every run). Kept in sync with that switch.
 */
const RANDOM_TOKEN_GENERATORS = new Set<GeneratorId>([
  'firstName',
  'lastName',
  'fullName',
  'email',
  'phone',
  'phoneNational',
  'streetAddress',
  'city',
  'postalCode',
  'country',
  'company',
  'word',
  'sentence',
  'number',
  'uuid',
  'date',
  'pastDate',
]);

/** The `{random:KIND}` (or `{random:KIND:ARG}`) token for a generator id. */
export function randomToken(generator: GeneratorId): string {
  return `{random:${generator}}`;
}

function serializeStep(s: WorkflowStep): Record<string, unknown> {
  const o: Record<string, unknown> = { kind: s.kind };
  // Set before the per-kind branches (which each mutate and return this same `o`)
  // so a disabled step round-trips regardless of kind; the interpreter skips it.
  if (s.disabled) o.disabled = true;
  if (s.kind === 'click') {
    o.text = s.text ?? '';
    return o;
  }
  if (s.kind === 'wait') {
    o.ms = s.ms ?? 0;
    return o;
  }
  if (s.kind === 'runjs') {
    o.code = s.code ?? '';
    return o;
  }
  if (s.kind === 'press') {
    o.key = s.key ?? 'Enter';
    if (s.selector) o.selector = s.selector;
    if (typeof s.index === 'number' && s.index > 0) o.index = s.index;
    return o;
  }
  // Target-by-label-or-selector kinds: clickEl / waitEl / fill / select / radio / check.
  if (s.label) o.label = s.label;
  if (s.selector) o.selector = s.selector;
  if (typeof s.index === 'number' && s.index > 0) o.index = s.index;
  if (s.kind === 'waitEl' && typeof s.ms === 'number' && s.ms > 0) o.ms = s.ms;
  if (s.kind === 'fill') {
    // A random generator becomes an in-page `{random:…}` token so a SAVED script
    // re-randomizes on every run; a static ("custom") field keeps its literal value.
    o.value =
      s.generator && RANDOM_TOKEN_GENERATORS.has(s.generator)
        ? randomToken(s.generator)
        : (s.value ?? '');
  }
  if (s.kind === 'select') {
    o.value = s.value ?? '';
    o.optionMode = s.optionMode ?? 'text';
  }
  if (s.kind === 'radio') o.value = s.value ?? '';
  if (s.kind === 'check') o.checked = s.checked ?? true;
  return o;
}

// Self-contained interpreter helpers, embedded into the generated script. Uses
// string concatenation (no nested template literals) so nothing needs escaping.
const PREAMBLE = `const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  const isVisible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  // Scroll a resolved target into view before acting on it, so off-screen fields
  // become interactable and the page visibly follows the running flow.
  const reveal = (el) => { try { if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) {} };
  const queryNth = (sel, i) => (typeof i === 'number' ? (document.querySelectorAll(sel)[i] || null) : document.querySelector(sel));
  function waitFor(fn, desc, timeout = 15000, interval = 200) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      var lastScan = 0, scanStep = 0;
      (function poll() {
        let v = null; try { v = fn(); } catch (e) { v = null; }
        if (v) return resolve(v);
        var now = Date.now();
        if (now - start > timeout) return reject(new Error('Timed out waiting for ' + desc));
        // Not found yet: every ~600ms scroll the page down a screen (wrapping back
        // to the top after the bottom) so lazy / below-the-fold targets render and
        // can be located — a visible "scan" of the page while searching.
        if (now - lastScan > 600) {
          lastScan = now;
          var max = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - window.innerHeight;
          if (max > 0) {
            scanStep += 1;
            var y = scanStep * Math.round(window.innerHeight * 0.85);
            if (y > max) { y = 0; scanStep = 0; }
            try { window.scrollTo({ top: y, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, y); }
          }
        }
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
    if (!b) throw new Error('button not found: "' + text + '"');
    reveal(b);
    b.click();
    await sleep(500);
  }
  // Framework-agnostic label resolution: gather a control's accessible label from
  // every common source (standard <label for>/wrapping <label>, aria-label,
  // aria-labelledby, placeholder, generic field containers, and — where present —
  // Angular Material's mat-label). No single framework is assumed.
  function labelTextFor(el) {
    const parts = [];
    const al = el.getAttribute('aria-label'); if (al) parts.push(al);
    const ph = el.getAttribute('placeholder'); if (ph) parts.push(ph);
    const lb = el.getAttribute('aria-labelledby');
    if (lb) lb.split(/\\s+/).forEach((id) => { const n = document.getElementById(id); if (n) parts.push(n.textContent); });
    if (el.id) {
      const safe = window.CSS && CSS.escape ? CSS.escape(el.id) : el.id;
      document.querySelectorAll('label[for="' + safe + '"]').forEach((l) => parts.push(l.textContent));
    }
    const wrap = el.closest('label');
    if (wrap) parts.push(wrap.textContent);
    const field = el.closest('mat-form-field, .mat-mdc-form-field, .form-group, .form-field, .field');
    if (field) { const ml = field.querySelector('mat-label, label, legend, .label'); if (ml) parts.push(ml.textContent); }
    if (el.matches('mat-checkbox, mat-radio-button, [role="checkbox"], [role="radio"], [role="switch"]')) parts.push(el.textContent);
    return norm(parts.join(' '));
  }
  function resolveField(step, sel) {
    if (step.selector) return queryNth(step.selector, step.index);
    if (step.label) {
      const g = norm(step.label);
      const cands = [...document.querySelectorAll(sel)].filter(isVisible);
      const pick = (cmp) => cands.find((el) => cmp(labelTextFor(el))) || null;
      return pick((t) => t === g) || pick((t) => t.includes(g)) || pick((t) => g.includes(t));
    }
    return null;
  }
  // Compact, self-contained random data (faker can't run in the page). Realistic
  // enough for typical form validation; locale-neutral with UK-style phone /
  // postcode defaults.
  var RND = {
    first: ['Olivia', 'Noah', 'Emma', 'Liam', 'Ava', 'James', 'Sophia', 'Lucas', 'Mia', 'Ethan', 'Isla', 'Leo', 'Amelia', 'Oscar', 'Ella', 'Harry', 'Grace', 'Jack', 'Freya', 'Charlie', 'Amir', 'Yuki', 'Sara', 'Omar', 'Nina'],
    last: ['Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Johnson', 'Davies', 'Patel', 'Robinson', 'Wright', 'Thompson', 'Evans', 'Walker', 'White', 'Green', 'Hall', 'Wood', 'Harris', 'Martin', 'Khan', 'Nguyen', 'Rossi', 'Muller', 'Silva'],
    words: ['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'sed', 'tempor', 'labore', 'magna', 'aliqua', 'veniam', 'nostrud', 'ullamco', 'laboris', 'aliquip', 'commodo', 'dignissim'],
    cities: ['London', 'Manchester', 'Bristol', 'Leeds', 'Liverpool', 'Sheffield', 'Edinburgh', 'Cardiff', 'Glasgow', 'Oxford', 'Cambridge', 'York', 'Bath', 'Newcastle', 'Nottingham'],
    streets: ['High Street', 'Station Road', 'Church Lane', 'Victoria Road', 'Green Lane', 'Manor Road', 'Kings Road', 'Queens Road', 'Park Avenue', 'Mill Lane', 'The Grove', 'New Road'],
    countries: ['United Kingdom', 'Ireland', 'France', 'Germany', 'Spain', 'Italy', 'Netherlands', 'Belgium', 'Portugal', 'Sweden', 'Norway', 'Denmark', 'Austria', 'Switzerland'],
    companies: ['Acme', 'Globex', 'Initech', 'Umbrella', 'Soylent', 'Stark', 'Wayne', 'Wonka', 'Hooli', 'Vandelay', 'Northwind', 'Contoso'],
    suffix: ['Ltd', 'Group', 'Holdings', 'Partners', 'Solutions', 'Systems', 'Labs', 'Co']
  };
  var rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  var pick = (arr) => arr[rint(0, arr.length - 1)];
  var rHex = (n) => { var s = ''; for (var i = 0; i < n; i += 1) s += '0123456789abcdef'.charAt(rint(0, 15)); return s; };
  var rDigits = (n) => { var s = ''; for (var i = 0; i < n; i += 1) s += rint(0, 9); return s; };
  var rLetters = (n, upper) => { var s = '', base = upper ? 65 : 97; for (var i = 0; i < n; i += 1) s += String.fromCharCode(base + rint(0, 25)); return s; };
  var rDate = (minY, maxY) => { var p = (n) => String(n).padStart(2, '0'); return p(rint(1, 28)) + '/' + p(rint(1, 12)) + '/' + rint(minY, maxY); };
  function randomValue(kind, arg) {
    var y = new Date().getFullYear();
    switch (kind) {
      case 'firstName': return pick(RND.first);
      case 'lastName': return pick(RND.last);
      case 'fullName': return pick(RND.first) + ' ' + pick(RND.last);
      case 'email': return pick(RND.first).toLowerCase() + '.' + pick(RND.last).toLowerCase() + rint(1, 999) + '@example.com';
      case 'phone': return '+44 7' + pick(['4', '5', '7', '8', '9']) + rDigits(8);
      case 'phoneNational': return '07' + pick(['4', '5', '7', '8', '9']) + rDigits(8);
      case 'streetAddress': return rint(1, 199) + ' ' + pick(RND.streets);
      case 'city': return pick(RND.cities);
      case 'postalCode': return rLetters(rint(1, 2), true) + rint(1, 9) + ' ' + rint(1, 9) + rLetters(2, true);
      case 'country': return pick(RND.countries);
      case 'company': return pick(RND.companies) + ' ' + pick(RND.suffix);
      case 'word': return pick(RND.words);
      case 'sentence': { var n = rint(4, 8), w = []; for (var i = 0; i < n; i += 1) w.push(pick(RND.words)); var s = w.join(' '); return s.charAt(0).toUpperCase() + s.slice(1) + '.'; }
      case 'number': { var lo = 1, hi = 99999; if (arg) { var parts = arg.split('-'); lo = parseInt(parts[0], 10) || 0; hi = parseInt(parts[1], 10) || lo; } return String(rint(lo, hi)); }
      case 'uuid': return rHex(8) + '-' + rHex(4) + '-4' + rHex(3) + '-' + '89ab'.charAt(rint(0, 3)) + rHex(3) + '-' + rHex(12);
      case 'date': return rDate(y - 80, y - 18);
      case 'pastDate': return rDate(y - 5, y - 1);
      case 'alpha': return rLetters(arg ? parseInt(arg, 10) || 8 : 8, false);
      case 'digits': return rDigits(arg ? parseInt(arg, 10) || 6 : 6);
      default: return '';
    }
  }
  // Value tokens resolved at run time so a saved script re-randomizes on every
  // run: "{today}" / "{today+N}" / "{today-N}" -> dd/mm/yyyy (a mandatory date is
  // always valid), and "{random:KIND}" / "{random:KIND:ARG}" (e.g. {random:email},
  // {random:number:1-99}) -> fresh random data. Any other value is unchanged.
  function resolveValue(v) {
    if (typeof v !== 'string') return v;
    var td = v.match(/^\\{today([+-]\\d+)?\\}$/);
    if (td) {
      var d = new Date();
      if (td[1]) d.setDate(d.getDate() + parseInt(td[1], 10));
      var p = (n) => String(n).padStart(2, '0');
      return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
    }
    var rd = v.match(/^\\{random:([a-zA-Z]+)(?::([^}]*))?\\}$/);
    if (rd) return randomValue(rd[1], rd[2]);
    return v;
  }
  async function setInput(step) {
    const input = await waitFor(() => resolveField(step, 'input, textarea'), 'input ' + (step.label || step.selector));
    const iSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const tSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    reveal(input);
    input.focus();
    (input.tagName === 'TEXTAREA' ? tSet : iSet).call(input, resolveValue(step.value) || '');
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
    reveal(el);
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
      reveal(el);
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
    reveal(el);
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
    reveal(el);
    const box = el.matches && el.matches('input') ? el : (el.querySelector('input[type="checkbox"], input.msos-checkbox') || el);
    const msos = box.closest && box.closest('li.msos-option');
    const on = !!box.checked || !!(msos && msos.classList.contains('msos-option-selected'));
    if (on !== !!step.checked) (box.click ? box : el).click();
  }
  async function clickEl(step) {
    const el = await waitFor(() => (step.selector ? queryNth(step.selector, step.index) : null), 'element ' + (step.selector || step.label));
    reveal(el);
    el.click();
    await sleep(200);
  }
  async function pressKey(step) {
    const target = step.selector ? (queryNth(step.selector, step.index) || document.activeElement) : (document.activeElement || document.body);
    if (step.selector) reveal(target);
    const key = step.key || 'Enter';
    const opts = { key: key, code: key, bubbles: true, cancelable: true };
    for (const t of ['keydown', 'keypress', 'keyup']) target.dispatchEvent(new KeyboardEvent(t, opts));
    await sleep(150);
  }
  async function waitForVisible(step) {
    const timeout = typeof step.ms === 'number' && step.ms > 0 ? step.ms : 15000;
    const el = await waitFor(() => { const e = queryNth(step.selector, step.index); return e && isVisible(e) ? e : null; }, 'element ' + step.selector, timeout);
    reveal(el);
  }
  // runjs: run the user's snippet with sleep/waitFor in scope. The new Function
  // below lives only as TEXT inside this PREAMBLE string (not extension code);
  // the whole generated script runs in the page's MAIN world under the page CSP
  // via the one sanctioned runner (see agents.md §Security). Never add eval/new
  // Function to extension source.
  async function runJs(step) {
    const fn = new Function('sleep', 'waitFor', 'return (async () => {' + (step.code || '') + '})();');
    await fn(sleep, waitFor);
  }
  // On-page progress HUD (best-effort; never breaks the flow). Corner-pinned and
  // pointer-events:none so it never intercepts the clicks the flow performs.
  function createHud(steps) {
    var host = null, header = null, rows = [], done = 0, total = 0;
    for (var ti = 0; ti < steps.length; ti += 1) { if (!steps[ti].disabled) total += 1; }
    try {
      host = document.createElement('senmurv-flow-hud');
      host.style.cssText = 'all: initial; position: fixed; top: 12px; right: 12px; z-index: 2147483647; pointer-events: none;';
      var shadow = host.attachShadow({ mode: 'open' });
      var style = document.createElement('style');
      style.textContent = '.hud{font:12px/1.45 ui-monospace,Menlo,monospace;color:#e7e8ec;background:#26272e;border:1px solid #3a3c45;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.45);width:300px;max-height:60vh;display:flex;flex-direction:column;overflow:hidden}.h{padding:6px 10px;font-weight:700;background:#2d7ff9;color:#fff}.l{margin:0;padding:4px;list-style:none;overflow:auto}.r{display:flex;gap:6px;padding:3px 6px;border-radius:4px;align-items:flex-start}.r.run{background:rgba(45,127,249,.18)}.i{width:14px;flex:0 0 auto;text-align:center}.b{flex:1;min-width:0}.t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.e{color:#e5534b;font-size:11px;white-space:normal;word-break:break-word}.dim{color:#9a9cab}.ok .i{color:#3fb950}.fail .i{color:#e5534b}.run .i{color:#2d7ff9}.off{opacity:.5}.off .i{color:#6b6d78}';
      var wrap = document.createElement('div'); wrap.className = 'hud';
      header = document.createElement('div'); header.className = 'h'; header.textContent = 'Senmurv flow \\u2014 0/' + total;
      var list = document.createElement('ul'); list.className = 'l';
      for (var i = 0; i < steps.length; i += 1) {
        var s = steps[i];
        var label = s.label || s.text || s.selector || s.key || (s.code ? 'JS' : (s.ms != null ? s.ms + 'ms' : ''));
        var li = document.createElement('li'); li.className = s.disabled ? 'r off' : 'r dim';
        var icon = document.createElement('span'); icon.className = 'i'; icon.textContent = s.disabled ? '\\u2298' : '\\u25cb';
        var body = document.createElement('div'); body.className = 'b';
        var txt = document.createElement('div'); txt.className = 't'; txt.textContent = (i + 1) + '. ' + s.kind + ' ' + label + (s.disabled ? ' (disabled)' : '');
        body.appendChild(txt); li.appendChild(icon); li.appendChild(body);
        list.appendChild(li); rows.push({ li: li, icon: icon, body: body });
      }
      wrap.appendChild(header); wrap.appendChild(list); shadow.appendChild(style); shadow.appendChild(wrap);
      document.documentElement.appendChild(host);
    } catch (e) { /* HUD is best-effort */ }
    function count() { if (header) header.textContent = 'Senmurv flow \\u2014 ' + done + '/' + total; }
    return {
      setRunning: function (i) { var r = rows[i]; if (r) { r.li.className = 'r run'; r.icon.textContent = '\\u25b6'; try { r.li.scrollIntoView({ block: 'nearest' }); } catch (e) {} } },
      setOk: function (i) { var r = rows[i]; if (r) { r.li.className = 'r ok'; r.icon.textContent = '\\u2713'; } done += 1; count(); },
      setFail: function (i, msg) { var r = rows[i]; if (r) { r.li.className = 'r fail'; r.icon.textContent = '\\u2717'; var e = document.createElement('div'); e.className = 'e'; e.textContent = msg || 'failed'; r.body.appendChild(e); } done += 1; count(); },
      finish: function (ok, fail) { if (header) { header.textContent = 'Flow done \\u2014 ' + ok + ' ok' + (fail ? ', ' + fail + ' failed' : ''); header.style.background = fail ? '#e5534b' : '#3fb950'; } if (host) { var h = host; setTimeout(function () { try { h.remove(); } catch (e) {} }, fail ? 15000 : 6000); } }
    };
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
  const hud = createHud(STEPS);
  const skipped = [];
  let okCount = 0;
  for (let i = 0; i < STEPS.length; i += 1) {
    const step = STEPS[i];
    if (step.disabled) continue; // kept in the flow for editing, but not executed
    const tag = step.label || step.text || step.selector || step.key || (step.code ? 'js' : step.ms + 'ms');
    hud.setRunning(i);
    try {
      if (step.kind === 'click') await clickButton(step.text);
      else if (step.kind === 'clickEl') await clickEl(step);
      else if (step.kind === 'wait') await sleep(step.ms);
      else if (step.kind === 'waitEl') await waitForVisible(step);
      else if (step.kind === 'press') await pressKey(step);
      else if (step.kind === 'fill') await setInput(step);
      else if (step.kind === 'select') await setSelect(step);
      else if (step.kind === 'radio') await setRadio(step);
      else if (step.kind === 'check') await setCheck(step);
      else if (step.kind === 'runjs') await runJs(step);
      okCount += 1;
      hud.setOk(i);
      console.info('[flow] ok:', step.kind, tag);
    } catch (e) {
      skipped.push(step.kind + ' ' + tag + ' (' + e.message + ')');
      hud.setFail(i, e.message);
      console.warn('[flow] SKIPPED:', step.kind, tag, '-', e.message);
    }
  }
  hud.finish(okCount, skipped.length);
  console.info('[flow] done. ok=' + okCount + ', skipped=' + skipped.length);
  if (skipped.length) {
    const labels = [...document.querySelectorAll('mat-label')].filter(isVisible).map((l) => l.textContent.replace(/\\s+/g, ' ').trim()).filter(Boolean);
    console.warn('[flow] skipped steps:', skipped);
    console.warn('[flow] labels on page:', labels);
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
  if (typeof o.value === 'string') {
    // A `{random:KIND}` token round-trips back to a random generator (so the
    // Recorder shows the dropdown, not a literal token); anything else is a value.
    const rm = /^\{random:([a-zA-Z]+)(?::[^}]*)?\}$/.exec(o.value);
    if (step.kind === 'fill' && rm && RANDOM_TOKEN_GENERATORS.has(rm[1] as GeneratorId)) {
      step.generator = rm[1] as GeneratorId;
    } else {
      step.value = o.value;
    }
  }
  if (o.optionMode === 'text' || o.optionMode === 'first' || o.optionMode === 'random') {
    step.optionMode = o.optionMode;
  }
  if (typeof o.checked === 'boolean') step.checked = o.checked;
  if (o.disabled === true) step.disabled = true;
  if (typeof o.index === 'number') step.index = o.index;
  if (typeof o.generator === 'string') step.generator = o.generator as GeneratorId;
  if (typeof o.key === 'string') step.key = o.key;
  if (typeof o.code === 'string') step.code = o.code;
  return step;
}

/**
 * Read one array of flat objects (primitive values only) from the start of
 * `src`, tolerating what a HAND-WRITTEN `STEPS` array uses that JSON forbids:
 * single or double quotes (including quotes embedded in the other kind), unquoted
 * keys, `//` and block comments, trailing commas, and any indentation. Strict
 * JSON is a subset, so Recorder-generated arrays parse through here too. Returns
 * the parsed objects, or null on the first thing it can't read.
 */
function parseObjectArray(src: string): Record<string, unknown>[] | null {
  let i = 0;
  const len = src.length;

  const skipWs = (): void => {
    for (;;) {
      const c = src.charAt(i);
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
        i += 1;
      } else if (c === '/' && src.charAt(i + 1) === '/') {
        i += 2;
        while (i < len && src.charAt(i) !== '\n') i += 1;
      } else if (c === '/' && src.charAt(i + 1) === '*') {
        i += 2;
        while (i < len && !(src.charAt(i) === '*' && src.charAt(i + 1) === '/')) i += 1;
        i += 2;
      } else {
        return;
      }
    }
  };

  const parseString = (): string | null => {
    const quote = src.charAt(i);
    if (quote !== '"' && quote !== "'") return null;
    i += 1;
    let out = '';
    while (i < len) {
      const c = src.charAt(i);
      i += 1;
      if (c === '\\') {
        const e = src.charAt(i);
        i += 1;
        out += e === 'n' ? '\n' : e === 't' ? '\t' : e === 'r' ? '\r' : e;
      } else if (c === quote) {
        return out;
      } else {
        out += c;
      }
    }
    return null; // unterminated
  };

  const parseIdent = (): string | null => {
    const start = i;
    while (i < len && /[A-Za-z0-9_$]/.test(src.charAt(i))) i += 1;
    return i > start ? src.slice(start, i) : null;
  };

  const parseValue = (): { value: unknown } | null => {
    skipWs();
    const c = src.charAt(i);
    if (c === '"' || c === "'") {
      const s = parseString();
      return s === null ? null : { value: s };
    }
    if (c === '-' || (c >= '0' && c <= '9')) {
      const start = i;
      i += 1;
      while (i < len && /[0-9.eE+-]/.test(src.charAt(i))) i += 1;
      const num = Number(src.slice(start, i));
      return Number.isFinite(num) ? { value: num } : null;
    }
    const id = parseIdent();
    if (id === 'true') return { value: true };
    if (id === 'false') return { value: false };
    if (id === 'null') return { value: null };
    return null; // objects/arrays/other values are not supported in a step
  };

  const parseObject = (): Record<string, unknown> | null => {
    skipWs();
    if (src.charAt(i) !== '{') return null;
    i += 1;
    const obj: Record<string, unknown> = {};
    for (;;) {
      skipWs();
      if (src.charAt(i) === '}') {
        i += 1;
        return obj;
      }
      const key = src.charAt(i) === '"' || src.charAt(i) === "'" ? parseString() : parseIdent();
      if (key === null) return null;
      skipWs();
      if (src.charAt(i) !== ':') return null;
      i += 1;
      const v = parseValue();
      if (!v) return null;
      obj[key] = v.value;
      skipWs();
      const sep = src.charAt(i);
      if (sep === ',') {
        i += 1;
      } else if (sep === '}') {
        i += 1;
        return obj;
      } else {
        return null;
      }
    }
  };

  skipWs();
  if (src.charAt(i) !== '[') return null;
  i += 1;
  const arr: Record<string, unknown>[] = [];
  for (;;) {
    skipWs();
    if (src.charAt(i) === ']') {
      i += 1;
      return arr;
    }
    const obj = parseObject();
    if (obj === null) return null;
    arr.push(obj);
    skipWs();
    const sep = src.charAt(i);
    if (sep === ',') {
      i += 1;
    } else if (sep === ']') {
      i += 1;
      return arr;
    } else {
      return null;
    }
  }
}

/**
 * Reverse of {@link buildWorkflowScript}: rebuild editable steps, or null.
 * Parses both Recorder-generated (strict JSON) and hand-written `STEPS` arrays.
 */
export function parseWorkflowScript(code: string): WorkflowStep[] | null {
  const match = /const\s+STEPS\s*=\s*(\[[\s\S]*)/.exec(code);
  if (!match) return null;
  const arr = parseObjectArray(match[1]!);
  if (!arr) return null;
  const steps: WorkflowStep[] = [];
  for (const item of arr) {
    const step = toStep(item);
    if (step) steps.push(step);
  }
  return steps.length > 0 ? steps : null;
}

/**
 * Convert a picked field into a Fill-flow step — used by "Ad-hoc Insert" and by
 * re-opening legacy fill scripts for editing. Preserves the generator so Fill
 * steps re-randomize on each run (matching Flow semantics).
 */
export function fieldToStep(f: PickedField): WorkflowStep {
  const base: WorkflowStep = { id: newId('stp_'), kind: 'fill', selector: f.selector };
  if (f.label) base.label = f.label;
  switch (f.fieldType) {
    case 'checkbox':
      return { ...base, kind: 'check', checked: f.generator !== 'uncheck' };
    case 'select':
    case 'combobox':
      return {
        ...base,
        kind: 'select',
        optionMode: f.generator === 'pickFirst' ? 'first' : 'random',
      };
    case 'radio':
      return { ...base, kind: 'radio' };
    default:
      return {
        ...base,
        kind: 'fill',
        generator: f.generator,
        value: f.generator === 'custom' ? (f.customValue ?? '') : '',
      };
  }
}
