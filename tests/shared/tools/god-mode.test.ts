import { beforeEach, describe, expect, it } from 'vitest';
import { GOD_MARKER_ATTR } from '@/shared/constants';
import {
  applyGodMode,
  buildUnlockScript,
  createSnapshot,
  DEFAULT_GOD_MODE_OPTIONS,
  pruneDetached,
  revertGodMode,
  setAttr,
} from '@/shared/tools/god-mode';
import type { GodModeEnv } from '@/shared/tools/god-mode';
import type { GodModeOptions } from '@/shared/types';

// happy-dom has no layout engine and does not support `:modal`, so the two DOM
// reads that need one are injected. Everything else below is real DOM work.
const VISIBLE_ENV: GodModeEnv = { displayOf: () => 'block', isModal: () => false };
const HIDDEN_ENV: GodModeEnv = { displayOf: () => 'none', isModal: () => true };

const ALL_ON: GodModeOptions = {
  shouldEnableInputs: true,
  shouldDropValidation: true,
  shouldUnlockOptions: true,
  shouldRevealHidden: true,
  shouldRevealPasswords: true,
  shouldCloseDialogs: true,
  shouldPierceShadowDom: true,
};

function mount(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

/** Attribute name → value, order-insensitive. Never compare outerHTML: a
 *  remove-then-re-add reorders serialization and the diff is unreadable. */
function attrsOf(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) out[attr.name] = attr.value;
  return out;
}

const $ = (sel: string): Element => {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`no element for ${sel}`);
  return el;
};

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('setAttr — first write wins', () => {
  it('keeps the ORIGINAL value when the same attribute is rewritten', () => {
    mount('<input id="a" step="0.5">');
    const snap = createSnapshot();
    const el = $('#a');

    setAttr(snap, el, 'step', 'any');
    // A framework puts its own value back, and we overwrite again.
    el.setAttribute('step', '2');
    setAttr(snap, el, 'step', 'any');

    revertGodMode(snap);
    expect(el.getAttribute('step')).toBe('0.5');
  });

  it('distinguishes an absent attribute from a present empty one', () => {
    mount('<input id="a" disabled>');
    const snap = createSnapshot();
    const el = $('#a');

    // `disabled` is present-and-empty; `readonly` is absent.
    expect(setAttr(snap, el, 'disabled', null)).toBe(true);
    expect(setAttr(snap, el, 'readonly', null)).toBe(false); // nothing to do

    revertGodMode(snap);
    expect(el.hasAttribute('disabled')).toBe(true);
    expect(el.getAttribute('disabled')).toBe('');
    expect(el.hasAttribute('readonly')).toBe(false);
  });

  it('reports whether the DOM actually changed', () => {
    mount('<input id="a" type="text">');
    const snap = createSnapshot();
    expect(setAttr(snap, $('#a'), 'type', 'text')).toBe(false);
    expect(snap.size).toBe(0);
  });
});

