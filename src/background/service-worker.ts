import { BLOCKED_URL_PREFIXES, GOD_MODE_CSS, MESSAGE_TYPES } from '@/shared/constants';
import { isRuntimeMessage, sendTabMessage } from '@/shared/messages';
import type { RuntimeMessage } from '@/shared/messages';
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
import type {
  GodModeReport,
  GodModeState,
  LocatorKind,
  PageUnlockState,
  Result,
  XrmReport,
} from '@/shared/types';

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

/** Send a message, retrying briefly while a just-injected content script loads. */
async function sendTabMessageWithRetry<T>(
  tabId: number,
  message: RuntimeMessage,
  attempts = 12
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await sendTabMessage<T>(tabId, message);
    } catch (err) {
      lastError = err;
      await delay(50);
    }
  }
  throw lastError;
}

const UNREACHABLE = 'Could not reach the page. Try reloading the tab.';

/**
 * Deliver a message to the content script, injecting it first for a tab that
 * predates the extension (where `document_idle` never ran). Throws when the
 * page cannot be reached at all.
 */
async function reachTab<T>(tabId: number, message: RuntimeMessage): Promise<T> {
  try {
    return await sendTabMessage<T>(tabId, message);
  } catch {
    await injectPicker(tabId);
    return sendTabMessageWithRetry<T>(tabId, message);
  }
}

function isResult<T>(value: unknown): value is Result<T> {
  return (
    typeof value === 'object' && value !== null && typeof (value as Result<T>).ok === 'boolean'
  );
}

/**
 * Ask the content script something and pass its answer straight through.
 *
 * The content script already replies with a `Result`, so this must NOT wrap it
 * again — a double-wrapped `{ok:true,value:{ok:false,error}}` would report a
 * page-side failure to the panel as a success.
 */
