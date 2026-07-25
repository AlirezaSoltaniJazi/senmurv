import { MESSAGE_TYPES } from '@/shared/constants';
import { notify, notifyQuiet } from '@/content/context';
import { buildLocatorSet } from '@/shared/locators';
import {
  clearOverlay,
  destroyOverlay,
  disableCapture,
  drawBoxes,
  enableCapture,
  flashOverlay,
  targetAt,
} from '@/content/overlay';
import { rafThrottle } from '@/content/raf-throttle';
import type { RafThrottled } from '@/content/raf-throttle';
import {
  computeBoxModel,
  computeDistance,
  normalizeRegion,
  round,
  toRegion,
} from '@/shared/tools/measure';
import type { MeasureRect } from '@/shared/tools/measure';
import type { BoxModel, DistanceReading, MeasureData, MeasureMode } from '@/shared/types';

/**
 * The in-page Measure mode: drag a region, hover an element for its box model,
 * or span two elements for the gap between them. Reads live geometry (which is
 * why it lives here, not in the pure module) and pushes readings to the panel.
 *
 * The live W×H label is drawn in-page every frame (zero IPC); the TOOL_STREAM to
 * the panel is throttled, and the final TOOL_PICKED is sent on commit.
 */

let mode: MeasureMode = 'element';
let active = false;
let dragStart: { x: number; y: number } | null = null;
let distanceFirst: MeasureRect | null = null;
let lastSig = '';
let lastSent = 0;
let hoverHandle: RafThrottled | null = null;

// ---------------------------------------------------------------------------
// DOM reads
// ---------------------------------------------------------------------------