describe('applyGodMode → revertGodMode round trip', () => {
  it('restores the original attributes exactly, even after a sticky re-apply', () => {
    mount(`
      <form id="f">
        <fieldset id="fs" disabled>
          <input id="a" disabled required readonly pattern="\\d+" minlength="2" step="0.5">
        </fieldset>
      </form>`);
    const before = {
      form: attrsOf($('#f')),
      fieldset: attrsOf($('#fs')),
      input: attrsOf($('#a')),
    };

    const snap = createSnapshot();
    applyGodMode(document, ALL_ON, snap, VISIBLE_ENV);

    // The app re-renders and re-applies its locks — crucially with DIFFERENT
    // serialized values than the markup had. If a re-apply overwrote the
    // recorded original, revert would restore these instead of the real ones,
    // so this is what makes the test discriminate at all.
    $('#a').setAttribute('disabled', 'disabled');
    $('#a').setAttribute('required', 'required');
    $('#a').setAttribute('pattern', '[a-z]+');
    $('#a').setAttribute('step', '10');
    $('#fs').setAttribute('disabled', 'disabled');

    // Sticky mode strips them again into the SAME snapshot.
    applyGodMode(document, ALL_ON, snap, VISIBLE_ENV);

    revertGodMode(snap);

    expect(attrsOf($('#f'))).toEqual(before.form);
    expect(attrsOf($('#fs'))).toEqual(before.fieldset);
    expect(attrsOf($('#a'))).toEqual(before.input);
  });

  it('leaves no marker attribute behind after revert', () => {
    mount('<input id="a" disabled>');
    const snap = createSnapshot();
    applyGodMode(document, ALL_ON, snap, HIDDEN_ENV);
    expect($('#a').hasAttribute(GOD_MARKER_ATTR)).toBe(true);

    revertGodMode(snap);
    expect($('#a').hasAttribute(GOD_MARKER_ATTR)).toBe(false);
    expect(document.querySelectorAll(`[${GOD_MARKER_ATTR}]`)).toHaveLength(0);
  });

  it('empties the snapshot so a second revert is a no-op', () => {
    mount('<input id="a" disabled>');
    const snap = createSnapshot();
    applyGodMode(document, ALL_ON, snap, VISIBLE_ENV);
    revertGodMode(snap);
    expect(snap.size).toBe(0);
    expect(revertGodMode(snap)).toBe(0);
  });
});

describe('enableControls', () => {
  it('fixes a disabled fieldset AT THE FIELDSET, never on the inheriting input', () => {
    // happy-dom does not model fieldset disabled-inheritance, and even in Chrome
    // input.disabled reflects only the input's OWN attribute — so asserting on
    // the input would pass while testing nothing.
    mount('<fieldset id="fs" disabled><legend>L</legend><input id="a"></fieldset>');
    const snap = createSnapshot();
    applyGodMode(document, ALL_ON, snap, VISIBLE_ENV);
    expect($('#fs').hasAttribute('disabled')).toBe(false);
  });

  it('unlocks contenteditable="false" without touching a genuine editor', () => {
    mount(
      '<div id="locked" contenteditable="false"></div><div id="open" contenteditable="true"></div>'
    );
    const snap = createSnapshot();
    applyGodMode(document, ALL_ON, snap, VISIBLE_ENV);
    expect($('#locked').getAttribute('contenteditable')).toBe('true');
    expect($('#open').getAttribute('contenteditable')).toBe('true');
    revertGodMode(snap);
    expect($('#locked').getAttribute('contenteditable')).toBe('false');
  });

  it('marks only the elements it actually unlocked', () => {
    mount('<input id="a" disabled><input id="b"><div id="c"></div>');
    const snap = createSnapshot();
    applyGodMode(document, { ...DEFAULT_GOD_MODE_OPTIONS }, snap, VISIBLE_ENV);
    expect($('#a').hasAttribute(GOD_MARKER_ATTR)).toBe(true);
    expect($('#b').hasAttribute(GOD_MARKER_ATTR)).toBe(false);
    expect($('#c').hasAttribute(GOD_MARKER_ATTR)).toBe(false);
    // …so the undo snapshot holds the unlocked element only, not the document.
    expect(snap.size).toBe(1);
  });
});

