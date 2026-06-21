import { buildCssSelector, getAccessibleName } from '@/shared/locators';
import type { DetectedField, FieldType } from '@/shared/types';

const CONTROL_SELECTOR =
  'input, textarea, select, mat-select, [role="combobox"], [role="checkbox"], [role="radio"]';

const FIELD_WRAPPERS = 'mat-form-field, mat-checkbox, mat-radio-button, .mat-mdc-form-field, label';

/**
 * From whatever the user clicked (often a label or Material wrapper), find the
 * actual fillable control underneath.
 */
export function resolveControl(el: Element, doc: Document = document): Element {
  if (el.matches('input, textarea, select, mat-select')) return el;

  const inner = el.querySelector(CONTROL_SELECTOR);
  if (inner) return inner;

  // A Material floating <mat-label> sits inside a <label for="<input-id>"> —
  // follow `for` straight to the input.
  const labelFor = el.closest('label[for]')?.getAttribute('for');
  if (labelFor) {
    const target = doc.getElementById(labelFor);
    if (target) return target;
  }

  // Otherwise climb form-field wrappers until one actually contains a control.
  // (A bare label wrapper — e.g. the floating label — holds no input, so the
  // nearest wrapper can be a dead end; keep climbing to the mat-form-field.)
  let node: Element | null = el.closest(FIELD_WRAPPERS);
  while (node) {
    const control = node.querySelector(CONTROL_SELECTOR);
    if (control) return control;
    node = node.parentElement ? node.parentElement.closest(FIELD_WRAPPERS) : null;
  }
  return el;
}

/** Classify a resolved control into a FieldType. */
export function detectFieldType(el: Element): FieldType {
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea') return 'textarea';
  if (tag === 'select' || tag === 'mat-select') return 'select';

  const role = el.getAttribute('role');
  if (tag === 'input') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (role === 'combobox') return 'combobox';
    if (
      type === 'email' ||
      type === 'tel' ||
      type === 'number' ||
      type === 'date' ||
      type === 'password'
    ) {
      return type;
    }
    return 'text';
  }

  if (role === 'combobox' || role === 'listbox') return 'combobox';
  if (role === 'checkbox') return 'checkbox';
  if (role === 'radio') return 'radio';
  return 'text';
}

function fieldLabel(el: Element, doc: Document): string {
  const accessible = getAccessibleName(el, doc);
  if (accessible) return accessible;

  const wrap = el.closest('mat-form-field, .mat-mdc-form-field');
  const matLabel = wrap?.querySelector('mat-label')?.textContent?.trim();
  if (matLabel) return matLabel;

  return (
    el.getAttribute('formcontrolname') ??
    el.getAttribute('placeholder') ??
    el.getAttribute('name') ??
    el.tagName.toLowerCase()
  );
}

/** Resolve, classify, label, and build a stable selector for a clicked element. */
export function detectField(el: Element, doc: Document): DetectedField {
  const control = resolveControl(el, doc);
  const fieldType = detectFieldType(control);
  const label = fieldLabel(control, doc);
  const hint = [
    control.getAttribute('formcontrolname'),
    control.getAttribute('name'),
    control.getAttribute('placeholder'),
    control.getAttribute('aria-label'),
    label,
    control.getAttribute('id'),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return { selector: buildCssSelector(control, doc), fieldType, label, hint };
}
