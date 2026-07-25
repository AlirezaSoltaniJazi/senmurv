import { beforeEach, describe, expect, it } from 'vitest';
import {
  computeTabOrder,
  effectiveTabIndex,
  parseTabIndexAttr,
  STRUCTURAL_ENV,
} from '@/shared/tools/tab-order';
import type { DomEnv } from '@/shared/tools/tab-order';

function mount(html: string): void {
  document.body.innerHTML = html;
}

/** The ordered stops as `tag#id` (or `tag` when no id), for compact assertions. */
function order(): string[] {
  const { elements } = computeTabOrder(document, STRUCTURAL_ENV);
  return elements.map((el) => {
    const id = el.getAttribute('id');
    return id ? `${el.tagName.toLowerCase()}#${id}` : el.tagName.toLowerCase();
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('parseTabIndexAttr — HTML integer parsing (never el.tabIndex)', () => {
  it('parses a leading integer even with a trailing unit', () => {
    expect(parseTabIndexAttr('3px')).toBe(3); // Chrome parses 3; happy-dom el.tabIndex gives -1
    expect(parseTabIndexAttr('0')).toBe(0);
    expect(parseTabIndexAttr('-1')).toBe(-1);
    expect(parseTabIndexAttr('  5')).toBe(5);
  });

  it('treats a present-but-invalid value as focusable (0), and absent as null', () => {
    expect(parseTabIndexAttr('abc')).toBe(0);
    expect(parseTabIndexAttr('')).toBe(0);
    expect(parseTabIndexAttr(null)).toBeNull();
  });
});

describe('effectiveTabIndex', () => {
  it('gives a bare <a> no tab stop but an <a href> a 0', () => {
    mount('<a id="x">no href</a><a id="y" href="#">has href</a>');
    // happy-dom's el.tabIndex reports 0 for the bare <a> — we must not.
    expect(effectiveTabIndex(document.querySelector('#x') as Element)).toBeNull();
    expect(effectiveTabIndex(document.querySelector('#y') as Element)).toBe(0);
  });

  it('honours an explicit tabindex over native focusability', () => {
    mount('<button id="b" tabindex="-1">x</button>');
    expect(effectiveTabIndex(document.querySelector('#b') as Element)).toBe(-1);
  });
});

describe('computeTabOrder — sequence', () => {
  it('orders positive tabindex first (ascending), then 0 / native in DOM order', () => {
    mount(`
      <button id="a">a</button>
      <input id="b" tabindex="2">
      <a id="c" href="#">c</a>
      <button id="d" tabindex="1">d</button>`);
    expect(order()).toEqual(['button#d', 'input#b', 'button#a', 'a#c']);
  });

  it('excludes tabindex="-1", disabled, and hidden inputs', () => {
    mount(`
      <button id="a">a</button>
      <button id="b" tabindex="-1">b</button>
      <button id="c" disabled>c</button>
      <input id="d" type="hidden">
      <input id="e">`);
    expect(order()).toEqual(['button#a', 'input#e']);
  });

  it('excludes controls inside a disabled fieldset (but not its legend)', () => {
    mount(`
      <fieldset disabled>
        <legend><button id="legend-btn">ok</button></legend>
        <input id="inside">
      </fieldset>
      <input id="outside">`);
    expect(order()).toEqual(['button#legend-btn', 'input#outside']);
  });
});

describe('computeTabOrder — radio groups', () => {
  it('keeps only the checked radio of a named group', () => {
    mount(`
      <input type="radio" name="g" id="r1">
      <input type="radio" name="g" id="r2" checked>
      <input type="radio" name="g" id="r3">
      <input id="after">`);
    expect(order()).toEqual(['input#r2', 'input#after']);
  });

  it('keeps the first radio when none is checked', () => {
    mount(`
      <input type="radio" name="g" id="r1">
      <input type="radio" name="g" id="r2">`);
    expect(order()).toEqual(['input#r1']);
  });
});

describe('computeTabOrder — flattened shadow tree', () => {
  it('interleaves slotted light children in flattened order: b, button, i', () => {
    // The load-bearing shadow test: <slot> pulls the light <button> between the
    // shadow's own <b tabindex=0> and <i tabindex=0>. A plain querySelectorAll
    // would never produce this order.
    mount('<div id="host"><button id="light">light</button></div>');
    const host = document.querySelector('#host') as HTMLElement;
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<b id="b" tabindex="0">b</b><slot></slot><i id="i" tabindex="0">i</i>';

    const { elements } = computeTabOrder(document, STRUCTURAL_ENV);
    expect(elements.map((el) => el.id)).toEqual(['b', 'light', 'i']);
  });

  it('keeps a positive tabindex scoped inside its shadow root', () => {
    // tabindex=5 inside the shadow must NOT jump ahead of the document's own
    // tabindex=1 — positive order is per-scope.
    mount('<button id="doc" tabindex="1">doc</button><div id="host"></div>');
    const shadow = (document.querySelector('#host') as HTMLElement).attachShadow({ mode: 'open' });
    shadow.innerHTML = '<button id="s5" tabindex="5">s5</button><button id="s0">s0</button>';

    const { elements } = computeTabOrder(document, STRUCTURAL_ENV);
    // doc(1) comes first (document scope), then the shadow scope in its order: s5 then s0.
    expect(elements.map((el) => el.id)).toEqual(['doc', 's5', 's0']);
  });

  it('walks a non-delegating shadow scope in order (delegatesFocus is Chrome-only)', () => {
    // happy-dom hardcodes shadowRoot.delegatesFocus = false regardless of the
    // attachShadow option, so the collapse-to-one-stop behaviour is verified in
    // the real-Chrome pass. Here we confirm the ordinary (non-delegating) walk.
    mount(
      '<button id="before">before</button><div id="host"></div><button id="after">after</button>'
    );
    const shadow = (document.querySelector('#host') as HTMLElement).attachShadow({ mode: 'open' });
    shadow.innerHTML = '<input id="inner1"><input id="inner2">';

    const { elements } = computeTabOrder(document, STRUCTURAL_ENV);
    expect(elements.map((el) => el.id)).toEqual(['before', 'inner1', 'inner2', 'after']);
  });
});

describe('computeTabOrder — issues', () => {
  it('flags a positive tabindex and a missing accessible name', () => {
    mount('<button id="a" tabindex="3"></button>');
    const { stops } = computeTabOrder(document, STRUCTURAL_ENV);
    expect(stops[0]?.issues).toContain('positive-tabindex');
    expect(stops[0]?.issues).toContain('no-accessible-name');
  });

  it('does not flag a well-named, zero-tabindex control', () => {
    mount('<button id="a">Save</button>');
    const { stops } = computeTabOrder(document, STRUCTURAL_ENV);
    expect(stops[0]?.issues).toEqual([]);
    expect(stops[0]?.name).toBe('Save');
  });

  it('flags order-mismatch when tabbing moves visually backwards', () => {
    mount('<button id="a">a</button><button id="b">b</button>');
    // Inject geometry: #a sits BELOW #b, so tab a→b moves up the page.
    const rects: Record<string, { top: number; left: number }> = {
      a: { top: 200, left: 0 },
      b: { top: 10, left: 0 },
    };
    const env: DomEnv = {
      ...STRUCTURAL_ENV,
      rectOf: (el) => rects[(el as HTMLElement).id] ?? null,
    };
    const { stops } = computeTabOrder(document, env);
    expect(stops[1]?.issues).toContain('order-mismatch'); // the 2nd stop (#b) is above the 1st
  });
});

describe('computeTabOrder — visibility via env', () => {
  it('drops elements the env reports as not rendered', () => {
    mount('<button id="a">a</button><button id="b">b</button>');
    const env: DomEnv = {
      ...STRUCTURAL_ENV,
      isRendered: (el) => (el as HTMLElement).id !== 'b',
    };
    const { elements } = computeTabOrder(document, env);
    expect(elements.map((el) => el.id)).toEqual(['a']);
  });

  it('drops inert elements', () => {
    mount('<button id="a">a</button><button id="b">b</button>');
    const env: DomEnv = { ...STRUCTURAL_ENV, isInert: (el) => (el as HTMLElement).id === 'a' };
    const { elements } = computeTabOrder(document, env);
    expect(elements.map((el) => el.id)).toEqual(['b']);
  });
});
