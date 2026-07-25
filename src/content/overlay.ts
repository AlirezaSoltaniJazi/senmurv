/**
 * The one in-page overlay, shared by every mode (locator pick, field pick,
 * measure, colour, font, tab order). Extracted from picker.ts.
 *
 * Invariants — each of these is load-bearing, do not "tidy" them away:
 *  - The host's cssText starts with `all: initial`. A shadow root does NOT stop
 *    inherited properties reaching into it, so without this the page's font,
 *    colour and direction leak into our UI.
 *  - The host is `pointer-events: none`, so `document.elementFromPoint` keeps
 *    returning real page elements instead of our own overlay. A mode that needs
 *    to capture the pointer (measure's drag) mounts its own capture layer.
 *  - `z-index: 2147483647` and mounted on `document.documentElement`, never
 *    `body` — a page can transform/position `body` and drag the overlay with it.
 *
 * Only one mode runs at a time (see the arbiter in picker.ts), so one shared
 * module-level overlay is sufficient and keeps teardown in a single place.
 */

import { SENMURV_HOST_TAGS } from '@/shared/constants';

const HOST_TAG = 'senmurv-picker-overlay';

/** Visual tone of a box; maps to the same palette the side panel uses. */
export type OverlayTone = 'accent' | 'good' | 'warn' | 'danger';

/** `tinted` fills the box; `outline` does not — a fill lies about the colour underneath. */
export type OverlayVariant = 'tinted' | 'outline';

/** One box to draw, in viewport (fixed) coordinates. */
export interface OverlayBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  /** Optional caption pinned above the box (below it when there is no room). */
  readonly label?: string;
  readonly variant?: OverlayVariant;
  readonly tone?: OverlayTone;
}

const TONE_COLORS: Record<OverlayTone, string> = {
  accent: '#2d7ff9',
  good: '#3fb950',
  warn: '#d29922',
  danger: '#e5534b',
};

const STYLE = `
  .box {
    position: fixed; pointer-events: none; box-sizing: border-box;
    border: 2px solid #2d7ff9; border-radius: 2px;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6);
    display: none;
  }
  .box.tinted { background: rgba(45, 127, 249, 0.15); }
  .box.smooth { transition: left 40ms ease-out, top 40ms ease-out, width 40ms ease-out, height 40ms ease-out; }
  .label {
    position: fixed; pointer-events: none;
    font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
    color: #fff; background: #2d7ff9; padding: 2px 6px; border-radius: 3px;
    white-space: nowrap; max-width: 90vw; overflow: hidden; text-overflow: ellipsis;
    display: none;
  }
`;

let hostEl: HTMLElement | null = null;
let shadowEl: ShadowRoot | null = null;
const boxPool: HTMLDivElement[] = [];
const labelPool: HTMLDivElement[] = [];

/** Is this node one of Senmurv's own injected hosts? */
export function isOurHost(node: Node | null): boolean {
  if (!node) return false;
  if (node === hostEl) return true;
  const tag = (node as Element).tagName?.toLowerCase();
  return tag !== undefined && (SENMURV_HOST_TAGS as readonly string[]).includes(tag);
}

function ensureOverlay(): ShadowRoot {
  if (shadowEl) return shadowEl;
  hostEl = document.createElement(HOST_TAG);
  hostEl.style.cssText =
    'all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;';
  const shadow = hostEl.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLE;
  shadow.append(style);
  document.documentElement.appendChild(hostEl);
  shadowEl = shadow;
  return shadow;
}

function boxAt(index: number): HTMLDivElement {
  const existing = boxPool[index];
  if (existing) return existing;
  const shadow = ensureOverlay();
  const el = document.createElement('div');
  el.className = 'box';
  shadow.append(el);
  boxPool.push(el);
  return el;
}

function labelAt(index: number): HTMLDivElement {
  const existing = labelPool[index];
  if (existing) return existing;
  const shadow = ensureOverlay();
  const el = document.createElement('div');
  el.className = 'label';
  shadow.append(el);
  labelPool.push(el);
  return el;
}

/**
 * Draw exactly these boxes, reusing pooled nodes. Extra pooled nodes are hidden
 * rather than removed, so a hover stream never churns the DOM.
 *
 * The position transition is enabled only for a single box (hover tracking);
 * with many boxes every one would animate from its previous slot, which reads
 * as the whole overlay sliding around on each rescan.
 */
