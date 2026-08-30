import type { ReactElement } from 'react';
import type { LocatorKind } from '@/shared/types';

interface Props {
  value: LocatorKind;
  onChange: (kind: LocatorKind) => void;
}

/**
 * A plain CSS/XPath picker. Unlike the Locator tab's "Test a locator" box
 * (which auto-detects the kind from pasted text via `parseLocatorInput`),
 * Accounts locators are automation-critical — a misdetected kind means a
 * real login failure, not just an imperfect ranking — so this asks
 * explicitly instead.
 */
export function LocatorKindToggle({ value, onChange }: Props): ReactElement {
  return (
    <div className="chips">
      <button
        type="button"
        className={value === 'css' ? 'chip active' : 'chip'}
        onClick={() => onChange('css')}
      >
        CSS
      </button>
      <button
        type="button"
        className={value === 'xpath' ? 'chip active' : 'chip'}
        onClick={() => onChange('xpath')}
      >
        XPath
      </button>
    </div>
  );
}
