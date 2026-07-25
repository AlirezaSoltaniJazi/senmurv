import { MESSAGE_TYPES } from '@/shared/constants';
import { notify } from '@/content/context';
import {
  clearOverlay,
  destroyOverlay,
  drawBoxes,
  flashOverlay,
  isOurHost,
  targetAt,
} from '@/content/overlay';
import { buildLocatorSet } from '@/shared/locators';
import { analyzeStack } from '@/shared/tools/stacking';
import type { RawLayer } from '@/shared/tools/stacking';
import type { StackLayer } from '@/shared/types';

/**
 * In-page Stacking Inspector: click a point, list every element under it (via
 * `document.elementsFromPoint`) top-to-bottom, and flag when a non-interactive
 * overlay is intercepting a clickable element below it — the "element click
 * intercepted" flake. The classification is the pure `analyzeStack`; this bridge
 * supplies the elements, their computed style, and a locator per top layer.
 */

let active = false;

const INTERACTIVE_TAGS = /^(button|input|select|textarea|summary|label|option)$/;
const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'checkbox',
  'radio',
  'tab',
  'menuitem',
  'switch',
  'option',
]);

/** elementsFromPoint is short, but cap the locator work anyway. */
const MAX_LOCATOR_LAYERS = 10;

function looksClickable(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'a') return el.hasAttribute('href');
  if (INTERACTIVE_TAGS.test(tag)) return true;
  if (el.hasAttribute('onclick')) return true;
  const role = el.getAttribute('role');
  if (role !== null && INTERACTIVE_ROLES.has(role)) return true;
  const tabindex = el.getAttribute('tabindex');
  return tabindex !== null && tabindex !== '-1';
}

function describe(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.getAttribute('id');
  if (id !== null && id !== '') return `${tag}#${id}`;
  const cls = (el.getAttribute('class') ?? '').trim().split(/\s+/)[0];
  return cls ? `${tag}.${cls}` : tag;
}

function rawLayer(el: Element): RawLayer {
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    tag: describe(el),
    zIndex: s.zIndex,
    position: s.position,
    opacity: s.opacity,
    pointerEvents: s.pointerEvents,
    width: Math.round(r.width),
    height: Math.round(r.height),
    interactive: looksClickable(el),
  };
}

function onHover(e: MouseEvent): void {
  const el = targetAt(e.clientX, e.clientY);
  if (!el) return;
  const r = el.getBoundingClientRect();
  drawBoxes([
    {
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      variant: 'outline',
      label: describe(el),
    },
  ]);
}

function onPick(e: MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  const x = e.clientX;
  const y = e.clientY;
  // elementsFromPoint already excludes pointer-events:none elements, and the
  // documentElement always trails the list with an empty, useless locator.
  const els = document
    .elementsFromPoint(x, y)
    .filter((el) => !isOurHost(el) && el !== document.documentElement);
  if (els.length === 0) return;

  const report = analyzeStack(els.map(rawLayer), { x, y });
  const layers: StackLayer[] = report.layers.map((layer, i) => {
    const el = els[i];
    if (i >= MAX_LOCATOR_LAYERS || el === undefined) return layer;
    const rec = buildLocatorSet(el, document).suggestions.find((sug) => sug.recommended);
    return rec ? { ...layer, locator: rec } : layer;
  });

  const hit = els[report.hitIndex];
  if (hit) {
    const r = hit.getBoundingClientRect();
    drawBoxes([
      {
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
        variant: 'outline',
        tone: report.interceptsInteractive ? 'warn' : 'accent',
        label: report.interceptsInteractive ? 'intercepts ↓' : 'hit',
      },
    ]);
  }
  flashOverlay();
  notify(
    { type: MESSAGE_TYPES.TOOL_PICKED, payload: { tool: 'stack', data: { ...report, layers } } },
    stopStacking
  );
}

export function startStacking(): void {
  if (active) stopStacking();
  active = true;
  clearOverlay();
  document.addEventListener('mousemove', onHover, true);
  document.addEventListener('click', onPick, true);
}

export function stopStacking(): void {
  if (!active) return;
  active = false;
  document.removeEventListener('mousemove', onHover, true);
  document.removeEventListener('click', onPick, true);
  destroyOverlay();
}
