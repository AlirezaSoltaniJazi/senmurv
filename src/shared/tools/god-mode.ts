import { GOD_MARKER_ATTR, SENMURV_HOST_TAGS } from '@/shared/constants';
import type { GodCategory, GodModeOptions, GodModeReport } from '@/shared/types';

/**
 * God Mode — strip the client-side locks an app puts on its own form.
 *
 * NOTE ON PURITY: unlike `locators.ts` and `faker-data.ts`, this module MUTATES
 * the DOM. It is still chrome-free and takes its root and its environment as
 * arguments (the `field-detect.ts` shape), so happy-dom drives it in tests — but
 * it is not a pure module and `src/shared/`'s purity rule is relaxed here
 * deliberately. See agents.md → Architecture Rules.
 *
 * Inspired by God Mode in Level Up for Dynamics CRM, which is four Xrm calls and
 * only works on Dynamics. This is the DOM equivalent that works anywhere; the
 * Xrm path lives separately in the service worker.
 */

/** Everything we changed on one element, so it can be put back exactly. */
interface ElementRecord {
  /** attribute name → its value BEFORE we first touched it (null = it was absent). */
  readonly attrs: Map<string, string | null>;
  /** True when we closed a modal <dialog>; modality lives in the top layer, not in CSS. */
  wasModal: boolean;
}

/**
 * The undo record. A plain Map (not a WeakMap) because revert has to iterate it;
 * `pruneDetached` keeps it from pinning nodes an SPA has already thrown away.
 */
export type GodModeSnapshot = Map<Element, ElementRecord>;

export function createSnapshot(): GodModeSnapshot {
  return new Map();
}

/**
 * The bits of the DOM that need a layout engine, injected so the engine stays
 * testable — happy-dom has no layout and does not support `:modal`.
 */
export interface GodModeEnv {
  /** Computed `display` of an element. */
  readonly displayOf: (el: Element) => string;
  /** Is this a dialog currently shown with showModal()? */
  readonly isModal: (el: Element) => boolean;
}

/** Env for a real browser. Every read is guarded — these throw on detached nodes. */
export const BROWSER_ENV: GodModeEnv = {
  displayOf: (el) => {
    try {
      return getComputedStyle(el).display;
    } catch {
      return '';
    }
  },
  isModal: (el) => {
    try {
      return el.matches(':modal');
    } catch {
      // :modal is unsupported in happy-dom and older engines — fall back to the
      // fact that a <dialog open> we cannot prove is modal is treated as modeless.
      return false;
    }
  },
};

/** A conservative default: strip locks, change nothing that alters what you see. */
export const DEFAULT_GOD_MODE_OPTIONS: GodModeOptions = {
  shouldEnableInputs: true,
  shouldDropValidation: true,
  shouldUnlockOptions: true,
  shouldRevealHidden: false,
  shouldRevealPasswords: false,
  shouldCloseDialogs: false,
  shouldPierceShadowDom: false,
};

const SKIP_TAGS = new Set(['script', 'style', 'link', 'meta', 'template', 'head', 'title', 'base']);
const OUR_TAGS = new Set<string>(SENMURV_HOST_TAGS);

/** Tags where `disabled` is a real, honoured attribute. */
const DISABLEABLE = new Set([
  'button',
  'fieldset',
  'input',
  'optgroup',
  'option',
  'select',
  'textarea',
]);

const VALIDATION_ATTRS = [
  'required',
  'aria-required',
  'pattern',
  'minlength',
  'maxlength',
] as const;

function emptyCounts(): Record<GodCategory, number> {
  return { enabled: 0, validation: 0, options: 0, revealed: 0, passwords: 0, dialogs: 0 };
}

function recordFor(snapshot: GodModeSnapshot, el: Element): ElementRecord {
  let record = snapshot.get(el);
  if (!record) {
    record = { attrs: new Map(), wasModal: false };
    snapshot.set(el, record);
  }
  return record;
}

/**
 * Set (or remove, with `next === null`) an attribute, remembering its ORIGINAL
 * value. Returns true when the DOM actually changed.
 *
 * FIRST WRITE WINS. This is the single highest-risk rule in the tool: on a
 * sticky re-apply the framework has usually put the lock back, so recording the
 * value again would capture the locked state as "original" and make Restore a
 * silent no-op.
 */
