import { getAccessibleName, getRole } from '@/shared/locators';
import type { TabIssue, TabStop } from '@/shared/types';

/**
 * Compute the page's keyboard tab order — the sequence a user reaches by
 * pressing Tab. This is genuinely subtle, so the rules are spelled out:
 *
 *  - NEVER read `el.tabIndex`. happy-dom reports 0 for `<a>` without href
 *    (should be -1) and -1 for `tabindex="3px"` (Chrome parses the leading 3).
 *    `effectiveTabIndex` parses the attribute itself, per the HTML integer rules.
 *  - Walk the FLATTENED tree: shadow content replaces the host's light children,
 *    and `<slot>` is expanded to its assigned elements.
 *  - Positive tabindex is SCOPED to its focus-navigation scope (the document or
 *    a shadow root); a `tabindex="5"` inside a shadow root must not jump ahead of
 *    the document's own stops. Each scope is ordered independently, then spliced
 *    in at its host's position.
 *
 * Visibility needs a layout engine, which happy-dom lacks, so it is injected via
 * `DomEnv`. `STRUCTURAL_ENV` (everything rendered, nothing inert) drives tests.
 */

export interface DomEnv {
  /** Is the element actually rendered (not display:none / visibility:hidden / zero-size)? */
  isRendered(el: Element): boolean;
  /** Is the element inert (own or inherited `inert`, or covered by a modal dialog)? */
  isInert(el: Element): boolean;
  /** Is the element outside the viewport? (For the offscreen finding only.) */
  isOffscreen(el: Element): boolean;
  /** Viewport-relative top/left, for the order-vs-visual finding. Omit → skip that check. */
  rectOf?(el: Element): { top: number; left: number } | null;
}

/** Test env: everything rendered, nothing inert, nothing offscreen, no geometry. */
export const STRUCTURAL_ENV: DomEnv = {
  isRendered: () => true,
  isInert: () => false,
  isOffscreen: () => false,
};

/** Rows within this many px count as the same line for reading-order comparison. */
const ROW_PX = 12;

const NATIVE_SELECTOR =
  'a[href], area[href], button, input, select, textarea, iframe, object, embed, summary, audio[controls], video[controls]';

/** Parse a `tabindex` attribute per HTML: leading optional sign + digits; present-but-invalid → 0. */
export function parseTabIndexAttr(attr: string | null): number | null {
  if (attr === null) return null;
  const m = /^[\t\n\f\r ]*([+-]?\d+)/.exec(attr);
  return m ? parseInt(m[1] as string, 10) : 0;
}

function isNativelyFocusable(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' && el.getAttribute('type') === 'hidden') return false;
  if (el.matches(NATIVE_SELECTOR)) return true;
  const ce = el.getAttribute('contenteditable');
  return ce !== null && ce !== 'false';
}

/** The element's effective tabindex, or null when it is not focusable at all. */
export function effectiveTabIndex(el: Element): number | null {
  const parsed = parseTabIndexAttr(el.getAttribute('tabindex'));
  if (parsed !== null) return parsed;
  return isNativelyFocusable(el) ? 0 : null;
}

function isDisabled(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  const canDisable = ['button', 'input', 'select', 'textarea', 'fieldset', 'optgroup', 'option'];
  if (canDisable.includes(tag) && el.hasAttribute('disabled')) return true;
  const fieldset = el.closest('fieldset[disabled]');
  if (fieldset) {
    const legend = fieldset.querySelector('legend');
    // Controls inside the first legend of a disabled fieldset stay enabled.
    if (!(legend && legend.contains(el))) return true;
  }
  return false;
}

/** Is this element a tab STOP (focusable AND in the sequence, i.e. tabindex ≥ 0)?
 *  Takes the already-computed effective tabindex so a caller walking many
 *  elements doesn't pay for effectiveTabIndex(el) a second time per element. */
function isTabbableGiven(tab: number | null, el: Element, env: DomEnv): boolean {
  if (tab === null || tab < 0) return false;
  if (isDisabled(el)) return false;
  if (!env.isRendered(el)) return false;
  if (env.isInert(el)) return false;
  return true;
}

/**
 * Only ONE radio in a named group is tabbable: the checked one, or the first in
 * DOM order when none is checked. This filters the others out of `candidates`.
 */
function dropUntabbableRadios(candidates: Element[]): Element[] {
  const groups = new Map<string, HTMLInputElement[]>();
  for (const el of candidates) {
    if (el instanceof HTMLInputElement && el.type === 'radio' && el.name !== '') {
      const list = groups.get(el.name) ?? [];
      list.push(el);
      groups.set(el.name, list);
    }
  }
  const drop = new Set<Element>();
  for (const radios of groups.values()) {
    const keep = radios.find((r) => r.checked) ?? radios[0];
    for (const r of radios) if (r !== keep) drop.add(r);
  }
  return candidates.filter((el) => !drop.has(el));
}

/** The flattened children of a node: shadow content, with `<slot>` expanded. */
function flattenedChildren(node: Element | ShadowRoot): Element[] {
  const host = (node as Element).shadowRoot;
  const source = host ?? node;
  const out: Element[] = [];
  for (const child of Array.from(source.children)) {
    if (child.tagName.toLowerCase() === 'slot') {
      out.push(...(child as HTMLSlotElement).assignedElements({ flatten: true }));
    } else {
      out.push(child);
    }
  }
  return out;
}

