import type { PageMode } from '@/shared/types';
import { restorePage, unlockPage, unlockState } from './tools/god-mode';

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

/** One entry per interactive Tools mode; each phase registers its own. */
const HANDLERS: Partial<Record<PageMode, ModeHandlers>> = {
  // 'measure'  → Phase 3
  // 'color'    → Phase 4
  // 'taborder' → Phase 5
  // 'font'     → Phase 7
};

/** Start an in-page Tools mode. Unknown/unimplemented modes are a no-op. */
export function startMode(mode: PageMode): void {
  HANDLERS[mode]?.start();
}

/** Stop an in-page Tools mode. Safe to call for a mode that never started. */
export function stopMode(mode: PageMode): void {
  HANDLERS[mode]?.stop();
}

// Unlock is request/response rather than a mode: it mutates the page and
// leaves, and its state (the undo snapshot, the sticky observer) lives in the
// content script so it survives the panel closing.
export { restorePage, unlockPage, unlockState };
