import { MESSAGE_TYPES, TAB_ORDER_MAX_STOPS } from '@/shared/constants';
import { notifyQuiet } from '@/content/context';
import { isOurHost } from '@/content/overlay';
import { drawBoxes, clearOverlay, destroyOverlay } from '@/content/overlay';
import type { OverlayBox, OverlayTone } from '@/content/overlay';
import { buildLocatorSet } from '@/shared/locators';
import { computeTabOrder } from '@/shared/tools/tab-order';
import type { DomEnv } from '@/shared/tools/tab-order';
import type { LocatorSet, TabOrderScan, TabStop } from '@/shared/types';

/**
 * In-page Tab-order mode: compute the keyboard tab sequence, draw a numbered
 * badge on each stop, keep the badges aligned while the page scrolls, and flag
 * the DOM going stale so the panel can offer a rescan.
 *
 * The elements are retained module-locally (never sent), so the panel can fetch
 * a stop's locators lazily — computing 500 locator sets eagerly would run
 * thousands of whole-document querySelectorAll calls.
 */

let active = false;
let elements: Element[] = [];
let stops: TabStop[] = [];
let selected = -1;
let observer: MutationObserver | null = null;
let rafToken = 0;
let staleTimer: ReturnType<typeof setTimeout> | undefined;

// Open, :modal dialogs — recomputed once per scanTabOrder() call (see there)
// rather than re-queried per candidate element. The scan is synchronous, so
// the answer cannot change mid-computation and the cache is always fresh for
// the whole walk it's used in.
let modalDialogs: Element[] = [];

function computeModalDialogs(): Element[] {
  const modal: Element[] = [];
  for (const dialog of Array.from(document.querySelectorAll('dialog[open]'))) {
    try {
      if (dialog.matches(':modal')) modal.push(dialog);
    } catch {
      // :modal unsupported — ignore.
    }
  }
  return modal;
}

/** A modal <dialog> makes everything outside it inert. */
function coveredByModal(el: Element): boolean {
  for (const dialog of modalDialogs) {
    if (!dialog.contains(el)) return true;
  }
  return false;
}

const BROWSER_ENV: DomEnv = {
  isRendered: (el) => {
    const withCheck = el as Element & {
      checkVisibility?: (opts?: { visibilityProperty?: boolean }) => boolean;
    };
    // Deliberately NOT passing contentVisibilityAuto — content-visibility:auto
    // skipped content is still focusable, and that flag would delete real stops.
    if (typeof withCheck.checkVisibility === 'function') {
      return withCheck.checkVisibility({ visibilityProperty: true });
    }
    return true;
  },
  isInert: (el) => {
    const inert = (el as HTMLElement).inert === true || el.closest('[inert]') !== null;
    return inert || coveredByModal(el);
  },
  isOffscreen: (el) => {
    const r = el.getBoundingClientRect();
    return r.bottom < 0 || r.right < 0 || r.top > window.innerHeight || r.left > window.innerWidth;
  },
  rectOf: (el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left };
  },
};

function toneFor(stop: TabStop, isSelected: boolean): OverlayTone {
  if (isSelected) return 'good';
  if (stop.issues.includes('positive-tabindex') || stop.issues.includes('order-mismatch')) {
    return 'warn';
  }
  return 'accent';
}

function drawBadges(): void {
  const boxes: OverlayBox[] = elements.map((el, i) => {
    const r = el.getBoundingClientRect();
    const stop = stops[i] as TabStop;
    return {
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      variant: i === selected ? 'tinted' : 'outline',
      tone: toneFor(stop, i === selected),
      label: String(i + 1),
    };
  });
  drawBoxes(boxes);
}

/** Redraw badges at current rects, coalesced to one per frame (for scroll/resize). */
function scheduleRedraw(): void {
  if (rafToken !== 0) return;
  rafToken = requestAnimationFrame(() => {
    rafToken = 0;
    if (active) drawBadges();
  });
}

function markStale(): void {
  clearTimeout(staleTimer);
  staleTimer = setTimeout(() => {
    if (active) {
      notifyQuiet({
        type: MESSAGE_TYPES.TOOL_STREAM,
        payload: { tool: 'taborder', data: { stale: true } },
      });
    }
  }, 200);
}

/** Compute the tab order, retain elements, draw badges, and (re)arm the observers. */
export function scanTabOrder(): TabOrderScan {
  active = true;
  selected = -1;
  modalDialogs = computeModalDialogs();
  const result = computeTabOrder(document, BROWSER_ENV);
  elements = result.elements.slice(0, TAB_ORDER_MAX_STOPS);
  stops = result.stops.slice(0, TAB_ORDER_MAX_STOPS);

  const warnings: string[] = [
    'Computed from the DOM (Chrome, top frame only). Closed shadow roots, cross-origin frames, roving tabindex and JS focus managers are not visible.',
  ];
  if (result.elements.length > TAB_ORDER_MAX_STOPS) {
    warnings.push(`Showing the first ${TAB_ORDER_MAX_STOPS} of ${result.elements.length} stops.`);
  }
  // A subtree observer on documentElement does NOT see mutations inside shadow
  // roots — say so rather than silently miss them.
  if (elements.some((el) => el.getRootNode() !== document)) {
    warnings.push(
      'Some stops are inside shadow roots; changes there will not trigger the stale prompt.'
    );
  }

  drawBadges();
  startObservers();
  return { stops, warnings };
}

/**
 * Scroll a stop into view, highlight it among the badges, and return its
 * locators. Throws when the stop is gone so the caller's Result wrapper reports
 * it (withTools in picker.ts).
 */
export function stopLocators(index: number): LocatorSet {
  const el = elements[index - 1];
  if (!el) throw new Error('That tab stop no longer exists — rescan the page.');
  selected = index - 1;
  el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  drawBadges();
  return buildLocatorSet(el, document);
}

// The only attributes that change what is focusable or where it sits in the tab
// order. Filtering to these stops an unrelated attribute storm (class/style/data-*
// churn on a busy SPA) from firing markStale on every mutation, while childList +
// subtree still catch focusable elements being added or removed — the dominant
// staleness signal. Accepted gap: a stop toggled only via an unlisted attribute
// won't prompt a rescan until the next add/remove.
const TAB_ORDER_ATTRS = [
  'tabindex',
  'disabled',
  'hidden',
  'inert',
  'contenteditable',
  'href',
  'type',
  'role',
  'aria-hidden',
];

function startObservers(): void {
  observer?.disconnect();
  observer = new MutationObserver((records) => {
    // Ignore our own overlay mutations.
    if (records.every((r) => isOurHost(r.target) || isOurHost(r.target.parentNode))) return;
    markStale();
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: TAB_ORDER_ATTRS,
  });
  window.addEventListener('scroll', scheduleRedraw, true);
  window.addEventListener('resize', scheduleRedraw, true);
}

export function startTabOrder(): void {
  active = true;
}

export function stopTabOrder(): void {
  active = false;
  selected = -1;
  elements = [];
  stops = [];
  observer?.disconnect();
  observer = null;
  window.removeEventListener('scroll', scheduleRedraw, true);
  window.removeEventListener('resize', scheduleRedraw, true);
  clearTimeout(staleTimer);
  if (rafToken !== 0) {
    cancelAnimationFrame(rafToken);
    rafToken = 0;
  }
  clearOverlay();
  destroyOverlay();
}
