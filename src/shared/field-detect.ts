import { buildCssSelector, getAccessibleName } from '@/shared/locators';
import type { DetectedField, FieldType } from '@/shared/types';

const CONTROL_SELECTOR =
  'input, textarea, select, mat-select, [role="combobox"], [role="checkbox"], [role="radio"]';

const FIELD_WRAPPERS = 'mat-form-field, mat-checkbox, mat-radio-button, .mat-mdc-form-field, label';

/**
 * From whatever the user clicked (often a label or Material wrapper), find the
 * actual fillable control underneath.
 */
export function resolveControl(el: Element): Element {
  if (el.matches('input, textarea, select, mat-select')) return el;
  const inner = el.querySelector(CONTROL_SELECTOR);
  if (inner) return inner;
  const wrap = el.closest(FIELD_WRAPPERS);
  const control = wrap?.querySelector(CONTROL_SELECTOR);
  return control ?? el;
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
  const control = resolveControl(el);
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