function px(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function rectOf(el: Element): MeasureRect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function readBoxModel(el: HTMLElement): { box: BoxModel; rect: MeasureRect } {
  const rect = rectOf(el);
  const s = getComputedStyle(el);
  const box = computeBoxModel({
    borderBoxWidth: rect.width,
    borderBoxHeight: rect.height,
    padding: {
      top: px(s.paddingTop),
      right: px(s.paddingRight),
      bottom: px(s.paddingBottom),
      left: px(s.paddingLeft),
    },
    border: {
      top: px(s.borderTopWidth),
      right: px(s.borderRightWidth),
      bottom: px(s.borderBottomWidth),
      left: px(s.borderLeftWidth),
    },
    margin: {
      top: px(s.marginTop),
      right: px(s.marginRight),
      bottom: px(s.marginBottom),
      left: px(s.marginLeft),
    },
    transform: s.transform,
  });
  return { box, rect };
}

// ---------------------------------------------------------------------------
// Panel messaging
// ---------------------------------------------------------------------------

/** Throttled live push: only on a changed reading, at most ~10 Hz. */
function stream(data: MeasureData): void {
  // Cheap time gate before the expensive JSON.stringify (skipped on dropped frames).
  const now = Date.now();
  if (now - lastSent < 100) return;
  const sig = JSON.stringify(data);
  if (sig === lastSig) return;
  lastSig = sig;
  lastSent = now;
  notifyQuiet({ type: MESSAGE_TYPES.TOOL_STREAM, payload: { tool: 'measure', data } });
}

/** Terminal push on commit. Element/distance picks carry a locator set. */
function commit(data: MeasureData, el?: Element): void {
  const payload =
    el === undefined
      ? { tool: 'measure' as const, data }
      : { tool: 'measure' as const, data, locators: buildLocatorSet(el, document) };
  notify({ type: MESSAGE_TYPES.TOOL_PICKED, payload }, stopMeasure);
}

// ---------------------------------------------------------------------------
// Element mode
// ---------------------------------------------------------------------------

function boxLabel(box: BoxModel): string {
  return `${round(box.borderBox.width)} × ${round(box.borderBox.height)}`;
}

function drawElement(rect: MeasureRect, label: string): void {
  drawBoxes([{ left: rect.left, top: rect.top, width: rect.width, height: rect.height, label }]);
}

function onElementHover(e: MouseEvent): void {
  const el = targetAt(e.clientX, e.clientY);
  // elementFromPoint legitimately returns an SVGElement on charts/icons, where
  // offset/box reads are undefined — guard before touching them.
  if (!(el instanceof HTMLElement)) return;
  const { box, rect } = readBoxModel(el);
  drawElement(rect, boxLabel(box));
  stream({ mode: 'element', box, tag: el.tagName.toLowerCase() });
}

function onElementPick(e: MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  const el = targetAt(e.clientX, e.clientY);
  if (!(el instanceof HTMLElement)) return;
  const { box, rect } = readBoxModel(el);
  drawElement(rect, boxLabel(box));
  flashOverlay();
  commit({ mode: 'element', box, tag: el.tagName.toLowerCase() }, el);
}

// ---------------------------------------------------------------------------
// Distance mode
// ---------------------------------------------------------------------------

function drawPair(a: MeasureRect, b: MeasureRect, label: string): void {
  drawBoxes([
    {
      left: a.left,
      top: a.top,
      width: a.width,
      height: a.height,
      tone: 'accent',
      variant: 'outline',
    },
    { left: b.left, top: b.top, width: b.width, height: b.height, tone: 'good', label },
  ]);
}

function distanceLabel(d: DistanceReading): string {
  // Edge gaps AND centre-to-centre: adjacent elements (e.g. touching table
  // cells) have zero edge gaps, so "↔ 0 ↕ 0" alone looks broken — the ⤢ number
  // stays meaningful.
  return `↔ ${round(d.horizontal)}  ↕ ${round(d.vertical)}  ⤢ ${round(d.centerToCenter)}`;
}

function onDistanceHover(e: MouseEvent): void {
  const el = targetAt(e.clientX, e.clientY);
  if (!(el instanceof HTMLElement)) return;
  const rect = rectOf(el);
  if (distanceFirst === null) {
    drawElement(rect, 'click to anchor');
    return;
  }
  const d = computeDistance(distanceFirst, rect);
  drawPair(distanceFirst, rect, distanceLabel(d));
  stream({ mode: 'distance', distance: d });
}

function onDistancePick(e: MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  const el = targetAt(e.clientX, e.clientY);
  if (!(el instanceof HTMLElement)) return;
  const rect = rectOf(el);
  if (distanceFirst === null) {
    distanceFirst = rect;
    drawElement(rect, 'anchored — pick a second element');
    flashOverlay();
    return;
  }
  const d = computeDistance(distanceFirst, rect);
  drawPair(distanceFirst, rect, distanceLabel(d));
  commit({ mode: 'distance', distance: d });
  distanceFirst = null; // ready for the next pair
}

// ---------------------------------------------------------------------------
// Region mode (drag marquee via the capture layer)
// ---------------------------------------------------------------------------

function drawRegion(rect: MeasureRect): void {
  drawBoxes([
    {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      label: `${round(rect.width)} × ${round(rect.height)}`,
    },
  ]);
}

const regionHandlers = {
  onDown(x: number, y: number): void {
    dragStart = { x, y };
  },
  onMove(x: number, y: number): void {
    if (dragStart === null) return;
    const rect = normalizeRegion(dragStart.x, dragStart.y, x, y);
    drawRegion(rect);
    stream({ mode: 'region', region: toRegion(rect, window.scrollX, window.scrollY) });
  },
  onUp(x: number, y: number): void {
    if (dragStart === null) return;
    const rect = normalizeRegion(dragStart.x, dragStart.y, x, y);
    dragStart = null;
    if (rect.width < 2 && rect.height < 2) return; // a click, not a drag
    drawRegion(rect);
    commit({ mode: 'region', region: toRegion(rect, window.scrollX, window.scrollY) });
  },
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

function attach(): void {
  if (mode === 'region') {
    enableCapture(regionHandlers);
    return;
  }
  const hover = mode === 'element' ? onElementHover : onDistanceHover;
  const pick = mode === 'element' ? onElementPick : onDistancePick;
  hoverHandle = rafThrottle(hover);
  document.addEventListener('mousemove', hoverHandle.handler, true);
  document.addEventListener('click', pick, true);
}

function detach(): void {
  disableCapture();
  if (hoverHandle) {
    document.removeEventListener('mousemove', hoverHandle.handler, true);
    hoverHandle.cancel();
    hoverHandle = null;
  }
  document.removeEventListener('click', onElementPick, true);
  document.removeEventListener('click', onDistancePick, true);
}

/**
 * Start (or re-configure) Measure. Safe to call while already active — it
 * detaches first — so the panel can switch sub-mode by re-sending START.
 */
export function startMeasure(next: MeasureMode = 'element'): void {
  if (active) detach();
  mode = next;
  active = true;
  dragStart = null;
  distanceFirst = null;
  lastSig = '';
  clearOverlay();
  attach();
}

export function stopMeasure(): void {
  if (!active) return;
  active = false;
  detach();
  destroyOverlay();
  dragStart = null;
  distanceFirst = null;
}
