import { MESSAGE_TYPES } from '@/shared/constants';
import { detectField } from '@/shared/field-detect';
import { buildCssSelector } from '@/shared/locators';
import { sendRuntimeMessage } from '@/shared/messages';
import type { RecordedStep } from '@/shared/workflow';

// Passive interaction recorder: while active, it observes real clicks / inputs /
// selects / key presses and streams one WorkflowStep-like action per event to the
// side panel (ACTION_RECORDED). Unlike the picker it NEVER calls preventDefault /
// stopPropagation — the page must behave normally while recording. Top frame only.

const INDICATOR_TAG = 'senmurv-recorder-indicator';

let recording = false;
let indicatorEl: HTMLElement | null = null;

// The in-progress text fill (one field edited at a time), flushed on idle / blur.
let pending: { selector: string; label?: string; value: string } | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | undefined;

export function isRecording(): boolean {
  return recording;
}

function contextAlive(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

function send(step: RecordedStep): void {
  if (!contextAlive()) {
    stopRecording();
    return;
  }
  void sendRuntimeMessage({ type: MESSAGE_TYPES.ACTION_RECORDED, payload: { step } }).catch(() =>
    stopRecording()
  );
}

function trimmedText(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function safeSelector(el: Element): string {
  try {
    return buildCssSelector(el, document);
  } catch {
    return el.tagName.toLowerCase();
  }
}

function safeLabel(el: Element): string | undefined {
  try {
    return detectField(el, document).label || undefined;
  } catch {
    return undefined;
  }
}

/** Nearest actionable ancestor of a click target (button/link/role/pointer), or null. */
function actionable(start: Element): Element | null {
  let el: Element | null = start;
  for (let i = 0; el && i < 5; el = el.parentElement, i += 1) {
    if (
      el.matches(
        'button, a, [role="button"], [role="tab"], [role="menuitem"], input[type="submit"], input[type="button"]'
      )
    ) {
      return el;
    }
    try {
      if (getComputedStyle(el).cursor === 'pointer') return el;
    } catch {
      // getComputedStyle can throw on detached nodes — ignore.
    }
  }
  return null;
}

function flushPending(): void {
  clearTimeout(pendingTimer);
  if (!pending) return;
  const p = pending;
  pending = null;
  const step: RecordedStep = { kind: 'fill', selector: p.selector, value: p.value };
  if (p.label) step.label = p.label;
  send(step);
}

function onClick(e: MouseEvent): void {
  const target = e.target;
  if (!(target instanceof Element)) return;
  // Form controls are captured via input/change (capture-phase click has stale state).
  if (
    target.closest(
      'input, textarea, select, [role="checkbox"], [role="radio"], [role="switch"], mat-checkbox, mat-radio-button, mat-slide-toggle, option, mat-option, [role="option"]'
    )
  ) {
    return;
  }
  const el = actionable(target);
  if (!el) return; // ignore noise (whitespace / plain text clicks)
  flushPending();
  const text = trimmedText(el);
  const byText = el.matches(
    'button, a, [role="button"], input[type="submit"], input[type="button"]'
  );
  if (byText && text && text.length <= 60) {
    send({ kind: 'click', text });
  } else {
    send({ kind: 'clickEl', selector: safeSelector(el) });
  }
}

function onInput(e: Event): void {
  const t = e.target;
  const isText =
    (t instanceof HTMLInputElement &&
      !['checkbox', 'radio', 'submit', 'button', 'file'].includes(t.type)) ||
    t instanceof HTMLTextAreaElement;
  if (!isText) return;
  const el = t as HTMLInputElement | HTMLTextAreaElement;
  const selector = safeSelector(el);
  const label = safeLabel(el);
  pending = label ? { selector, label, value: el.value } : { selector, value: el.value };
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(flushPending, 500);
}

function onChange(e: Event): void {
  const t = e.target;
  if (t instanceof HTMLSelectElement) {
    const opt = t.selectedOptions[0];
    const step: RecordedStep = {
      kind: 'select',
      selector: safeSelector(t),
      value: (opt?.textContent ?? t.value).replace(/\s+/g, ' ').trim(),
      optionMode: 'text',
    };
    const label = safeLabel(t);
    if (label) step.label = label;
    send(step);
    return;
  }
  if (t instanceof HTMLInputElement && t.type === 'checkbox') {
    const step: RecordedStep = { kind: 'check', selector: safeSelector(t), checked: t.checked };
    const label = safeLabel(t);
    if (label) step.label = label;
    send(step);
    return;
  }
  if (t instanceof HTMLInputElement && t.type === 'radio') {
    send({ kind: 'radio', selector: safeSelector(t), value: t.value });
    return;
  }
  // Text input/textarea committed → flush the pending fill.
  flushPending();
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Enter' && e.key !== 'Escape') return;
  flushPending();
  send({ kind: 'press', key: e.key });
}

function ensureIndicator(): void {
  if (indicatorEl) return;
  indicatorEl = document.createElement(INDICATOR_TAG);
  indicatorEl.style.cssText =
    'all: initial; position: fixed; top: 10px; right: 10px; z-index: 2147483647; pointer-events: none;';
  const shadow = indicatorEl.attachShadow({ mode: 'open' });
  const badge = document.createElement('div');
  badge.textContent = '● Recording — Stop in the panel';
  badge.style.cssText =
    'font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; color: #fff;' +
    'background: #e5534b; padding: 4px 10px; border-radius: 12px;' +
    'box-shadow: 0 1px 4px rgba(0,0,0,0.4);';
  shadow.append(badge);
  document.documentElement.appendChild(indicatorEl);
}

function removeIndicator(): void {
  indicatorEl?.remove();
  indicatorEl = null;
}

export function startRecording(): void {
  if (recording) return;
  recording = true;
  document.addEventListener('click', onClick, true);
  document.addEventListener('input', onInput, true);
  document.addEventListener('change', onChange, true);
  document.addEventListener('keydown', onKeyDown, true);
  ensureIndicator();
}

export function stopRecording(): void {
  if (!recording) return;
  recording = false;
  flushPending();
  document.removeEventListener('click', onClick, true);
  document.removeEventListener('input', onInput, true);
  document.removeEventListener('change', onChange, true);
  document.removeEventListener('keydown', onKeyDown, true);
  removeIndicator();
}
