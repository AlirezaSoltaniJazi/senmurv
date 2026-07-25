import type { ElementAttr, ElementState } from '@/shared/types';

/**
 * Pure element-state reader for the "Element → Assertions" tool. It snapshots
 * the facets a test typically asserts on — text, form value, checked, enabled,
 * visible, and a curated set of attributes — into a plain object.
 *
 * Chrome-free and DOM-injectable. Visibility needs a layout engine happy-dom
 * lacks, so it is supplied through `env.isVisible` (the content script passes
 * `checkVisibility`; tests pass a stub), keeping the reader unit-testable.
 */

/** Injected so the reader stays testable without a layout engine. */
export interface StateEnv {
  isVisible(el: Element): boolean;
}

const VALUE_TAGS = new Set(['input', 'textarea', 'select']);
const ATTR_WHITELIST = /^(type|name|placeholder|href|src|alt|title|role|target|rel|for|lang)$/i;
const MAX_ATTRS = 8;

/** Read the assertion-relevant state of an element. */
export function readElementState(el: Element, env: StateEnv): ElementState {
  const tag = el.tagName.toLowerCase();
  const hasValue = VALUE_TAGS.has(tag);

  let value: string | null = null;
  let checked: boolean | null = null;
  let inputType: string | null = null;

  if (hasValue) {
    const control = el as HTMLInputElement; // textarea/select expose `value` too
    value = typeof control.value === 'string' ? control.value : null;
    if (tag === 'input') {
      inputType = (el.getAttribute('type') ?? 'text').toLowerCase();
      if (inputType === 'checkbox' || inputType === 'radio') {
        checked = control.checked === true;
        value = null; // checked is the state; the value attribute is not
      }
    }
  }

  const rawText = hasValue ? '' : (el.textContent ?? '');
  const text = rawText.replace(/\s+/g, ' ').trim().slice(0, 200) || null;

  const disabled =
    (el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true';
  const readOnly =
    (el as HTMLInputElement).readOnly === true || el.getAttribute('aria-readonly') === 'true';

  const attributes: ElementAttr[] = [];
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    if (name === 'class' || name === 'style' || name === 'id') continue;
    if (ATTR_WHITELIST.test(name) || /^(aria|data)-/.test(name)) {
      attributes.push({ name: attr.name, value: attr.value });
      if (attributes.length >= MAX_ATTRS) break;
    }
  }

  return {
    tag,
    text,
    value,
    checked,
    disabled,
    readOnly,
    visible: env.isVisible(el),
    inputType,
    attributes,
  };
}

/** Elements for which an enabled/disabled assertion is meaningful. */
export function isInteractive(state: ElementState): boolean {
  return (
    /^(input|button|select|textarea|a|option|fieldset|optgroup)$/.test(state.tag) || state.disabled
  );
}
