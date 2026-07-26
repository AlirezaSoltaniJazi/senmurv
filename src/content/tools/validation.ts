import { MESSAGE_TYPES } from '@/shared/constants';
import { notify } from '@/content/context';
import { clearOverlay, destroyOverlay, drawBoxes, flashOverlay, targetAt } from '@/content/overlay';
import { rafThrottle } from '@/content/raf-throttle';
import type { RafThrottled } from '@/content/raf-throttle';
import { buildLocatorSet } from '@/shared/locators';
import { readFieldContract } from '@/shared/tools/validation-contract';

/**
 * In-page Validation Inspector: hover to outline, click a form control to read
 * its full client-side validation contract (constraints + live ValidityState)
 * and its locators. Extraction is the pure `readFieldContract`; this is the DOM
 * bridge. The click is suppressed, so picking a checkbox/select changes nothing.
 */

let active = false;
let hover: RafThrottled | null = null;

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

function onPick(e: MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  const el = targetAt(e.clientX, e.clientY);
  if (!el) return;
  const contract = readFieldContract(el);
  outline(el, contract.label);
  flashOverlay();
  notify(
    {
      type: MESSAGE_TYPES.TOOL_PICKED,
      payload: { tool: 'validation', data: contract, locators: buildLocatorSet(el, document) },
    },
    stopValidation
  );
}

export function startValidation(): void {
  if (active) stopValidation();
  active = true;
  clearOverlay();
  hover = rafThrottle(onHover);
  document.addEventListener('mousemove', hover.handler, true);
  document.addEventListener('click', onPick, true);
}

export function stopValidation(): void {
  if (!active) return;
  active = false;
  if (hover) {
    document.removeEventListener('mousemove', hover.handler, true);
    hover.cancel();
    hover = null;
  }
  document.removeEventListener('click', onPick, true);
  destroyOverlay();
}