describe('dropValidation', () => {
  it('SETS step to "any" rather than removing it', () => {
    // An absent step on a number input means step=1, so removing it would leave
    // 1.5 invalid — the opposite of what the tool promises.
    mount('<input id="a" type="number" step="5">');
    const snap = createSnapshot();
    applyGodMode(document, ALL_ON, snap, VISIBLE_ENV);
    expect($('#a').getAttribute('step')).toBe('any');
    revertGodMode(snap);
    expect($('#a').getAttribute('step')).toBe('5');
  });

  it('ADDS novalidate, so undo REMOVES it', () => {
    // novalidate is the one inverted lock: the fix is to add the attribute.
    mount('<form id="f"></form>');
    const snap = createSnapshot();
    applyGodMode(document, ALL_ON, snap, VISIBLE_ENV);
    expect($('#f').hasAttribute('novalidate')).toBe(true);
    revertGodMode(snap);
    expect($('#f').hasAttribute('novalidate')).toBe(false);
  });

  it('keeps a form that was already novalidate that way after revert', () => {
    mount('<form id="f" novalidate></form>');
    const snap = createSnapshot();
    applyGodMode(document, ALL_ON, snap, VISIBLE_ENV);
    revertGodMode(snap);
    expect($('#f').hasAttribute('novalidate')).toBe(true);
  });

  it('does not strip min/max off a non-input like <meter>', () => {
    mount('<meter id="m" min="0" max="10" value="5"></meter>');
    const snap = createSnapshot();
    applyGodMode(document, ALL_ON, snap, VISIBLE_ENV);
    expect($('#m').getAttribute('min')).toBe('0');
    expect($('#m').getAttribute('max')).toBe('10');
  });
});

describe('unlockOptions', () => {
  it('re-enables disabled and hidden options', () => {
    mount(
      '<select id="s"><option id="o1" disabled>A</option><option id="o2" hidden>B</option></select>'
    );
    const snap = createSnapshot();
    applyGodMode(document, ALL_ON, snap, VISIBLE_ENV);
    expect($('#o1').hasAttribute('disabled')).toBe(false);
    expect($('#o2').hasAttribute('hidden')).toBe(false);
    revertGodMode(snap);
    expect($('#o1').hasAttribute('disabled')).toBe(true);
    expect($('#o2').hasAttribute('hidden')).toBe(true);
  });
});

describe('revealHidden', () => {
  it('strips hidden/inert/aria-hidden and marks what is still display:none', () => {
    mount('<div id="a" hidden inert aria-hidden="true"></div>');
    const snap = createSnapshot();
    applyGodMode(document, ALL_ON, snap, HIDDEN_ENV);
    const el = $('#a');
    expect(el.hasAttribute('hidden')).toBe(false);
    expect(el.hasAttribute('inert')).toBe(false);
    expect(el.hasAttribute('aria-hidden')).toBe(false);
    expect(el.getAttribute(GOD_MARKER_ATTR)).toContain('show');
  });

  it('does not mark an element that is already visible', () => {
    // `display: revert !important` would discard a legitimate author display:flex.
    mount('<div id="a" hidden></div>');
    const snap = createSnapshot();
    applyGodMode(document, ALL_ON, snap, VISIBLE_ENV);
    expect($('#a').getAttribute(GOD_MARKER_ATTR) ?? '').not.toContain('show');
  });

  it('round-trips inert exactly', () => {
    mount('<div id="a" inert></div>');
    const snap = createSnapshot();
    applyGodMode(document, ALL_ON, snap, VISIBLE_ENV);
    expect($('#a').hasAttribute('inert')).toBe(false);
    revertGodMode(snap);
    expect($('#a').hasAttribute('inert')).toBe(true);
  });

  it('turns a hidden input into a visible text input', () => {
    mount('<input id="a" type="hidden" value="secret">');
    const snap = createSnapshot();
    applyGodMode(document, ALL_ON, snap, VISIBLE_ENV);
    expect($('#a').getAttribute('type')).toBe('text');
    revertGodMode(snap);
    expect($('#a').getAttribute('type')).toBe('hidden');
  });
});

describe('revealPasswords', () => {
  it('is off by default', () => {
    mount('<input id="a" type="password">');
    const snap = createSnapshot();
    applyGodMode(document, DEFAULT_GOD_MODE_OPTIONS, snap, VISIBLE_ENV);
    expect($('#a').getAttribute('type')).toBe('password');
  });

  it('reveals and restores when enabled', () => {
    mount('<input id="a" type="password">');
    const snap = createSnapshot();
    const report = applyGodMode(document, ALL_ON, snap, VISIBLE_ENV);
    expect($('#a').getAttribute('type')).toBe('text');
    expect(report.counts.passwords).toBe(1);
    revertGodMode(snap);
    expect($('#a').getAttribute('type')).toBe('password');
  });
});