export function setAttr(
  snapshot: GodModeSnapshot,
  el: Element,
  name: string,
  next: string | null
): boolean {
  const before = el.getAttribute(name);
  if (next === null ? before === null : before === next) return false;

  const record = recordFor(snapshot, el);
  if (!record.attrs.has(name)) record.attrs.set(name, before);

  if (next === null) el.removeAttribute(name);
  else el.setAttribute(name, next);
  return true;
}

/** Add a token to the marker attribute's space-separated list. */
function mark(snapshot: GodModeSnapshot, el: Element, token: string): boolean {
  const current = el.getAttribute(GOD_MARKER_ATTR);
  const tokens = current === null ? [] : current.split(/\s+/).filter(Boolean);
  if (tokens.includes(token)) return false;
  tokens.push(token);
  return setAttr(snapshot, el, GOD_MARKER_ATTR, tokens.join(' '));
}

/**
 * Walk `root` and every open shadow root beneath it, skipping non-rendered tags
 * and Senmurv's own injected hosts (or the unlock would fight our own overlay).
 */
export function collectTargets(
  root: Document | ShadowRoot | Element,
  shouldPierceShadowDom: boolean
): { elements: Element[]; shadowRoots: number; closedHosts: number } {
  const elements: Element[] = [];
  let shadowRoots = 0;
  let closedHosts = 0;

  const visit = (node: Document | ShadowRoot | Element): void => {
    for (const el of Array.from(node.querySelectorAll('*'))) {
      const tag = el.tagName.toLowerCase();
      if (SKIP_TAGS.has(tag) || OUR_TAGS.has(tag)) continue;
      elements.push(el);
      if (!shouldPierceShadowDom) continue;
      const shadow = el.shadowRoot;
      if (shadow) {
        shadowRoots += 1;
        visit(shadow);
      } else if (isLikelyShadowHost(el)) {
        // A closed root is unreachable from both worlds. Count it so the report
        // can say so explicitly rather than silently under-reporting.
        closedHosts += 1;
      }
    }
  };

  visit(root);
  return { elements, shadowRoots, closedHosts };
}

/** A custom element with no children and no open root is probably a closed-root host. */
function isLikelyShadowHost(el: Element): boolean {
  return el.tagName.includes('-') && el.childElementCount === 0;
}

// ---------------------------------------------------------------------------
// The passes
// ---------------------------------------------------------------------------

/**
 * Remove `disabled` / `readonly` / their ARIA twins, and unlock contenteditable.
 *
 * Every count in this module is a count of ELEMENTS affected, never of
 * attributes — "42 fields enabled" is the number a tester can check.
 */
export function enableControls(snapshot: GodModeSnapshot, elements: Element[]): number {
  let changed = 0;
  for (const el of elements) {
    const tag = el.tagName.toLowerCase();
    let touched = false;
    // `disabled` is inherited by a fieldset's descendants, but only the fieldset
    // carries the attribute — fix it there, never on the inheriting input.
    if (DISABLEABLE.has(tag) && setAttr(snapshot, el, 'disabled', null)) touched = true;
    if (setAttr(snapshot, el, 'readonly', null)) touched = true;
    if (setAttr(snapshot, el, 'aria-disabled', null)) touched = true;
    if (setAttr(snapshot, el, 'aria-readonly', null)) touched = true;
    if (
      el.getAttribute('contenteditable') === 'false' &&
      setAttr(snapshot, el, 'contenteditable', 'true')
    ) {
      touched = true;
    }
    if (touched) {
      changed += 1;
      // Only the elements we actually unlocked get the marker — stamping every
      // element on the page would put the whole document in the undo snapshot.
      mark(snapshot, el, 'interact');
    }
  }
  return changed;
}

/**
 * Drop client-side validation.
 *
 * Two traps live here:
 *  - `step` is SET to "any", never removed: an absent `step` on a number input
 *    means `step=1`, so removing it leaves 1.5 invalid.
 *  - `novalidate` is INVERTED. The counter-measure is to ADD the attribute, so
 *    the recorded original is null and Restore REMOVES it. Getting this
 *    backwards silently breaks undo.
 */