export function drawBoxes(boxes: readonly OverlayBox[]): void {
  ensureOverlay();
  const smooth = boxes.length === 1;
  let labelIndex = 0;

  boxes.forEach((box, i) => {
    const el = boxAt(i);
    const tone = TONE_COLORS[box.tone ?? 'accent'];
    el.className = `box${box.variant === 'outline' ? '' : ' tinted'}${smooth ? ' smooth' : ''}`;
    el.style.display = 'block';
    el.style.borderColor = tone;
    el.style.left = `${box.left}px`;
    el.style.top = `${box.top}px`;
    el.style.width = `${box.width}px`;
    el.style.height = `${box.height}px`;

    if (box.label !== undefined && box.label !== '') {
      const label = labelAt(labelIndex);
      labelIndex += 1;
      label.textContent = box.label;
      label.style.display = 'block';
      label.style.background = tone;
      label.style.left = `${box.left}px`;
      // Above the box when there is room, otherwise just below it.
      label.style.top = `${box.top > 22 ? box.top - 22 : box.top + box.height + 4}px`;
    }
  });

  for (let i = boxes.length; i < boxPool.length; i += 1) {
    const el = boxPool[i];
    if (el) el.style.display = 'none';
  }
  for (let i = labelIndex; i < labelPool.length; i += 1) {
    const el = labelPool[i];
    if (el) el.style.display = 'none';
  }
}

/** Briefly pulse the first box green — the "captured it" confirmation. */
export function flashOverlay(): void {
  const el = boxPool[0];
  if (!el) return;
  const previous = el.style.borderColor;
  el.style.borderColor = TONE_COLORS.good;
  setTimeout(() => {
    el.style.borderColor = previous;
  }, 200);
}

/** Hide every box and label, keeping the host mounted for the next draw. */
export function clearOverlay(): void {
  for (const el of boxPool) el.style.display = 'none';
  for (const el of labelPool) el.style.display = 'none';
}

/** Remove the host entirely and drop the pools. */
export function destroyOverlay(): void {
  hostEl?.remove();
  hostEl = null;
  shadowEl = null;
  boxPool.length = 0;
  labelPool.length = 0;
}

/** The real page element at a point — our host is pointer-events:none, so it is skipped. */
export function targetAt(x: number, y: number): Element | null {
  const el = document.elementFromPoint(x, y);
  if (!el || isOurHost(el)) return null;
  return el;
}

// ---------------------------------------------------------------------------
// Pointer capture layer (for the Measure drag)
// ---------------------------------------------------------------------------

/** Pointer handlers for a captured drag. Coordinates are viewport (clientX/Y). */
export interface CaptureHandlers {
  onDown(x: number, y: number): void;
  onMove(x: number, y: number): void;
  onUp(x: number, y: number): void;
}

let captureEl: HTMLDivElement | null = null;

/**
 * Mount a full-viewport `pointer-events: auto` layer that swallows the page's
 * own interactions and reports a drag. Used only by modes that draw a marquee
 * — hover modes keep the host `pointer-events: none` so `elementFromPoint` works.
 *
 * `setPointerCapture` keeps the drag alive even when the pointer leaves the
 * window; `touch-action: none` stops the page scrolling under a touch drag.
 */
export function enableCapture(handlers: CaptureHandlers): void {
  if (captureEl) return;
  const shadow = ensureOverlay();
  const layer = document.createElement('div');
  layer.style.cssText =
    'position: fixed; inset: 0; pointer-events: auto; cursor: crosshair; touch-action: none; background: transparent;';

  layer.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    layer.setPointerCapture(e.pointerId);
    handlers.onDown(e.clientX, e.clientY);
  });
  layer.addEventListener('pointermove', (e) => handlers.onMove(e.clientX, e.clientY));
  layer.addEventListener('pointerup', (e) => {
    handlers.onUp(e.clientX, e.clientY);
    if (layer.hasPointerCapture(e.pointerId)) layer.releasePointerCapture(e.pointerId);
  });

  shadow.append(layer);
  captureEl = layer;
}

/** Remove the capture layer, restoring normal page interaction. */
export function disableCapture(): void {
  captureEl?.remove();
  captureEl = null;
}
