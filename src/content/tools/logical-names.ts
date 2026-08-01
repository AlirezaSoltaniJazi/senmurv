import { LOGICAL_NAMES_MAX } from '@/shared/constants';
import { clearOverlay, destroyOverlay, drawBoxes, isOurHost } from '@/content/overlay';
import type { OverlayBox, OverlayTone } from '@/content/overlay';
import type { LogicalNameKind, LogicalNameRecord, LogicalNamesReport } from '@/shared/types';

/**
 * In-page Logical-names mode: draw each Dynamics control's logical (schema) name
 * on the form and keep the labels aligned while the page scrolls.
 *
 * The names themselves cannot be read here — `window.Xrm` lives in the page's
 * MAIN world and this content script runs in the ISOLATED world, which shares
 * the document but no JS objects. So the service worker reads the names in the
 * MAIN world and hands them over as plain data; this module's only job is to
 * resolve each name to an element and draw it.
 *
 * Resolution is by `[data-id]`, never `#id`: Dynamics regenerates element ids
 * per session (they embed a GUID — see `isStableId`), while `data-id` carries
 * the stable logical name.
 */

let active = false;
let elements: Element[] = [];
let records: LogicalNameRecord[] = [];
let observer: MutationObserver | null = null;
let rafToken = 0;

/** Field / section / tab get distinct tones so the three levels read apart. */
function toneFor(kind: LogicalNameKind): OverlayTone {
  if (kind === 'tab') return 'warn';
  if (kind === 'section') return 'good';
  return 'accent';
}

/**
 * The element a logical name labels. Dynamics stamps `data-id` with the logical
 * name, sometimes suffixed (`firstname.fieldControl-text-box-text`), so an exact
 * match is tried first and a prefix match second. Our own overlay is skipped.
 */
function resolve(name: string): Element | null {
  // CSS.escape is universal in Chrome; a logical name containing a quote would
  // otherwise break out of the attribute selector.
  const escaped = CSS.escape(name);
  for (const selector of [`[data-id="${escaped}"]`, `[data-id^="${escaped}"]`]) {
    let found: NodeListOf<Element>;
    try {
      found = document.querySelectorAll(selector);
    } catch {
      continue; // a name that will not escape into a valid selector
    }
    for (const el of Array.from(found)) {
      if (!isOurHost(el)) return el;
    }
  }
  return null;
}

function draw(): void {
  const boxes: OverlayBox[] = [];
  for (let i = 0; i < elements.length; i += 1) {
    const el = elements[i] as Element;
    const record = records[i] as LogicalNameRecord;
    const r = el.getBoundingClientRect();
    // A control on a hidden tab has a zero rect — drawing it would stack empty
    // labels in the top-left corner.
    if (r.width === 0 && r.height === 0) continue;
    boxes.push({
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      variant: 'outline',
      tone: toneFor(record.kind),
      label: record.name,
    });
  }
  drawBoxes(boxes);
}

/** Redraw at current rects, coalesced to one per frame (for scroll/resize). */
function scheduleRedraw(): void {
  if (rafToken !== 0) return;
  rafToken = requestAnimationFrame(() => {
    rafToken = 0;
    if (active) draw();
  });
}

function startObservers(): void {
  observer?.disconnect();
  observer = new MutationObserver((mutations) => {
    // Ignore our own overlay's mutations, or drawing would re-trigger this
    // observer forever.
    if (mutations.every((m) => isOurHost(m.target) || isOurHost(m.target.parentNode))) return;
    scheduleRedraw();
  });
  observer.observe(document.documentElement, { subtree: true, childList: true });
  window.addEventListener('scroll', scheduleRedraw, true);
  window.addEventListener('resize', scheduleRedraw, true);
}

/**
 * Draw the supplied names. Safe to call while already active — the panel
 * re-sends to refresh after the form re-renders, which just replaces the set.
 */
export function drawLogicalNames(next: LogicalNameRecord[]): LogicalNamesReport {
  active = true;
  const capped = next.slice(0, LOGICAL_NAMES_MAX);

  elements = [];
  records = [];
  for (const record of capped) {
    const el = resolve(record.name);
    if (el === null) continue; // not rendered on this tab — counted as unlabelled
    elements.push(el);
    records.push(record);
  }

  draw();
  startObservers();

  const count = (kind: LogicalNameKind): number => capped.filter((r) => r.kind === kind).length;
  return {
    fields: count('field'),
    tabs: count('tab'),
    sections: count('section'),
    labelled: elements.length,
    total: capped.length,
  };
}

/** Mode entry point. The names arrive separately via DRAW_LOGICAL_NAMES. */
export function startLogicalNames(): void {
  active = true;
}

export function stopLogicalNames(): void {
  active = false;
  elements = [];
  records = [];
  observer?.disconnect();
  observer = null;
  window.removeEventListener('scroll', scheduleRedraw, true);
  window.removeEventListener('resize', scheduleRedraw, true);
  if (rafToken !== 0) {
    cancelAnimationFrame(rafToken);
    rafToken = 0;
  }
  clearOverlay();
  destroyOverlay();
}
