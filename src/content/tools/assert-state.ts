import { MESSAGE_TYPES } from '@/shared/constants';
import { notify } from '@/content/context';
import { clearOverlay, destroyOverlay, drawBoxes, flashOverlay, targetAt } from '@/content/overlay';
import { buildLocatorSet } from '@/shared/locators';
import { readElementState } from '@/shared/tools/element-state';
import type { StateEnv } from '@/shared/tools/element-state';
import type { ElementState } from '@/shared/types';

/**
 * In-page "Element → Assertions" mode: hover to outline an element, click to pin
 * its state (text / value / checked / enabled / visible / attributes) and its
 * locators to the panel, which turns them into copy-ready framework assertions.
 * The reading itself is the pure `readElementState`; this is the DOM bridge.
 *
 * State is snapshotted on `mousedown`, BEFORE the click: a checkbox/radio toggles
 * as the click's default action, so reading it in the click handler would report
 * the inverted state. (Natively-`disabled` controls suppress mouse events
 * entirely, so — like every pick tool — they cannot be clicked to pick.)
 */

let active = false;
let downSnapshot: { el: Element; state: ElementState } | null = null;

const ENV: StateEnv = {
  isVisible: (el) => {
    const withCheck = el as Element & {
      checkVisibility?: (opts?: { visibilityProperty?: boolean }) => boolean;
    };
    if (typeof withCheck.checkVisibility === 'function') {
      return withCheck.checkVisibility({ visibilityProperty: true });
    }
    return true;
  },
};

function outline(el: Element, label: string): void {
  const r = el.getBoundingClientRect();
  drawBoxes([
    { left: r.left, top: r.top, width: r.width, height: r.height, variant: 'outline', label },
  ]);
}

function onHover(e: MouseEvent): void {
  const el = targetAt(e.clientX, e.clientY);
  if (!el) return;
  outline(el, el.tagName.toLowerCase());
}

// Snapshot before the click's default action toggles a checkbox/radio.
function onDown(e: MouseEvent): void {
  const el = targetAt(e.clientX, e.clientY);
  downSnapshot = el ? { el, state: readElementState(el, ENV) } : null;
}

function onPick(e: MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  const el = targetAt(e.clientX, e.clientY);
  if (!el) return;
  const state =
    downSnapshot && downSnapshot.el === el ? downSnapshot.state : readElementState(el, ENV);
  downSnapshot = null;
  outline(el, state.tag);
  flashOverlay();
  notify(
    {
      type: MESSAGE_TYPES.TOOL_PICKED,
      payload: { tool: 'assert', data: state, locators: buildLocatorSet(el, document) },
    },
    stopAssert
  );
}

export function startAssert(): void {
  if (active) stopAssert();
  active = true;
  downSnapshot = null;
  clearOverlay();
  document.addEventListener('mousemove', onHover, true);
  document.addEventListener('mousedown', onDown, true);
  document.addEventListener('click', onPick, true);
}

export function stopAssert(): void {
  if (!active) return;
  active = false;
  downSnapshot = null;
  document.removeEventListener('mousemove', onHover, true);
  document.removeEventListener('mousedown', onDown, true);
  document.removeEventListener('click', onPick, true);
  destroyOverlay();
}
