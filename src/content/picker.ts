import { MESSAGE_TYPES } from '@/shared/constants';
import { detectField } from '@/shared/field-detect';
import { buildLocatorSet } from '@/shared/locators';
import { isRuntimeMessage } from '@/shared/messages';
import type { LocatorKind, MatchResult, MeasureMode, PageMode, Result } from '@/shared/types';
import { contextAlive, notify } from './context';
import { clearOverlay, destroyOverlay, drawBoxes, flashOverlay, targetAt } from './overlay';
import { scrollToMatch, startMatch, stopMatch } from './match-highlight';
import { isRecording, startRecording, stopRecording } from './recorder';

// The page-side router. Idle until the side panel asks for a mode, then it owns
// exactly one in-page mode at a time (see `enterMode`) and reports back.
//
// The heavier Tools-tab modes live in ./tools, pulled in by a dynamic import on
// first use so they never parse on ordinary page loads.

declare global {
  interface Window {
    /** Set once per isolated world so a re-injection cannot register a 2nd listener. */
    __senmurvPickerLoaded?: boolean;
  }
}

// ---------------------------------------------------------------------------
// Lazy Tools chunk
// ---------------------------------------------------------------------------

let toolsModule: Promise<typeof import('./tools')> | null = null;

/**
 * Load (once) the Tools in-page modes. CRXJS lifts this dynamic import into
 * `web_accessible_resources` automatically — never hardcode the chunk name,
 * every filename is content-hashed.
 */
