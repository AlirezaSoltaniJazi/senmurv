import { MESSAGE_TYPES } from '@/shared/constants';
import { detectField } from '@/shared/field-detect';
import { buildLocatorSet } from '@/shared/locators';
import { isRuntimeMessage, sendRuntimeMessage } from '@/shared/messages';
import type { RuntimeMessage } from '@/shared/messages';

type PickMode = 'locator' | 'fields';

// Idle until the side panel asks us to pick (START_PICK). Then we highlight the
// hovered element and capture one click, compute its locators, and report back.

const HOST_TAG = 'senmurv-picker-overlay';

let active = false;
let mode: PickMode = 'locator';
let hostEl: HTMLElement | null = null;
let boxEl: HTMLDivElement | null = null;
let labelEl: HTMLDivElement | null = null;
let previousCursor = '';

function ensureOverlay(): void {
  if (hostEl) return;
  hostEl = document.createElement(HOST_TAG);
  hostEl.style.cssText =
    'all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;';
  const shadow = hostEl.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    .box {
      position: fixed; pointer-events: none; box-sizing: border-box;
      border: 2px solid #2d7ff9; background: rgba(45, 127, 249, 0.15);
      border-radius: 2px; box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6);
      transition: all 40ms ease-out;
    }
    .label {
      position: fixed; pointer-events: none;
      font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
      color: #fff; background: #2d7ff9; padding: 2px 6px; border-radius: 3px;
      white-space: nowrap; max-width: 90vw; overflow: hidden; text-overflow: ellipsis;
    }
  `;
  boxEl = document.createElement('div');
  boxEl.className = 'box';
  labelEl = document.createElement('div');
  labelEl.className = 'label';
  shadow.append(style, boxEl, labelEl);
  document.documentElement.appendChild(hostEl);
}

function removeOverlay(): void {
  hostEl?.remove();
  hostEl = null;
  boxEl = null;
  labelEl = null;
}

/** The real page element at a point (our overlay is pointer-events:none, so it's skipped). */
function targetAt(x: number, y: number): Element | null {
  const el = document.elementFromPoint(x, y);
  if (!el || el === hostEl || el.tagName.toLowerCase() === HOST_TAG) return null;
  return el;
}

function describe(el: Element): string {
  const id = el.getAttribute('id');
  return `${el.tagName.toLowerCase()}${id ? `#${id}` : ''}`;
}

function highlight(el: Element): void {
  if (!boxEl || !labelEl) return;
  const rect = el.getBoundingClientRect();
  boxEl.style.left = `${rect.left}px`;
  boxEl.style.top = `${rect.top}px`;
  boxEl.style.width = `${rect.width}px`;
  boxEl.style.height = `${rect.height}px`;
  labelEl.textContent = describe(el);
  labelEl.style.left = `${rect.left}px`;
  labelEl.style.top = `${rect.top > 22 ? rect.top - 22 : rect.bottom + 4}px`;
}

function onMouseMove(e: MouseEvent): void {
  const el = targetAt(e.clientX, e.clientY);
  if (el) highlight(el);
}

function flashBox(): void {
  if (!boxEl) return;
  const previous = boxEl.style.borderColor;
  boxEl.style.borderColor = '#3fb950';
  setTimeout(() => {
    if (boxEl) boxEl.style.borderColor = previous;
  }, 200);
}

/** Is the extension context still valid? (False for an orphaned content script.) */
function contextAlive(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

/**
 * Fire-and-forget message. After the extension reloads/updates, this content
 * script lingers in the page with an invalidated context — sending then throws
 * "Extension context invalidated". Swallow it and tear the picker down quietly.
 */
function notify(message: RuntimeMessage): void {
  if (!contextAlive()) {
    stopPicking();
    return;
  }
  void sendRuntimeMessage(message).catch(() => stopPicking());
}

function onClick(e: MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  const el = targetAt(e.clientX, e.clientY);

  if (mode === 'fields') {
    // Continuous: report each clicked field and stay active for the next.
    if (el) {
      notify({
        type: MESSAGE_TYPES.FIELD_PICKED,
        payload: { field: detectField(el, document) },
      });
      flashBox();
    }
    return;
  }

  stopPicking();
  if (el) {
    notify({ type: MESSAGE_TYPES.ELEMENT_PICKED, payload: buildLocatorSet(el, document) });
  } else {
    notify({ type: MESSAGE_TYPES.PICK_CANCELLED });
  }
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault();
    stopPicking();
    notify({ type: MESSAGE_TYPES.PICK_CANCELLED });
  }
}

function startPicking(nextMode: PickMode): void {
  mode = nextMode;
  if (active) return;
  active = true;
  ensureOverlay();
  previousCursor = document.documentElement.style.cursor;
  document.documentElement.style.cursor = 'crosshair';
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
}

function stopPicking(): void {
  if (!active) return;
  active = false;
  document.removeEventListener('mousemove', onMouseMove, true);
  document.removeEventListener('click', onClick, true);
  document.removeEventListener('keydown', onKeyDown, true);
  document.documentElement.style.cursor = previousCursor;
  removeOverlay();
}

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (!isRuntimeMessage(message)) return false;
  if (message.type === MESSAGE_TYPES.START_PICK) {
    startPicking('locator');
  } else if (message.type === MESSAGE_TYPES.START_PICK_FIELDS) {
    startPicking('fields');
  } else if (message.type === MESSAGE_TYPES.CANCEL_PICK) {
    stopPicking();
  }
  return false;
});