interface ScopeItem {
  readonly tab: number;
  /** A single element, or a spliced child-scope sequence positioned at its host. */
  readonly el?: Element;
  readonly group?: Element[];
}

/**
 * Order one focus-navigation scope (the document tree, or a shadow root),
 * recursing into child scopes and splicing each in at its host's position.
 */
function orderScope(scopeRoot: Element | ShadowRoot, env: DomEnv): Element[] {
  const items: ScopeItem[] = [];

  const walk = (node: Element | ShadowRoot): void => {
    for (const el of flattenedChildren(node)) {
      const shadow = el.shadowRoot;
      const tab = effectiveTabIndex(el);
      if (shadow) {
        // A shadow host opens a child scope. Its light children are slotted into
        // that scope, so we do NOT walk them here.
        const hostTab = tab;
        const hostTabbable = isTabbableGiven(tab, el, env);
        const childOrder = orderScope(shadow, env);
        const delegates = shadow.delegatesFocus === true;
        if (delegates) {
          // The whole subtree collapses to ONE stop: the host, reachable when
          // it or any descendant is focusable.
          if ((hostTab !== null && hostTab >= 0 && hostTabbable) || childOrder.length > 0) {
            const target = hostTabbable ? el : (childOrder[0] as Element);
            items.push({ tab: hostTab ?? 0, el: target });
          }
        } else {
          if (hostTabbable) items.push({ tab: hostTab as number, el });
          if (childOrder.length > 0) items.push({ tab: hostTab ?? 0, group: childOrder });
        }
      } else {
        if (isTabbableGiven(tab, el, env)) items.push({ tab: tab as number, el });
        walk(el);
      }
    }
  };
  walk(scopeRoot);

  // Within the scope: positive tabindex first (ascending, ties keep DOM order),
  // then everything with tabindex 0 in DOM order. Array#sort is stable.
  const positives = items.filter((i) => i.tab > 0).sort((a, b) => a.tab - b.tab);
  const zeros = items.filter((i) => i.tab === 0);
  const flat: Element[] = [];
  for (const item of [...positives, ...zeros]) {
    if (item.group) flat.push(...item.group);
    else if (item.el) flat.push(item.el);
  }
  return flat;
}

function issuesFor(el: Element, tab: number, name: string, env: DomEnv): TabIssue[] {
  const issues: TabIssue[] = [];
  if (tab > 0) issues.push('positive-tabindex');
  if (name === '') issues.push('no-accessible-name');
  if (env.isOffscreen(el)) issues.push('offscreen');
  return issues;
}

/**
 * Positions (0-based) where tabbing moves you visually BACKWARDS — the stop
 * sits before its predecessor in reading order (top-to-bottom, then left). Skips
 * when no geometry is available.
 */
function orderMismatches(elements: Element[], env: DomEnv): Set<number> {
  const mismatches = new Set<number>();
  if (!env.rectOf) return mismatches;
  const rects = elements.map((el) => env.rectOf?.(el) ?? null);

  const readingRank = new Array<number>(elements.length);
  elements
    .map((_, i) => i)
    .sort((a, b) => {
      const ra = rects[a];
      const rb = rects[b];
      if (!ra || !rb) return 0;
      const rowA = Math.round(ra.top / ROW_PX);
      const rowB = Math.round(rb.top / ROW_PX);
      return rowA !== rowB ? rowA - rowB : ra.left - rb.left;
    })
    .forEach((elIndex, rank) => {
      readingRank[elIndex] = rank;
    });

  for (let i = 1; i < elements.length; i += 1) {
    const prev = readingRank[i - 1];
    const cur = readingRank[i];
    if (prev !== undefined && cur !== undefined && cur < prev) mismatches.add(i);
  }
  return mismatches;
}

/** Compute the ordered tab stops for `root` (a document or an element subtree). */
export function computeTabOrder(
  root: Document | Element,
  env: DomEnv = STRUCTURAL_ENV
): {
  stops: TabStop[];
  elements: Element[];
} {
  // `instanceof Document`/`ShadowRoot` are unreliable across DOM impls
  // (happy-dom uses different classes), so branch on nodeType.
  const isDocument = root.nodeType === 9; // DOCUMENT_NODE
  const scopeRoot = isDocument ? (root as Document).documentElement : (root as Element);
  const doc = (isDocument ? (root as Document) : (root as Element).ownerDocument) as Document;
  const ordered = dropUntabbableRadios(orderScope(scopeRoot, env));
  const mismatches = orderMismatches(ordered, env);

  const stops: TabStop[] = ordered.map((el, i) => {
    const tab = effectiveTabIndex(el) ?? 0;
    const name = getAccessibleName(el, doc) ?? '';
    const issues = issuesFor(el, tab, name, env);
    if (mismatches.has(i)) issues.push('order-mismatch');
    const rootNode = el.getRootNode();
    return {
      index: i + 1,
      tag: el.tagName.toLowerCase(),
      name,
      tabindex: tab,
      role: getRole(el) ?? '',
      inShadow: rootNode.nodeType === 11 && 'host' in rootNode, // DOCUMENT_FRAGMENT_NODE + host
      issues,
    };
  });

  return { stops, elements: ordered };
}
