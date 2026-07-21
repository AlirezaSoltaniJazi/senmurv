import { BLOCKED_URL_PREFIXES, MESSAGE_TYPES } from '@/shared/constants';
import { isRuntimeMessage, sendTabMessage } from '@/shared/messages';
import {
  deleteChecklist,
  deleteNote,
  deleteScript,
  deleteTask,
  getChecklists,
  getNotes,
  getPrefs,
  getScripts,
  getTasks,
  saveScripts,
  savePrefs,
  upsertChecklist,
  upsertNote,
  upsertScript,
  upsertTask,
} from '@/shared/storage';
import type { LocatorKind, Result } from '@/shared/types';

// ---------------------------------------------------------------------------
// Side panel behavior
// ---------------------------------------------------------------------------

function enableSidePanelOnActionClick(): void {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('[Senmurv] setPanelBehavior failed:', err));
}

// Runs whenever the service worker wakes — cheap and idempotent.
enableSidePanelOnActionClick();

chrome.runtime.onInstalled.addListener(() => {
  enableSidePanelOnActionClick();
});

// ---------------------------------------------------------------------------
// Active-tab resolution
// ---------------------------------------------------------------------------

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isRunnableUrl(url: string | undefined): boolean {
  if (!url) return false;
  return !BLOCKED_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

/** Resolve the active tab, reject blocked pages, then run `fn` against its id. */
async function withActiveRunnableTab<T>(
  fn: (tabId: number) => Promise<Result<T>>
): Promise<Result<T>> {
  const tab = await getActiveTab();
  if (!tab?.id) return { ok: false, error: 'No active tab found.' };
  if (!isRunnableUrl(tab.url)) {
    return {
      ok: false,
      error: 'This page does not allow extensions (chrome://, Web Store, or similar).',
    };
  }
  return fn(tab.id);
}

// ---------------------------------------------------------------------------
// Execute JS Script — MAIN-world injection
// ---------------------------------------------------------------------------

/**
 * Injected into the page's MAIN world and serialized by chrome.scripting, so it
 * MUST be self-contained (no closures, no imports). It evaluates user-provided
 * code via `new Function` — this is the extension's purpose and runs under the
 * PAGE's CSP, exactly like a `javascript:` bookmarklet, never the extension's.
 * See agents.md → Security for the sanctioned-exception rationale.
 */
function runUserScript(code: string): { ok: boolean; error?: string } {
  try {
    // eslint-disable-next-line no-new-func -- sanctioned: page-CSP-governed MAIN-world runner; do not widen
    new Function(code)();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function runScriptInPage(tabId: number, code: string): Promise<Result<void>> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: runUserScript,
      args: [code],
    });
    const outcome = results[0]?.result as { ok: boolean; error?: string } | undefined;
    if (outcome && !outcome.ok) {
      return { ok: false, error: outcome.error ?? 'Script threw an error.' };
    }
    return { ok: true, value: undefined };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Find Element Locator — relay picking commands to the content script
// ---------------------------------------------------------------------------

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Inject the declared picker content script (by its built path from the
 * manifest) into a tab that doesn't have it yet — i.e. a tab that was already
 * open before the extension loaded, so `document_idle` never ran for it.
 */
async function injectPicker(tabId: number): Promise<void> {
  const files = (chrome.runtime.getManifest().content_scripts ?? []).flatMap((cs) => cs.js ?? []);
  if (files.length === 0) throw new Error('No content script registered.');
  await chrome.scripting.executeScript({ target: { tabId }, files });
}

type TabStart =
  | typeof MESSAGE_TYPES.START_PICK
  | typeof MESSAGE_TYPES.START_PICK_FIELDS
  | typeof MESSAGE_TYPES.START_RECORD;

/** Send a start message, retrying briefly while a just-injected script loads. */
async function sendTabMessageWithRetry(
  tabId: number,
  type: TabStart,
  attempts = 12
): Promise<void> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await sendTabMessage(tabId, { type });
      return;
    } catch (err) {
      lastError = err;
      await delay(50);
    }
  }
  throw lastError;
}

/**
 * Start an in-page mode (locator pick, field pick, or record). If the content
 * script isn't there yet (pre-existing tab), inject it and retry — the content
 * listener registers asynchronously after its loader resolves.
 */
async function startPicking(tabId: number, type: TabStart): Promise<Result<void>> {
  try {
    await sendTabMessage(tabId, { type });
    return { ok: true, value: undefined };
  } catch {
    try {
      await injectPicker(tabId);
      await sendTabMessageWithRetry(tabId, type);
      return { ok: true, value: undefined };
    } catch {
      return { ok: false, error: 'Could not reach the page. Try reloading the tab.' };
    }
  }
}

/** Stop an in-page mode (cancel pick / stop record); a no-op if no content script. */
async function cancelPick(
  tabId: number,
  type:
    | typeof MESSAGE_TYPES.CANCEL_PICK
    | typeof MESSAGE_TYPES.STOP_RECORD = MESSAGE_TYPES.CANCEL_PICK
): Promise<Result<void>> {
  try {
    await sendTabMessage(tabId, { type });
  } catch {
    // Nothing to stop — the content script isn't running on this tab.
  }
  return { ok: true, value: undefined };
}

// ---------------------------------------------------------------------------
// Test a locator — count matches on the live page
// ---------------------------------------------------------------------------

