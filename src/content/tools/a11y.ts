import { buildLocatorSet } from '@/shared/locators';
import { A11Y_COVERAGE_NOTE, runA11yRules } from '@/shared/tools/a11y-rules';
import type { A11yEnv } from '@/shared/tools/a11y-rules';
import type { A11yReport, LocatorSet, WcagLevel } from '@/shared/types';

/**
 * In-page accessibility scan. Runs the hand-rolled rule catalogue against the
 * live DOM (ISOLATED world, read-only), retains the flagged elements so the
 * panel can fetch a finding's locators lazily, and returns findings grouped by
 * level with the honest coverage note.
 */

let elements: Element[] = [];

function browserEnv(level: WcagLevel): A11yEnv {
  return {
    isRendered: (el) => {
      const withCheck = el as Element & {
        checkVisibility?: (opts?: {
          visibilityProperty?: boolean;
          opacityProperty?: boolean;
        }) => boolean;
      };
      if (typeof withCheck.checkVisibility === 'function') {
        return withCheck.checkVisibility({ visibilityProperty: true, opacityProperty: true });
      }
      return true;
    },
    styleOf: (el) => getComputedStyle(el),
    level,
  };
}

/** The strongest level requested (A ⊂ AA ⊂ AAA). */
function maxLevel(levels: WcagLevel[]): WcagLevel {
  if (levels.includes('AAA')) return 'AAA';
  if (levels.includes('AA')) return 'AA';
  return 'A';
}

export function runA11yScan(levels: WcagLevel[]): A11yReport {
  const result = runA11yRules(document, browserEnv(maxLevel(levels)));
  elements = result.elements;
  return {
    findings: result.findings,
    passedRules: result.passedRules,
    warnings: [A11Y_COVERAGE_NOTE],
  };
}

/** Locators for the element behind a finding. Throws when it is gone (rescan). */
export function a11yLocators(index: number): LocatorSet {
  const el = elements[index];
  if (!el) throw new Error('That element no longer exists — rescan the page.');
  return buildLocatorSet(el, document);
}

/**
 * Release the retained scan elements. A11y is request/response, not an arbiter
 * mode, so it has no `stop*()` — the panel-close teardown calls this so the last
 * scan's (possibly detached) element references do not linger until navigation.
 */
export function resetA11y(): void {
  elements = [];
}