export function dropValidation(snapshot: GodModeSnapshot, elements: Element[]): number {
  let changed = 0;
  for (const el of elements) {
    let touched = false;
    for (const attr of VALIDATION_ATTRS) {
      if (setAttr(snapshot, el, attr, null)) touched = true;
    }
    const tag = el.tagName.toLowerCase();
    // min/max are meaningless outside the validated input types, and clearing
    // them on e.g. a <meter> would change what is rendered.
    if (tag === 'input') {
      if (setAttr(snapshot, el, 'min', null)) touched = true;
      if (setAttr(snapshot, el, 'max', null)) touched = true;
      if (el.hasAttribute('step') && setAttr(snapshot, el, 'step', 'any')) touched = true;
    }
    if (tag === 'form' && setAttr(snapshot, el, 'novalidate', '')) touched = true;
    if (touched) changed += 1;
  }
  return changed;
}

/** Re-enable every `<option>` / `<optgroup>` — the web analogue of "show all optionset values". */
export function unlockOptions(snapshot: GodModeSnapshot, elements: Element[]): number {
  let changed = 0;
  for (const el of elements) {
    const tag = el.tagName.toLowerCase();
    if (tag !== 'option' && tag !== 'optgroup') continue;
    if (setAttr(snapshot, el, 'disabled', null)) changed += 1;
    if (setAttr(snapshot, el, 'hidden', null)) changed += 1;
  }
  return changed;
}

/**
 * Reveal hidden content.
 *
 * ORDER IS LOAD-BEARING: strip `hidden` / `inert` / `aria-hidden` FIRST, then
 * re-read the computed display, and only then stamp the marker. `display:
 * revert !important` on a still-`[hidden]` element reverts straight back into
 * the UA's `display:none`, which makes the marker a silent no-op. And only mark
 * what is genuinely `display:none` — `revert` would discard a legitimate
 * author `display:flex`.
 */
export function revealHidden(
  snapshot: GodModeSnapshot,
  elements: Element[],
  env: GodModeEnv
): number {
  let changed = 0;
  for (const el of elements) {
    let touched = false;
    if (setAttr(snapshot, el, 'hidden', null)) touched = true;
    if (setAttr(snapshot, el, 'inert', null)) touched = true;
    if (setAttr(snapshot, el, 'aria-hidden', null)) touched = true;
    if (el.tagName.toLowerCase() === 'input' && el.getAttribute('type') === 'hidden') {
      if (setAttr(snapshot, el, 'type', 'text')) touched = true;
    }
    // Re-read display only AFTER the attributes are gone, and mark only what is
    // still genuinely display:none.
    if (env.displayOf(el) === 'none' && mark(snapshot, el, 'show')) touched = true;
    if (touched) changed += 1;
  }
  return changed;
}

/** Turn password fields into readable text fields. */
export function revealPasswords(snapshot: GodModeSnapshot, elements: Element[]): number {
  let changed = 0;
  for (const el of elements) {
    if (el.tagName.toLowerCase() !== 'input') continue;
    if (el.getAttribute('type') !== 'password') continue;
    if (setAttr(snapshot, el, 'type', 'text')) changed += 1;
    mark(snapshot, el, 'text');
  }
  return changed;
}

/**
 * Close modal dialogs. A modal `<dialog>` lives in the TOP LAYER and makes the
 * rest of the document inert — no CSS can reach that, only `close()` can.
 */