describe('GodModeReport', () => {
  it('carries counts and strings only — never a DOM node', () => {
    mount('<input id="a" disabled required>');
    const snap = createSnapshot();
    const report = applyGodMode(document, ALL_ON, snap, VISIBLE_ENV);

    // Structured-clone-ability is what actually matters when this crosses the wire.
    const roundTripped = JSON.parse(JSON.stringify(report)) as unknown;
    expect(roundTripped).toEqual(report);
    expect(JSON.stringify(report)).not.toContain('input');
  });

  it('totals the per-category counts', () => {
    mount('<input id="a" disabled><input id="b" required>');
    const snap = createSnapshot();
    const report = applyGodMode(document, ALL_ON, snap, VISIBLE_ENV);
    const sum = Object.values(report.counts).reduce((a, b) => a + b, 0);
    expect(report.total).toBe(sum);
    expect(report.counts.enabled).toBe(1);
    expect(report.counts.validation).toBe(1);
  });

  it('warns when shadow DOM was not pierced', () => {
    mount('<input id="a" disabled>');
    const snap = createSnapshot();
    const report = applyGodMode(
      document,
      { ...ALL_ON, shouldPierceShadowDom: false },
      snap,
      VISIBLE_ENV
    );
    expect(report.warnings.join(' ')).toMatch(/Shadow DOM was not pierced/);
  });
});

describe('shadow DOM', () => {
  it('unlocks fields inside an open shadow root when asked', () => {
    mount('<div id="host"></div>');
    const shadow = $('#host').attachShadow({ mode: 'open' });
    shadow.innerHTML = '<input id="inner" disabled>';

    const snap = createSnapshot();
    const report = applyGodMode(document, ALL_ON, snap, VISIBLE_ENV);

    expect(shadow.querySelector('#inner')?.hasAttribute('disabled')).toBe(false);
    expect(report.shadowRoots).toBe(1);
  });

  it('leaves shadow content alone when piercing is off', () => {
    mount('<div id="host"></div>');
    const shadow = $('#host').attachShadow({ mode: 'open' });
    shadow.innerHTML = '<input id="inner" disabled>';

    const snap = createSnapshot();
    applyGodMode(document, { ...ALL_ON, shouldPierceShadowDom: false }, snap, VISIBLE_ENV);
    expect(shadow.querySelector('#inner')?.hasAttribute('disabled')).toBe(true);
  });
});

describe('pruneDetached', () => {
  it('drops entries for elements the page has thrown away', () => {
    mount('<input id="a" disabled><input id="b" disabled>');
    const snap = createSnapshot();
    applyGodMode(document, ALL_ON, snap, VISIBLE_ENV);
    expect(snap.size).toBe(2);

    $('#a').remove();
    expect(pruneDetached(snap)).toBe(1);
    expect(snap.size).toBe(1);
  });
});

describe('buildUnlockScript', () => {
  it('emits only the locks the options asked for', () => {
    const script = buildUnlockScript({
      ...DEFAULT_GOD_MODE_OPTIONS,
      shouldDropValidation: false,
      shouldRevealHidden: false,
    });
    expect(script).toContain('"disabled"');
    expect(script).toContain('"readonly"');
    expect(script).not.toContain('"required"');
    expect(script).not.toContain('"hidden"');
  });

  it('produces syntactically valid JavaScript', () => {
    // Parsed, never executed — the repo forbids eval outside the sanctioned runner.
    const script = buildUnlockScript(ALL_ON);
    expect(() => new TextEncoder().encode(script)).not.toThrow();
    expect(script.split('{').length).toBe(script.split('}').length);
    expect(script).toContain("console.log('[Senmurv] unlocked '");
  });
});