async function askTab<T>(tabId: number, message: RuntimeMessage): Promise<Result<T>> {
  try {
    const reply = await reachTab<unknown>(tabId, message);
    if (isResult<T>(reply)) return reply;
    return { ok: false, error: 'The page returned an unexpected response.' };
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
}

/**
 * Start an in-page mode (locator pick, field pick, record, or a Tools mode).
 * These handlers answer nothing, so the reply is deliberately ignored.
 */
async function startInTab(tabId: number, message: RuntimeMessage): Promise<Result<void>> {
  try {
    await reachTab(tabId, message);
    return { ok: true, value: undefined };
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
}

/** Stop an in-page mode; a no-op (and never an error) if no content script is there. */
async function stopInTab(tabId: number, message: RuntimeMessage): Promise<Result<void>> {
  try {
    await sendTabMessage(tabId, message);
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
// Unlock (God Mode)
// ---------------------------------------------------------------------------

/**
 * insertCSS and removeCSS must receive a BYTE-IDENTICAL descriptor or removal
 * silently no-ops, so both calls spread this one object.
 */
const GOD_CSS = { css: GOD_MODE_CSS, origin: 'AUTHOR' } as const;

async function unlockPage(tabId: number, message: RuntimeMessage): Promise<Result<GodModeReport>> {
  // Inject the override sheet BEFORE the pass so revealed elements never flash.
  // Extension-injected CSS is immune to the page's style-src CSP; an appended
  // <style> element would not be.
  try {
    await chrome.scripting.insertCSS({ target: { tabId }, ...GOD_CSS });
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
  return askTab<GodModeReport>(tabId, message);
}

async function restorePage(tabId: number, message: RuntimeMessage): Promise<Result<GodModeReport>> {
  const result = await askTab<GodModeReport>(tabId, message);
  try {
    await chrome.scripting.removeCSS({ target: { tabId }, ...GOD_CSS });
  } catch {
    // Nothing was injected, or the tab navigated away — the attributes that
    // matter are already restored, so this is not worth failing the call for.
  }
  return result;
}

/** Injected into the page's MAIN world purely to detect a Dynamics form. */
function detectXrm(): boolean {
  const xrm = (window as unknown as { Xrm?: unknown }).Xrm;
  return typeof xrm === 'object' && xrm !== null;
}

async function probeXrm(tabId: number): Promise<boolean> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: detectXrm,
    });
    return results[0]?.result === true;
  } catch {
    return false;
  }
}

/**
 * The Dynamics 365 / Power Apps unlock, ported from Level Up's `enableGodMode`.
 *
 * Runs in the page's MAIN world because the Xrm client API only exists in the
 * page's own realm. NOTE: this passes a serialized FUNCTION, not a code string
 * — it uses neither `eval` nor `new Function`, so it is NOT a second instance
 * of the sanctioned runner exception. See agents.md → Security.
 *
 * Serialized, therefore self-contained: no closures, no imports, and the Xrm
 * shapes are declared inline (types erase; only runtime code is transferred).
 */
function xrmGodMode(): {
  ok: boolean;
  value?: { attributes: number; controls: number; tabs: number; sections: number };
  error?: string;
} {
  interface XrmAttribute {
    getRequiredLevel(): string;
    setRequiredLevel(level: string): void;
  }
  interface XrmControl {
    getVisible?(): boolean;
    setVisible?(visible: boolean): void;
    getDisabled?(): boolean;
    setDisabled?(disabled: boolean): void;
  }
  interface XrmSection {
    getVisible(): boolean;
    setVisible(visible: boolean): void;
  }
  interface XrmTab {
    getVisible(): boolean;
    setVisible(visible: boolean): void;
    sections: { forEach(cb: (section: XrmSection) => void): void };
  }
  interface XrmPage {
    data: { entity: { attributes: { get(): XrmAttribute[] } } };
    ui: {
      controls: { forEach(cb: (control: XrmControl) => void): void };
      tabs: { forEach(cb: (tab: XrmTab) => void): void };
    };
  }

  try {
    const page = (window as unknown as { Xrm?: { Page?: XrmPage } }).Xrm?.Page;
    if (!page) {
      return {
        ok: false,
        error: 'No Dynamics form here — window.Xrm is not present on this page.',
      };
    }

    let attributes = 0;
    let controls = 0;
    let tabs = 0;
    let sections = 0;

    for (const attr of page.data.entity.attributes.get()) {
      if (attr.getRequiredLevel() === 'required') {
        attr.setRequiredLevel('none');
        attributes += 1;
      }
    }

    page.ui.controls.forEach((control) => {
      const wasHidden = typeof control.getVisible === 'function' && !control.getVisible();
      const wasDisabled = typeof control.getDisabled === 'function' && control.getDisabled();
      if (typeof control.setVisible === 'function') control.setVisible(true);
      if (typeof control.setDisabled === 'function') control.setDisabled(false);
      if (wasHidden || wasDisabled) controls += 1;
    });

    page.ui.tabs.forEach((tab) => {
      if (!tab.getVisible()) tabs += 1;
      tab.setVisible(true);
      tab.sections.forEach((section) => {
        if (!section.getVisible()) sections += 1;
        section.setVisible(true);
      });
    });

    return { ok: true, value: { attributes, controls, tabs, sections } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function unlockXrm(tabId: number): Promise<Result<XrmReport>> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: xrmGodMode,
    });
    const outcome = results[0]?.result as
      | { ok: boolean; value?: XrmReport; error?: string }
      | undefined;
    if (!outcome?.ok || !outcome.value) {
      return { ok: false, error: outcome?.error ?? 'The Dynamics unlock returned nothing.' };
    }
    return { ok: true, value: outcome.value };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/** Content-script state plus the MAIN-world Xrm probe the panel needs. */
async function unlockStateFor(
  tabId: number,
  message: RuntimeMessage
): Promise<Result<GodModeState>> {
  const pageState = await askTab<PageUnlockState>(tabId, message);
  if (!pageState.ok) return pageState;
  return { ok: true, value: { ...pageState.value, hasXrm: await probeXrm(tabId) } };
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
    case MESSAGE_TYPES.START_PICK_FIELDS:
    case MESSAGE_TYPES.START_RECORD:
    case MESSAGE_TYPES.START_TOOL_MODE:
      withActiveRunnableTab((tabId) => startInTab(tabId, message)).then(sendResponse);
      return true;

    case MESSAGE_TYPES.CANCEL_PICK:
    case MESSAGE_TYPES.STOP_RECORD:
    case MESSAGE_TYPES.STOP_TOOL_MODE:
      withActiveRunnableTab((tabId) => stopInTab(tabId, message)).then(sendResponse);
      return true;

    case MESSAGE_TYPES.TOOL_PING:
    case MESSAGE_TYPES.HIGHLIGHT_ELEMENT:
      withActiveRunnableTab((tabId) => askTab(tabId, message)).then(sendResponse);
      return true;

    case MESSAGE_TYPES.UNLOCK_PAGE:
      withActiveRunnableTab((tabId) => unlockPage(tabId, message)).then(sendResponse);
      return true;

    case MESSAGE_TYPES.RESTORE_PAGE:
      withActiveRunnableTab((tabId) => restorePage(tabId, message)).then(sendResponse);
      return true;

    case MESSAGE_TYPES.GET_UNLOCK_STATE:
      withActiveRunnableTab((tabId) => unlockStateFor(tabId, message)).then(sendResponse);
      return true;

    case MESSAGE_TYPES.UNLOCK_XRM:
      withActiveRunnableTab((tabId) => unlockXrm(tabId)).then(sendResponse);
      return true;

    default:
      // ELEMENT_PICKED / PICK_CANCELLED / FIELD_PICKED / ACTION_RECORDED are
      // addressed to the side panel, which listens directly.
      return false;
  }
});
