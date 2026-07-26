import { MATCH_HIGHLIGHT_MAX } from '@/shared/constants';
import { clearOverlay, destroyOverlay, drawBoxes } from '@/content/overlay';
import type { OverlayBox } from '@/content/overlay';
import type { LocatorKind, MatchResult, Result } from '@/shared/types';

/**
 * The "highlight every match" mode behind the Locator tab's Test box: draw a
 * numbered outline on every element a CSS/XPath matches, keep the boxes aligned
 * while the page scrolls, and scroll a chosen match into view.
 *
 * It lives in the picker's STATIC graph (only the overlay + document APIs — no
 * `@/shared/tools/*`), so it must never import a Tools-chunk module. The matched
 * elements are retained module-locally and never leave the page.
 */

let active = false;
let elements: Element[] = [];
let selected = -1; // 0-based; −1 when nothing is focused yet
let rafToken = 0;

/** Resolve a CSS selector or XPath to its matching elements (live DOM). */
function queryElements(query: string, kind: LocatorKind): Result<Element[]> {
  try {
    if (kind === 'xpath') {
      // 7 = XPathResult.ORDERED_NODE_SNAPSHOT_TYPE
      const snapshot = document.evaluate(query, document, null, 7, null);
      const out: Element[] = [];
      for (let i = 0; i < snapshot.snapshotLength; i += 1) {
        const node = snapshot.snapshotItem(i);
        if (node instanceof Element) out.push(node);
      }
      return { ok: true, value: out };
    }
    return { ok: true, value: Array.from(document.querySelectorAll(query)) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function draw(): void {
  const boxes: OverlayBox[] = elements.map((el, i) => {
    const r = el.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      variant: i === selected ? 'tinted' : 'outline',
      tone: i === selected ? 'good' : 'accent',
      label: String(i + 1),
    };
  });
  drawBoxes(boxes);
}

/** Redraw at current rects, coalesced to one per frame (scroll/resize). */
function scheduleRedraw(): void {
  if (rafToken !== 0) return;
  rafToken = requestAnimationFrame(() => {
    rafToken = 0;
    if (active) draw();
  });
}

/** Is the highlight mode currently running? (For the arbiter.) */
export function isMatchActive(): boolean {
  return active;
}

/**
 * Highlight every match of `query`. Re-callable to update the drawing live as
 * the query changes; an invalid selector tears the mode down and reports why.
 */
export function startMatch(query: string, kind: LocatorKind): Result<MatchResult> {
  const found = queryElements(query, kind);
  if (!found.ok) {
    stopMatch();
    return found;
  }
  const total = found.value.length;
  elements = found.value.slice(0, MATCH_HIGHLIGHT_MAX);
  if (selected >= elements.length) selected = -1;
  if (!active) {
    active = true;
    window.addEventListener('scroll', scheduleRedraw, true);
    window.addEventListener('resize', scheduleRedraw, true);
  }
  draw();
  return { ok: true, value: { count: total, shown: elements.length, selected } };
}

/** Scroll the 1-based `index`th match into view and mark it selected. */
export function scrollToMatch(index: number): Result<MatchResult> {
  if (!active) return { ok: false, error: 'Highlighting is not active.' };
  const el = elements[index - 1];
  if (!el) return { ok: false, error: 'That match no longer exists — re-highlight the page.' };
  selected = index - 1;
  el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  draw();
  return { ok: true, value: { count: elements.length, shown: elements.length, selected } };
}

/** Tear down: drop the elements, remove listeners, and clear the overlay. */
export function stopMatch(): void {
  if (!active && elements.length === 0) return;
  active = false;
  selected = -1;
  elements = [];
  window.removeEventListener('scroll', scheduleRedraw, true);
  window.removeEventListener('resize', scheduleRedraw, true);
  if (rafToken !== 0) {
    cancelAnimationFrame(rafToken);
    rafToken = 0;
  }
  clearOverlay();
  destroyOverlay();
}
