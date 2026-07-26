import { BYPASS_LOCK_ATTRS, MESSAGE_TYPES } from '@/shared/constants';
import { notifyQuiet } from '@/content/context';
import {
  applyBypass,
  BROWSER_ENV,
  createSnapshot,
  pruneDetached,
  revertBypass,
} from '@/shared/tools/bypass';
import type { BypassSnapshot } from '@/shared/tools/bypass';
import type { BypassOptions, BypassReport, PageBypassState } from '@/shared/types';

/**
 * The page-side half of Bypass. Owns the undo snapshot and the optional sticky
 * observer, both of which must survive between messages — which is exactly why
 * this lives in the content script's module scope and not in the panel.
 */

/** How long to coalesce DOM churn before re-applying in sticky mode. */
const REAPPLY_DEBOUNCE_MS = 100;

let snapshot: BypassSnapshot | null = null;
let observer: MutationObserver | null = null;
let watchedOptions: BypassOptions | null = null;
let lastReport: BypassReport | null = null;
let isApplying = false;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Run a pass with the observer suppressed.
 *
 * `takeRecords()` is the actual mechanism, not the `isApplying` flag: observer
 * callbacks are microtasks, so by the time one runs the flag is already back to
 * false. Draining the queue in the same synchronous task is what stops our own
 * writes from re-triggering us forever.
 */
function applyQuietly(options: BypassOptions, target: BypassSnapshot): BypassReport {
  isApplying = true;
  try {
    return applyBypass(document, options, target, BROWSER_ENV);
  } finally {
    observer?.takeRecords();
    isApplying = false;
  }
}

function reapply(): void {
  if (!snapshot || !watchedOptions) return;
  // Bound the snapshot on an SPA that re-renders continuously; a detached
  // element cannot be restored anyway.
  pruneDetached(snapshot);
  lastReport = applyQuietly(watchedOptions, snapshot);
  notifyQuiet({
    type: MESSAGE_TYPES.BYPASS_STATE_CHANGED,
    payload: { report: lastReport },
  });
}

function startWatching(options: BypassOptions): void {
  watchedOptions = options;
  if (observer) return;
  observer = new MutationObserver(() => {
    if (isApplying) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(reapply, REAPPLY_DEBOUNCE_MS);
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    // Deliberately narrow — see BYPASS_LOCK_ATTRS on why `class` and `style` are out.
    attributeFilter: [...BYPASS_LOCK_ATTRS],
  });
}

function stopWatching(): void {
  clearTimeout(debounceTimer);
  debounceTimer = undefined;
  observer?.disconnect();
  observer = null;
  watchedOptions = null;
}

/** Strip the page's client-side locks, optionally staying on to re-apply them. */
export function bypassPage(options: BypassOptions, shouldWatch: boolean): BypassReport {
  snapshot ??= createSnapshot();
  const report = applyQuietly(options, snapshot);
  lastReport = report;
  if (shouldWatch) startWatching(options);
  else stopWatching();
  return report;
}

/** Put every recorded attribute back and stop watching. */
export function restorePage(): BypassReport {
  stopWatching();
  const restored = snapshot === null ? 0 : revertBypass(snapshot);
  snapshot = null;
  lastReport = null;
  return {
    total: restored,
    counts: { enabled: 0, validation: 0, options: 0, revealed: 0, passwords: 0, dialogs: 0 },
    shadowRoots: 0,
    warnings: [],
  };
}

/**
 * What the panel re-syncs to on mount. A full navigation destroys this module,
 * so after a reload this correctly reports "not unlocked" — Restore genuinely
 * becomes impossible then, and the button must say so rather than lie.
 */
export function bypassState(): PageBypassState {
  return {
    isActive: snapshot !== null && snapshot.size > 0,
    isWatching: observer !== null,
    report: lastReport,
  };
}
