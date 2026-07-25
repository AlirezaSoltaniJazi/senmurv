import type { MeasureMode, PageMode } from '@/shared/types';
import { restorePage, bypassPage, bypassState } from './tools/bypass';
import { startColor, stopColor } from './tools/color';
import { startMeasure, stopMeasure } from './tools/measure';
import { scanTabOrder, startTabOrder, stopLocators, stopTabOrder } from './tools/tab-index';

/**
 * Entry point for the Tools-tab in-page modes.
 *
 * picker.ts reaches this module through a DYNAMIC import, so everything below
 * — and everything it imports — is a separate chunk that is fetched on first
 * use and never parses on an ordinary page load.
 *
 * BUNDLE-PLACEMENT RULE: nothing reachable from here may also be reachable from
 * picker.ts's *static* import graph, or the chunk is inlined into the picker
 * and the win silently evaporates. Keep tool logic under `src/shared/tools/`,
 * which picker.ts never imports.
 */

interface ModeHandlers {
  start(): void;
  stop(): void;
}

/**
 * One entry per interactive Tools mode; each phase registers its own. `measure`
 * is special-cased below because it carries a sub-mode. Every start() must be
 * safe to call while already active (the panel re-sends START to re-configure).
 */
const HANDLERS: Partial<Record<PageMode, ModeHandlers>> = {
  color: { start: startColor, stop: stopColor },
  taborder: { start: startTabOrder, stop: stopTabOrder },
  // 'font'     → Phase 7
};

/** Start an in-page Tools mode. Unknown/unimplemented modes are a no-op. */
export function startMode(mode: PageMode, measureMode?: MeasureMode): void {
  if (mode === 'measure') {
    startMeasure(measureMode);
    return;
  }
  HANDLERS[mode]?.start();
}

/** Stop an in-page Tools mode. Safe to call for a mode that never started. */
export function stopMode(mode: PageMode): void {
  if (mode === 'measure') {
    stopMeasure();
    return;
  }
  HANDLERS[mode]?.stop();
}

// Bypass is request/response rather than a mode: it mutates the page and
// leaves, and its state (the undo snapshot, the sticky observer) lives in the
// content script so it survives the panel closing.
export { restorePage, bypassPage, bypassState };

// Tab order: SCAN computes + draws; the panel fetches a stop's locators lazily.
export { scanTabOrder, stopLocators };
