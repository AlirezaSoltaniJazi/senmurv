import { GOD_LOCK_ATTRS, MESSAGE_TYPES } from '@/shared/constants';
import { notifyQuiet } from '@/content/context';
import {
  applyGodMode,
  BROWSER_ENV,
  createSnapshot,
  pruneDetached,
  revertGodMode,
} from '@/shared/tools/god-mode';
import type { GodModeSnapshot } from '@/shared/tools/god-mode';
import type { GodModeOptions, GodModeReport, PageUnlockState } from '@/shared/types';

/**
 * The page-side half of Unlock. Owns the undo snapshot and the optional sticky
 * observer, both of which must survive between messages — which is exactly why
 * this lives in the content script's module scope and not in the panel.
 */

/** How long to coalesce DOM churn before re-applying in sticky mode. */
const REAPPLY_DEBOUNCE_MS = 100;

let snapshot: GodModeSnapshot | null = null;
let observer: MutationObserver | null = null;
let watchedOptions: GodModeOptions | null = null;
let lastReport: GodModeReport | null = null;
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
function applyQuietly(options: GodModeOptions, target: GodModeSnapshot): GodModeReport {
  isApplying = true;
  try {
    return applyGodMode(document, options, target, BROWSER_ENV);
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
    type: MESSAGE_TYPES.UNLOCK_STATE_CHANGED,
    payload: { report: lastReport },
  });
}

function startWatching(options: GodModeOptions): void {
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
    // Deliberately narrow — see GOD_LOCK_ATTRS on why `class` and `style` are out.
    attributeFilter: [...GOD_LOCK_ATTRS],
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
export function unlockPage(options: GodModeOptions, shouldWatch: boolean): GodModeReport {
  snapshot ??= createSnapshot();
  const report = applyQuietly(options, snapshot);
  lastReport = report;
  if (shouldWatch) startWatching(options);
  else stopWatching();
  return report;
}

/** Put every recorded attribute back and stop watching. */
export function restorePage(): GodModeReport {
  stopWatching();
  const restored = snapshot === null ? 0 : revertGodMode(snapshot);
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
export function unlockState(): PageUnlockState {
  return {
    isUnlocked: snapshot !== null && snapshot.size > 0,
    isWatching: observer !== null,
    report: lastReport,
  };
}