export function closeDialogs(
  snapshot: GodModeSnapshot,
  elements: Element[],
  env: GodModeEnv
): number {
  let changed = 0;
  for (const el of elements) {
    if (el.tagName.toLowerCase() !== 'dialog') continue;
    if (!el.hasAttribute('open')) continue;
    const record = recordFor(snapshot, el);
    record.wasModal = env.isModal(el);
    const dialog = el as HTMLDialogElement;
    if (typeof dialog.close === 'function') dialog.close();
    else setAttr(snapshot, el, 'open', null);
    changed += 1;
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Apply / revert
// ---------------------------------------------------------------------------

/** Run every enabled pass against `root`, accumulating into `snapshot`. */
export function applyGodMode(
  root: Document | ShadowRoot | Element,
  options: GodModeOptions,
  snapshot: GodModeSnapshot,
  env: GodModeEnv = BROWSER_ENV
): GodModeReport {
  const { elements, shadowRoots, closedHosts } = collectTargets(
    root,
    options.shouldPierceShadowDom
  );
  const counts = emptyCounts();

  // Reveal runs FIRST so later passes see elements that were previously hidden.
  if (options.shouldRevealHidden) counts.revealed = revealHidden(snapshot, elements, env);
  if (options.shouldEnableInputs) counts.enabled = enableControls(snapshot, elements);
  if (options.shouldDropValidation) counts.validation = dropValidation(snapshot, elements);
  if (options.shouldUnlockOptions) counts.options = unlockOptions(snapshot, elements);
  if (options.shouldRevealPasswords) counts.passwords = revealPasswords(snapshot, elements);
  if (options.shouldCloseDialogs) counts.dialogs = closeDialogs(snapshot, elements, env);

  const warnings: string[] = [];
  if (closedHosts > 0) {
    warnings.push(
      `${closedHosts} closed shadow root${closedHosts === 1 ? '' : 's'} could not be opened — their contents are unreachable from any extension.`
    );
  }
  if (!options.shouldPierceShadowDom) {
    warnings.push(
      'Shadow DOM was not pierced — turn it on if fields inside web components stay locked.'
    );
  }

  return {
    total: Object.values(counts).reduce((sum, n) => sum + n, 0),
    counts,
    shadowRoots,
    warnings,
  };
}

/**
 * Put everything back. Attributes restore to exactly what they were, telling
 * "was absent" (null) apart from "was present and empty" ("").
 */
export function revertGodMode(snapshot: GodModeSnapshot): number {
  let restored = 0;
  for (const [el, record] of snapshot) {
    for (const [name, original] of record.attrs) {
      if (original === null) el.removeAttribute(name);
      else el.setAttribute(name, original);
      restored += 1;
    }
    if (record.wasModal) {
      const dialog = el as HTMLDialogElement;
      if (typeof dialog.showModal === 'function') {
        try {
          dialog.showModal();
          restored += 1;
        } catch {
          // Already open, or detached — nothing useful to do.
        }
      }
    }
  }
  snapshot.clear();
  return restored;
}

/**
 * Drop entries for elements no longer in the document. Called between sticky
 * re-apply passes so a continuously re-rendering SPA cannot grow the snapshot
 * without bound. A detached element cannot be restored anyway.
 */
export function pruneDetached(snapshot: GodModeSnapshot): number {
  let dropped = 0;
  for (const el of Array.from(snapshot.keys())) {
    if (!el.isConnected) {
      snapshot.delete(el);
      dropped += 1;
    }
  }
  return dropped;
}

// ---------------------------------------------------------------------------
// Export as a standalone script (the Scripts-tab handoff)
// ---------------------------------------------------------------------------

/**
 * A self-contained bookmarklet-shaped unlock, so the same pass can be saved in
 * the Scripts tab and re-run on every page load. Intentionally a trimmed
 * version of the engine above — it has no undo and no sticky mode.
 */
export function buildUnlockScript(options: GodModeOptions): string {
  const strip: string[] = [];
  if (options.shouldEnableInputs)
    strip.push('disabled', 'readonly', 'aria-disabled', 'aria-readonly');
  if (options.shouldDropValidation) strip.push('required', 'pattern', 'minlength', 'maxlength');
  if (options.shouldRevealHidden) strip.push('hidden', 'inert', 'aria-hidden');

  const lines = [
    '// Senmurv — Unlock (God Mode). Client-side only: the server can still refuse.',
    `const LOCKS = ${JSON.stringify(strip)};`,
    'let n = 0;',
    "for (const el of document.querySelectorAll('*')) {",
    '  for (const attr of LOCKS) if (el.hasAttribute(attr)) { el.removeAttribute(attr); n += 1; }',
  ];
  if (options.shouldDropValidation) {
    lines.push("  if (el.tagName === 'FORM') el.noValidate = true;");
    lines.push(
      "  if (el.tagName === 'INPUT' && el.hasAttribute('step')) el.setAttribute('step', 'any');"
    );
  }
  if (options.shouldRevealPasswords) {
    lines.push(
      "  if (el.tagName === 'INPUT' && el.type === 'password') { el.type = 'text'; n += 1; }"
    );
  }
  if (options.shouldRevealHidden) {
    lines.push("  if (getComputedStyle(el).display === 'none') {");
    lines.push("    el.style.setProperty('display', 'revert', 'important');");
    lines.push('    n += 1;');
    lines.push('  }');
  }
  lines.push('}');
  lines.push("console.log('[Senmurv] unlocked ' + n + ' element(s)');");
  return lines.join('\n');
}