/** Injected into the page (ISOLATED world) to count how many elements a locator matches. */
function countMatchesInPage(
  query: string,
  kind: LocatorKind
): { ok: boolean; count?: number; error?: string } {
  try {
    if (kind === 'xpath') {
      // 7 = XPathResult.ORDERED_NODE_SNAPSHOT_TYPE
      const result = document.evaluate(query, document, null, 7, null);
      return { ok: true, count: result.snapshotLength };
    }
    return { ok: true, count: document.querySelectorAll(query).length };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function testLocator(
  tabId: number,
  query: string,
  kind: LocatorKind
): Promise<Result<{ count: number }>> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: countMatchesInPage,
      args: [query, kind],
    });
    const outcome = results[0]?.result as
      | { ok: boolean; count?: number; error?: string }
      | undefined;
    if (!outcome || !outcome.ok) {
      return { ok: false, error: outcome?.error ?? 'Invalid selector.' };
    }
    return { ok: true, value: { count: outcome.count ?? 0 } };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Message hub
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isRuntimeMessage(message)) return false;

  switch (message.type) {
    case MESSAGE_TYPES.GET_SCRIPTS:
      getScripts()
        .then((value) => sendResponse({ ok: true, value }))
        .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
      return true;

    case MESSAGE_TYPES.SAVE_SCRIPT:
      upsertScript(message.payload.script)
        .then((value) => sendResponse({ ok: true, value }))
        .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
      return true;

    case MESSAGE_TYPES.SET_SCRIPTS:
      saveScripts(message.payload.scripts)
        .then(() => sendResponse({ ok: true, value: message.payload.scripts }))
        .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
      return true;

    case MESSAGE_TYPES.DELETE_SCRIPT:
      deleteScript(message.payload.id)
        .then((value) => sendResponse({ ok: true, value }))
        .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
      return true;

    case MESSAGE_TYPES.GET_TASKS:
      getTasks()
        .then((value) => sendResponse({ ok: true, value }))
        .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
      return true;

    case MESSAGE_TYPES.SAVE_TASK:
      upsertTask(message.payload.entry)
        .then((value) => sendResponse({ ok: true, value }))
        .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
      return true;

    case MESSAGE_TYPES.DELETE_TASK:
      deleteTask(message.payload.id)
        .then((value) => sendResponse({ ok: true, value }))
        .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
      return true;

    case MESSAGE_TYPES.GET_CHECKLISTS:
      getChecklists()
        .then((value) => sendResponse({ ok: true, value }))
        .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
      return true;

    case MESSAGE_TYPES.SAVE_CHECKLIST:
      upsertChecklist(message.payload.checklist)
        .then((value) => sendResponse({ ok: true, value }))
        .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
      return true;

    case MESSAGE_TYPES.DELETE_CHECKLIST:
      deleteChecklist(message.payload.id)
        .then((value) => sendResponse({ ok: true, value }))
        .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
      return true;

    case MESSAGE_TYPES.GET_NOTES:
      getNotes()
        .then((value) => sendResponse({ ok: true, value }))
        .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
      return true;

    case MESSAGE_TYPES.SAVE_NOTE:
      upsertNote(message.payload.note)
        .then((value) => sendResponse({ ok: true, value }))
        .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
      return true;

    case MESSAGE_TYPES.DELETE_NOTE:
      deleteNote(message.payload.id)
        .then((value) => sendResponse({ ok: true, value }))
        .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
      return true;

    case MESSAGE_TYPES.GET_PREFS:
      getPrefs()
        .then((value) => sendResponse({ ok: true, value }))
        .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
      return true;

    case MESSAGE_TYPES.SAVE_PREFS:
      savePrefs(message.payload.prefs)
        .then(() => sendResponse({ ok: true, value: message.payload.prefs }))
        .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
      return true;

    case MESSAGE_TYPES.RUN_SCRIPT:
      withActiveRunnableTab((tabId) => runScriptInPage(tabId, message.payload.code)).then(
        sendResponse
      );
      return true;

    case MESSAGE_TYPES.TEST_LOCATOR:
      withActiveRunnableTab((tabId) =>
        testLocator(tabId, message.payload.query, message.payload.kind)
      ).then(sendResponse);
      return true;

    case MESSAGE_TYPES.START_PICK:
      withActiveRunnableTab((tabId) => startPicking(tabId, MESSAGE_TYPES.START_PICK)).then(
        sendResponse
      );
      return true;

    case MESSAGE_TYPES.START_PICK_FIELDS:
      withActiveRunnableTab((tabId) => startPicking(tabId, MESSAGE_TYPES.START_PICK_FIELDS)).then(
        sendResponse
      );
      return true;

    case MESSAGE_TYPES.CANCEL_PICK:
      withActiveRunnableTab((tabId) => cancelPick(tabId)).then(sendResponse);
      return true;

    case MESSAGE_TYPES.START_RECORD:
      withActiveRunnableTab((tabId) => startPicking(tabId, MESSAGE_TYPES.START_RECORD)).then(
        sendResponse
      );
      return true;

    case MESSAGE_TYPES.STOP_RECORD:
      withActiveRunnableTab((tabId) => cancelPick(tabId, MESSAGE_TYPES.STOP_RECORD)).then(
        sendResponse
      );
      return true;

    default:
      // ELEMENT_PICKED / PICK_CANCELLED / FIELD_PICKED / ACTION_RECORDED are
      // addressed to the side panel, which listens directly.
      return false;
  }
});