function loadTools(): Promise<typeof import('./tools')> {
  toolsModule ??= import('./tools');
  return toolsModule;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Run `fn` against the lazily-loaded Tools module and wrap it in a `Result`, so
 * a chunk-load failure or a throw inside a tool reaches the panel as a message
 * rather than an unanswered request.
 */
async function withTools<T>(fn: (tools: typeof import('./tools')) => T): Promise<Result<T>> {
  try {
    return { ok: true, value: fn(await loadTools()) };
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
}

// ---------------------------------------------------------------------------
// Mode arbiter
// ---------------------------------------------------------------------------

/**
 * Exactly one mode runs at a time. Every transition goes through `enterMode`,
 * which stops the outgoing mode before starting the incoming one — replacing
 * the pairwise guards that could not scale past two modes, and giving the
 * page cursor a single owner (two owners interleaving strand a crosshair).
 */
let pageMode: PageMode = 'idle';
let previousCursor = '';
let cursorApplied = false;

const MODE_CURSOR: Partial<Record<PageMode, string>> = {
  'pick-locator': 'crosshair',
  'pick-fields': 'crosshair',
  measure: 'crosshair',
  color: 'crosshair',
  font: 'crosshair',
};

function applyCursor(mode: PageMode): void {
  const cursor = MODE_CURSOR[mode];
  if (cursor === undefined) return;
  if (!cursorApplied) {
    previousCursor = document.documentElement.style.cursor;
    cursorApplied = true;
  }
  document.documentElement.style.cursor = cursor;
}

function restoreCursor(): void {
  if (!cursorApplied) return;
  document.documentElement.style.cursor = previousCursor;
  previousCursor = '';
  cursorApplied = false;
}

function isToolMode(mode: PageMode): boolean {
  return mode === 'measure' || mode === 'color' || mode === 'font' || mode === 'taborder';
}

/** Tear down whatever is running. Safe to call when already idle. */
function stopCurrentMode(): void {
  const outgoing = pageMode;
  pageMode = 'idle';
  if (outgoing === 'pick-locator' || outgoing === 'pick-fields') {
    stopPickListeners();
  } else if (outgoing === 'record') {
    stopRecording();
  } else if (outgoing === 'match') {
    stopMatch();
  } else if (isToolMode(outgoing)) {
    // The chunk is necessarily resolved — we could not have entered the mode
    // without it — so this settles immediately.
    void loadTools().then((tools) => tools.stopMode(outgoing));
  }
  restoreCursor();
}

/** Switch to `next`, stopping the current mode first. Synchronous modes only. */
function enterMode(next: PageMode): void {
  if (pageMode === next) return;
  stopCurrentMode();
  if (next === 'idle') return;
  pageMode = next;
  applyCursor(next);
  if (next === 'pick-locator' || next === 'pick-fields') {
    startPickListeners();
  } else if (next === 'record') {
    startRecording();
  }
}

/**
 * Switch to a Tools mode, which needs the lazy chunk first. Re-callable while
 * already in the mode so the panel can re-configure it (e.g. change the Measure
 * sub-mode) — the mode's own start() is idempotent.
 */
async function enterToolMode(next: PageMode, measureMode?: MeasureMode): Promise<Result<void>> {
  try {
    const tools = await loadTools();
    if (pageMode !== next) {
      stopCurrentMode();
      pageMode = next;
      applyCursor(next);
    }
    tools.startMode(next, measureMode);
    return { ok: true, value: undefined };
  } catch (err) {
    pageMode = 'idle';
    restoreCursor();
    return { ok: false, error: `Could not load the Tools module: ${errorText(err)}` };
  }
}

/**
 * Enter (or refresh) the locator-match highlight mode. Re-callable while already
 * in it so the panel can update the drawing live as the query changes; an
 * invalid selector leaves the mode idle and reports why.
 */
function enterMatchMode(query: string, kind: LocatorKind): Result<MatchResult> {
  if (pageMode !== 'match') {
    stopCurrentMode();
    pageMode = 'match';
  }
  const res = startMatch(query, kind);
  if (!res.ok) pageMode = 'idle';
  return res;
}

// ---------------------------------------------------------------------------
// Element picking (locator + field modes)
// ---------------------------------------------------------------------------

function describe(el: Element): string {
  const id = el.getAttribute('id');
  return `${el.tagName.toLowerCase()}${id ? `#${id}` : ''}`;
}

function highlight(el: Element): void {
  const rect = el.getBoundingClientRect();
  drawBoxes([
    {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      label: describe(el),
    },
  ]);
}

/** Terminal-message teardown: an invalidated extension context means stop everything. */
function bail(): void {
  enterMode('idle');
  destroyOverlay();
}

function onMouseMove(e: MouseEvent): void {
  const el = targetAt(e.clientX, e.clientY);
  if (el) highlight(el);
}

function onClick(e: MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  const el = targetAt(e.clientX, e.clientY);

  if (pageMode === 'pick-fields') {
    // Continuous: report each clicked field and stay active for the next.
    if (el) {
      notify(
        { type: MESSAGE_TYPES.FIELD_PICKED, payload: { field: detectField(el, document) } },
        bail
      );
      flashOverlay();
    }
    return;
  }

  enterMode('idle');
  destroyOverlay();
  if (el) {
    notify({ type: MESSAGE_TYPES.ELEMENT_PICKED, payload: buildLocatorSet(el, document) }, bail);
  } else {
    notify({ type: MESSAGE_TYPES.PICK_CANCELLED }, bail);
  }
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return;
  e.preventDefault();
  enterMode('idle');
  destroyOverlay();
  notify({ type: MESSAGE_TYPES.PICK_CANCELLED }, bail);
}

function startPickListeners(): void {
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
}

function stopPickListeners(): void {
  document.removeEventListener('mousemove', onMouseMove, true);
  document.removeEventListener('click', onClick, true);
  document.removeEventListener('keydown', onKeyDown, true);
  destroyOverlay();
}

// ---------------------------------------------------------------------------
// Highlight-an-element (driven from a side-panel findings list)
// ---------------------------------------------------------------------------

function highlightSelector(selector: string | null): Result<void> {
  if (selector === null) {
    clearOverlay();
    return { ok: true, value: undefined };
  }
  try {
    const el = document.querySelector(selector);
    if (!el) return { ok: false, error: 'No element matches that selector.' };
    // 'instant' overrides a page-wide `scroll-behavior: smooth`, which would
    // otherwise leave us drawing the box at the pre-scroll position.
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    const rect = el.getBoundingClientRect();
    drawBoxes([
      {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        variant: 'outline',
        tone: 'warn',
      },
    ]);
    return { ok: true, value: undefined };
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
}

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

function register(): void {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isRuntimeMessage(message)) return false;

    switch (message.type) {
      case MESSAGE_TYPES.START_PICK:
        if (!isRecording()) enterMode('pick-locator');
        return false;

      case MESSAGE_TYPES.START_PICK_FIELDS:
        if (!isRecording()) enterMode('pick-fields');
        return false;

      case MESSAGE_TYPES.CANCEL_PICK:
        if (pageMode === 'pick-locator' || pageMode === 'pick-fields') enterMode('idle');
        return false;

      // Picking and recording stay mutually exclusive, as they were before the
      // arbiter: whichever is already running wins. Switching *within* the pick
      // modes is now handled correctly, which is what the arbiter changed.
      case MESSAGE_TYPES.START_RECORD:
        if (pageMode !== 'pick-locator' && pageMode !== 'pick-fields') enterMode('record');
        return false;

      case MESSAGE_TYPES.STOP_RECORD:
        if (pageMode === 'record') enterMode('idle');
        return false;

      // Forces the lazy Tools chunk to load and answers once it has, so the
      // panel can tell "page unreachable" from "chunk failed to load".
      case MESSAGE_TYPES.TOOL_PING:
        loadTools()
          .then(() => sendResponse({ ok: true, value: { ready: true } }))
          .catch((err) => sendResponse({ ok: false, error: errorText(err) }));
        return true;

      case MESSAGE_TYPES.START_TOOL_MODE:
        void enterToolMode(message.payload.mode, message.payload.measureMode).then(sendResponse);
        return true;

      case MESSAGE_TYPES.STOP_TOOL_MODE: {
        const { mode } = message.payload;
        if (mode === 'all' || pageMode === mode) enterMode('idle');
        sendResponse({ ok: true, value: undefined });
        return true;
      }

      case MESSAGE_TYPES.HIGHLIGHT_ELEMENT:
        sendResponse(highlightSelector(message.payload.selector));
        return true;

      case MESSAGE_TYPES.HIGHLIGHT_MATCHES: {
        const { query, kind } = message.payload;
        sendResponse(enterMatchMode(query, kind));
        return true;
      }

      case MESSAGE_TYPES.SCROLL_TO_MATCH:
        sendResponse(scrollToMatch(message.payload.index));
        return true;

      case MESSAGE_TYPES.BYPASS_PAGE: {
        const { options, shouldWatch } = message.payload;
        void withTools((tools) => tools.bypassPage(options, shouldWatch)).then(sendResponse);
        return true;
      }

      case MESSAGE_TYPES.RESTORE_PAGE:
        void withTools((tools) => tools.restorePage()).then(sendResponse);
        return true;

      case MESSAGE_TYPES.GET_BYPASS_STATE:
        void withTools((tools) => tools.bypassState()).then(sendResponse);
        return true;

      case MESSAGE_TYPES.SCAN_TAB_ORDER:
        void withTools((tools) => tools.scanTabOrder()).then(sendResponse);
        return true;

      case MESSAGE_TYPES.RUN_A11Y_SCAN: {
        const { levels } = message.payload;
        void withTools((tools) => tools.runA11yScan(levels)).then(sendResponse);
        return true;
      }

      case MESSAGE_TYPES.GET_STOP_LOCATORS: {
        const { source, index } = message.payload;
        void withTools((tools) =>
          source === 'a11y' ? tools.a11yLocators(index) : tools.stopLocators(index)
        ).then(sendResponse);
        return true;
      }

      default:
        // Everything else is addressed to the side panel or the worker.
        return false;
    }
  });
}

// A tab that existed before the extension loaded gets the script injected on
// demand, and that can happen more than once — register only for the first.
if (!window.__senmurvPickerLoaded && contextAlive()) {
  window.__senmurvPickerLoaded = true;
  register();
}
