import type { Cookies, Runtime, Tabs } from 'webextension-polyfill';
import { browser } from '@/shared/browser-api';
import {
  ACCOUNTS_PIN_MAX_LENGTH,
  ACCOUNTS_PIN_MIN_LENGTH,
  BLOCKED_URL_PREFIXES,
  BYPASS_CSS,
  FIND_TIMEOUT_SECONDS_DEFAULT,
  MESSAGE_TYPES,
} from '@/shared/constants';
import {
  changePin,
  decryptSecret,
  encryptSecret,
  getLockState,
  lockAccounts,
  setSessionMinutes,
  setUpPin,
  unlockWithPin,
} from '@/shared/crypto';
import { duplicateAccount, isValidPin, validateAccount } from '@/shared/accounts';
import { isRuntimeMessage, sendTabMessage } from '@/shared/messages';
import type { RuntimeMessage } from '@/shared/messages';
import {
  clearDefaultPasswordRecord,
  deleteAccount,
  deleteChecklist,
  deleteNote,
  deleteQueryParamSet,
  deleteScript,
  deleteTask,
  getAccounts,
  getChecklists,
  getDefaultPasswordRecord,
  getNotes,
  getPrefs,
  deleteProfile,
  getProfiles,
  getQueryParamSets,
  getScripts,
  getTasks,
  saveAccounts,
  saveChecklists,
  saveNotes,
  saveProfiles,
  saveQueryParamSets,
  saveScripts,
  saveTasks,
  savePrefs,
  setDefaultPasswordRecord,
  transformTasks,
  upsertAccountStored,
  upsertProfileStored,
  upsertChecklist,
  upsertNote,
  upsertQueryParamSet,
  upsertScript,
  upsertTask,
} from '@/shared/storage';
import { cookieWriteWarning, parseCookieUrl, urlForPath } from '@/shared/cookie-url';
import { clearTagInEntries, renameTagInEntries } from '@/shared/tasks';
import { buildClearPlan } from '@/shared/tools/site-data';
import type {
  Account,
  AccountDraft,
  ClearOutcome,
  ClearTypeId,
  CookieEdit,
  CookieRow,
  BypassReport,
  BypassState,
  EncryptedSecret,
  LocatorKind,
  LogicalNameRecord,
  LogicalNamesReport,
  PageBypassState,
  RegionConfig,
  Result,
  StorageProbe,
  TimeEntry,
  WebStorageSnapshot,
  XrmReport,
  XrmWebApiRecord,
} from '@/shared/types';

// ---------------------------------------------------------------------------
// Side panel behavior
// ---------------------------------------------------------------------------

// chrome.sidePanel has no webextension-polyfill typing — it's a Chrome-only
// API with no Firefox equivalent, so this one check stays on the native
// `chrome` global rather than `browser`. In Firefox, `chrome` still exists
// (as a compatibility alias) but never defines `.sidePanel`, so the check is
// safely falsy there rather than throwing.
function enableSidePanelOnActionClick(): void {
  if (chrome.sidePanel) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((err) => console.error('[Senmurv] setPanelBehavior failed:', err));
  } else if (browser.sidebarAction) {
    browser.action.onClicked.addListener(() => {
      // Must be the first synchronous statement — Firefox revokes the
      // "user gesture" flag after any await (Bugzilla 1800401).
      void browser.sidebarAction.toggle();
    });
  }
}

// Runs whenever the service worker wakes — cheap and idempotent.
enableSidePanelOnActionClick();

browser.runtime.onInstalled.addListener(() => {
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

// The tab the side panel is currently driving — the last runnable tab any
// panel→page command resolved through withActiveTab. Used to tear down in-page
// modes on that tab when the panel closes (see the onConnect handler below).
let drivenTabId: number | undefined;

async function getActiveTab(): Promise<Tabs.Tab | undefined> {
  try {
    const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    return tab;
  } catch {
    // browser.tabs.query can reject during window teardown / no-window states.
    // Treat it as "no active tab" so the caller answers cleanly instead of hanging.
    return undefined;
  }
}

/**
 * Resolve the active tab and reject blocked pages, then run `fn` against it.
 * Use this when the handler needs the tab's URL as well as its id.
 *
 * The whole body is guarded so this NEVER rejects: a throw inside `fn` (e.g. a
 * malformed message payload read lazily inside the callback) becomes a
 * `{ ok: false }` Result, so every `withActiveTab(...).then(sendResponse)` branch
 * in the hub always answers and the caller's `sendMessage` never hangs.
 */
async function withActiveTab<T>(
  fn: (tab: { id: number; url: string | undefined }) => Promise<Result<T>>
): Promise<Result<T>> {
  try {
    const tab = await getActiveTab();
    if (!tab?.id) return { ok: false, error: 'No active tab found.' };
    if (!isRunnableUrl(tab.url)) {
      return {
        ok: false,
        error: 'This page does not allow extensions (chrome://, Web Store, or similar).',
      };
    }
    drivenTabId = tab.id;
    return await fn({ id: tab.id, url: tab.url });
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/** Resolve the active tab, reject blocked pages, then run `fn` against its id. */
async function withActiveRunnableTab<T>(
  fn: (tabId: number) => Promise<Result<T>>
): Promise<Result<T>> {
  return withActiveTab((tab) => fn(tab.id));
}

/**
 * Resolve the active tab WITHOUT the current-URL runnable check — Accounts'
 * login flow is about to navigate this tab away from whatever it currently
 * shows (which could legitimately be `chrome://newtab`), so gating on the
 * tab's URL before that navigation happens would be wrong. `isRunnableUrl` is
 * still applied to the account's saved address itself, in `runAccountLogin`.
 */
async function withAnyActiveTab<T>(fn: (tabId: number) => Promise<Result<T>>): Promise<Result<T>> {
  try {
    const tab = await getActiveTab();
    if (!tab?.id) return { ok: false, error: 'No active tab found.' };
    drivenTabId = tab.id;
    return await fn(tab.id);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

const NAVIGATE_TIMEOUT_MS = 20_000;

/**
 * Navigate `tabId` to `url` and wait for it to finish loading. No precedent
 * for this existed anywhere in the codebase before Accounts — the one other
 * `tabs.update` call site (QueryParamsTool) is fire-and-forget.
 */
function navigateAndWaitForLoad(tabId: number, url: string): Promise<Result<void>> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: Result<void>): void => {
      if (settled) return;
      settled = true;
      browser.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
      resolve(result);
    };
    // Filtered by hand inside the callback, NOT via the `{tabId}` filter-object
    // overload some engines accept — that overload is Chrome-only and silently
    // unsupported on Firefox, which this codebase also targets.
    function onUpdated(updatedTabId: number, changeInfo: Tabs.OnUpdatedChangeInfoType): void {
      if (updatedTabId !== tabId) return;
      if (changeInfo.status === 'complete') finish({ ok: true, value: undefined });
    }
    const timer = setTimeout(
      () => finish({ ok: false, error: 'Timed out waiting for the page to finish loading.' }),
      NAVIGATE_TIMEOUT_MS
    );
    browser.tabs.onUpdated.addListener(onUpdated);
    void browser.tabs
      .update(tabId, { url })
      .catch((err) => finish({ ok: false, error: errorMessage(err) }));
  });
}

// ---------------------------------------------------------------------------
// Execute JS Script — MAIN-world injection
// ---------------------------------------------------------------------------

/**
 * Injected into the page's MAIN world and serialized by browser.scripting, so it
 * MUST be self-contained (no closures, no imports). It evaluates user-provided
 * code via `new Function` — this is the extension's purpose and runs under the
 * PAGE's CSP, exactly like a `javascript:` bookmarklet, never the extension's.
 * See agents.md → Security for the sanctioned-exception rationale.
 *
 * A recorded Flow publishes its async IIFE's promise on `window.__SENMURV_FLOW__`;
 * this runner AWAITS that promise (does NOT add any eval — the sanctioned
 * `new Function` line is unchanged) so the injection settles when the flow
 * FINISHES, letting RUN_SCRIPT's caller know it is done. A plain script sets
 * nothing there and resolves as soon as its synchronous body has run.
 */
function runUserScript(
  code: string
): { ok: boolean; error?: string } | Promise<{ ok: boolean; error?: string }> {
  // A widened (string) key so TS reads the global back as `unknown` rather than
  // narrowing it to `undefined` after the reset — the injected code, opaque to
  // TS, is what actually populates it.
  const KEY: string = '__SENMURV_FLOW__';
  const g = window as unknown as Record<string, unknown>;
  g[KEY] = undefined; // drop any promise a previous run left behind
  try {
    // eslint-disable-next-line no-new-func -- sanctioned: page-CSP-governed MAIN-world runner; do not widen
    new Function(code)();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const flow = g[KEY];
  g[KEY] = undefined;
  if (flow && typeof (flow as { then?: unknown }).then === 'function') {
    return (flow as Promise<unknown>).then(
      () => ({ ok: true }),
      (err: unknown) => ({ ok: false, error: err instanceof Error ? err.message : String(err) })
    );
  }
  return { ok: true };
}

async function runScriptInPage(tabId: number, code: string): Promise<Result<void>> {
  try {
    const results = await browser.scripting.executeScript({
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

/**
 * Ask a running Flow to abort by raising the cross-realm stop flag its interpreter
 * polls (`window.__senmurvFlowStop`). Injected as a real `func` (never a code
 * string) into the MAIN world — the same shape as the Region/Xrm shims, so it does
 * NOT widen the sanctioned `new Function` runner. A no-op when no flow is running.
 */
async function stopFlowInPage(tabId: number): Promise<Result<void>> {
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        (window as unknown as { __senmurvFlowStop?: boolean }).__senmurvFlowStop = true;
      },
    });
    return { ok: true, value: undefined };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/** Rename tag `from` → `to` across every entry (one atomic write); returns the new list. */
async function renameTagAcross(from: string, to: string): Promise<TimeEntry[]> {
  return transformTasks((tasks) => renameTagInEntries(tasks, from, to));
}

/** Un-tag every entry carrying `tag` (entries kept); returns the new list. */
async function clearTagAcross(tag: string): Promise<TimeEntry[]> {
  return transformTasks((tasks) => clearTagInEntries(tasks, tag));
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
  const files = (browser.runtime.getManifest().content_scripts ?? []).flatMap((cs) => cs.js ?? []);
  if (files.length === 0) throw new Error('No content script registered.');
  await browser.scripting.executeScript({ target: { tabId }, files });
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
    const results = await browser.scripting.executeScript({
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
// Bypass — strip the page's client-side locks
// ---------------------------------------------------------------------------

/**
 * insertCSS and removeCSS must receive a BYTE-IDENTICAL descriptor or removal
 * silently no-ops, so both calls spread this one object.
 */
const BYPASS_SHEET = { css: BYPASS_CSS, origin: 'AUTHOR' } as const;

async function bypassPage(tabId: number, message: RuntimeMessage): Promise<Result<BypassReport>> {
  // Inject the override sheet BEFORE the pass so revealed elements never flash.
  // Extension-injected CSS is immune to the page's style-src CSP; an appended
  // <style> element would not be.
  try {
    await browser.scripting.insertCSS({ target: { tabId }, ...BYPASS_SHEET });
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
  return askTab<BypassReport>(tabId, message);
}

async function restorePage(tabId: number, message: RuntimeMessage): Promise<Result<BypassReport>> {
  const result = await askTab<BypassReport>(tabId, message);
  try {
    await browser.scripting.removeCSS({ target: { tabId }, ...BYPASS_SHEET });
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
    const results = await browser.scripting.executeScript({
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
 * The Dynamics 365 / Power Apps bypass, ported from Level Up for Dynamics CRM.
 *
 * Runs in the page's MAIN world because the Xrm client API only exists in the
 * page's own realm. NOTE: this passes a serialized FUNCTION, not a code string
 * — it uses neither `eval` nor `new Function`, so it is NOT a second instance
 * of the sanctioned runner exception. See agents.md → Security.
 *
 * Serialized, therefore self-contained: no closures, no imports, and the Xrm
 * shapes are declared inline (types erase; only runtime code is transferred).
 */
function xrmBypass(): {
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

async function bypassXrm(tabId: number): Promise<Result<XrmReport>> {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: xrmBypass,
    });
    const outcome = results[0]?.result as
      | { ok: boolean; value?: XrmReport; error?: string }
      | undefined;
    if (!outcome?.ok || !outcome.value) {
      return { ok: false, error: outcome?.error ?? 'The Dynamics bypass returned nothing.' };
    }
    return { ok: true, value: outcome.value };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/**
 * Resolve the current Dynamics record to its Dataverse Web API URL — ported
 * from God Mode's "Open record in Web API" button (Level Up for Dynamics CRM).
 *
 * Runs in the page's MAIN world because the Xrm client API only exists in the
 * page's own realm. NOTE: this passes a serialized FUNCTION, not a code string
 * — it uses neither `eval` nor `new Function`, so it is NOT a second instance
 * of the sanctioned runner exception. See agents.md → Security.
 *
 * Serialized, therefore self-contained: no closures, no imports, and the Xrm
 * shapes are declared inline (types erase; only runtime code is transferred).
 * `Xrm.Utility.getEntityMetadata` is async, so this func is async too —
 * `browser.scripting.executeScript` awaits a returned promise before handing
 * back `results[0].result` (see probeStorageInPage for the same shape).
 */
async function readXrmWebApiUrl(): Promise<{
  ok: boolean;
  value?: { entityLogicalName: string; entitySetName: string; recordId: string; url: string };
  error?: string;
}> {
  interface XrmEntity {
    getId(): string;
    getEntityName(): string;
  }
  interface XrmPageContext {
    getClientUrl(): string;
  }
  interface XrmPage {
    data: { entity: XrmEntity };
    context: XrmPageContext;
  }
  interface XrmEntityMetadata {
    EntitySetName: string;
  }
  interface XrmUtility {
    getEntityMetadata(entityLogicalName: string, attributes: string[]): Promise<XrmEntityMetadata>;
  }

  try {
    const xrm = (window as unknown as { Xrm?: { Page?: XrmPage; Utility?: XrmUtility } }).Xrm;
    const page = xrm?.Page;
    if (!page || !xrm?.Utility) {
      return {
        ok: false,
        error: 'No Dynamics form here — window.Xrm is not present on this page.',
      };
    }

    const recordId = page.data.entity.getId().replace(/[{}]/g, '');
    const isUnsaved = recordId === '' || /^0+$/.test(recordId.replace(/-/g, ''));
    if (isUnsaved) {
      return {
        ok: false,
        error: 'This record has not been saved yet — it has no id to open in the Web API.',
      };
    }

    const entityLogicalName = page.data.entity.getEntityName();
    const metadata = await xrm.Utility.getEntityMetadata(entityLogicalName, []);
    const entitySetName = metadata.EntitySetName;
    const clientUrl = page.context.getClientUrl();
    const url = `${clientUrl}/api/data/v9.2/${entitySetName}(${recordId})`;

    return { ok: true, value: { entityLogicalName, entitySetName, recordId, url } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function xrmWebApiUrl(tabId: number): Promise<Result<XrmWebApiRecord>> {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: readXrmWebApiUrl,
    });
    const outcome = results[0]?.result as
      | { ok: boolean; value?: XrmWebApiRecord; error?: string }
      | undefined;
    if (!outcome?.ok || !outcome.value) {
      return { ok: false, error: outcome?.error ?? 'Resolving the Web API URL returned nothing.' };
    }
    return { ok: true, value: outcome.value };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/**
 * Read every logical (schema) name off a Dynamics form, for the Logical names
 * overlay. Runs in the page's MAIN world because `Xrm` only exists in the page's
 * own realm. NOTE: a serialized FUNCTION, not a code string — neither `eval` nor
 * `new Function`, so it is NOT a second instance of the sanctioned runner
 * exception. See agents.md → Security.
 *
 * Serialized, therefore self-contained: no closures, no imports, no module
 * constants (the cap is inlined). It returns PLAIN DATA only — `executeScript`
 * results must be JSON-serialisable, so it can hand back names but never the
 * elements they belong to; the content script re-resolves those from `[data-id]`.
 */
function readXrmLogicalNames(): {
  ok: boolean;
  value?: { name: string; kind: 'field' | 'tab' | 'section' }[];
  error?: string;
} {
  interface XrmNamed {
    getName?(): string;
  }
  interface XrmTab extends XrmNamed {
    sections: { forEach(cb: (section: XrmNamed) => void): void };
  }
  interface XrmPage {
    ui: {
      controls: { forEach(cb: (control: XrmNamed) => void): void };
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

    const LIMIT = 500; // mirrors LOGICAL_NAMES_MAX; inlined because this is serialized
    const out: { name: string; kind: 'field' | 'tab' | 'section' }[] = [];
    const push = (named: XrmNamed, kind: 'field' | 'tab' | 'section'): void => {
      if (out.length >= LIMIT) return;
      // Feature-detected: not every control type implements the full interface.
      if (typeof named.getName !== 'function') return;
      let name: string;
      try {
        name = named.getName();
      } catch {
        return; // one unreadable control must not lose the whole pass
      }
      if (name) out.push({ name, kind });
    };

    page.ui.tabs.forEach((tab) => {
      push(tab, 'tab');
      tab.sections.forEach((section) => push(section, 'section'));
    });
    page.ui.controls.forEach((control) => push(control, 'field'));

    return { ok: true, value: out };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Show the logical-names overlay: read the names in the MAIN world, then hand
 * them to the content script (ISOLATED world), which owns the one overlay and
 * resolves each name to an element. The two realms share a document but no JS
 * objects, which is exactly why this is a two-step.
 */
async function showLogicalNames(tabId: number): Promise<Result<LogicalNamesReport>> {
  let records: LogicalNameRecord[];
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: readXrmLogicalNames,
    });
    const outcome = results[0]?.result as
      | { ok: boolean; value?: LogicalNameRecord[]; error?: string }
      | undefined;
    if (!outcome?.ok || !outcome.value) {
      return { ok: false, error: outcome?.error ?? 'Reading the Dynamics form returned nothing.' };
    }
    records = outcome.value;
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
  return askTab<LogicalNamesReport>(tabId, {
    type: MESSAGE_TYPES.DRAW_LOGICAL_NAMES,
    payload: { records },
  });
}

/** Content-script state plus the MAIN-world Xrm probe the panel needs. */
async function bypassStateFor(
  tabId: number,
  message: RuntimeMessage
): Promise<Result<BypassState>> {
  const pageState = await askTab<PageBypassState>(tabId, message);
  if (!pageState.ok) return pageState;
  return { ok: true, value: { ...pageState.value, hasXrm: await probeXrm(tabId) } };
}

// ---------------------------------------------------------------------------
// Site data — clear the CURRENT ORIGIN from the page itself, no new permission
// ---------------------------------------------------------------------------

/**
 * Injected into the page (ISOLATED world — NO `world` key, and a test asserts
 * its absence). A content script's `localStorage` / `caches` / `indexedDB` are
 * the PAGE origin's, which is exactly what we want to measure.
 *
 * Serialized, so self-contained. EVERY read is separately guarded: `navigator
 * .storage`, `caches` and `navigator.serviceWorker` are `[SecureContext]` and
 * undefined on plain http, and `localStorage` / `document.cookie` throw
 * `SecurityError` outright when site data is blocked. One uncaught throw would
 * reject the entire injection and lose the whole probe.
 */
async function probeStorageInPage(): Promise<{
  origin: string;
  isSecureContext: boolean;
  usage: number | null;
  quota: number | null;
  details: { key: string; bytes: number }[];
  localStorageBytes: number | null;
  sessionStorageBytes: number | null;
  cookieCount: number | null;
  cacheCount: number | null;
  serviceWorkerCount: number | null;
  indexedDbCount: number | null;
  warnings: string[];
}> {
  // TS's lib.dom StorageEstimate declares only {quota, usage}, so usageDetails
  // needs a local structural type. Types erase; nothing is transferred.
  interface EstimateWithDetails {
    usage?: number;
    quota?: number;
    usageDetails?: Record<string, number>;
  }

  const warnings: string[] = [];
  const secure = self.isSecureContext;

  let usage: number | null = null;
  let quota: number | null = null;
  const details: { key: string; bytes: number }[] = [];
  try {
    const estimate = (await navigator.storage.estimate()) as EstimateWithDetails;
    usage = typeof estimate.usage === 'number' ? estimate.usage : null;
    quota = typeof estimate.quota === 'number' ? estimate.quota : null;
    let accounted = 0;
    for (const [key, bytes] of Object.entries(estimate.usageDetails ?? {})) {
      if (typeof bytes === 'number') {
        details.push({ key, bytes });
        accounted += bytes;
      }
    }
    // Blink omits zero-valued keys, so usage can exceed the sum of details.
    if (usage !== null && usage > accounted) {
      details.push({ key: 'other', bytes: usage - accounted });
    }
  } catch {
    warnings.push(
      secure
        ? 'Storage estimate is unavailable on this page.'
        : 'This page is not a secure context, so quota storage cannot be measured.'
    );
  }

  const byteSize = (store: Storage): number => {
    let total = 0;
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key === null) continue;
      // UTF-16: two bytes per code unit, key and value both counted.
      total += (key.length + (store.getItem(key) ?? '').length) * 2;
    }
    return total;
  };

  let localStorageBytes: number | null = null;
  try {
    localStorageBytes = byteSize(localStorage);
  } catch {
    warnings.push('Local storage is blocked on this page.');
  }

  let sessionStorageBytes: number | null = null;
  try {
    sessionStorageBytes = byteSize(sessionStorage);
  } catch {
    /* same cause as localStorage; one warning is enough */
  }

  let cookieCount: number | null = null;
  try {
    const raw = document.cookie;
    cookieCount = raw === '' ? 0 : raw.split(';').length;
  } catch {
    warnings.push('Cookies are blocked on this page.');
  }

  let cacheCount: number | null = null;
  try {
    cacheCount = (await caches.keys()).length;
  } catch {
    /* not a secure context, already reported */
  }

  let serviceWorkerCount: number | null = null;
  try {
    serviceWorkerCount = (await navigator.serviceWorker.getRegistrations()).length;
  } catch {
    /* not a secure context, already reported */
  }

  let indexedDbCount: number | null = null;
  try {
    const databases = indexedDB.databases as undefined | (() => Promise<unknown[]>);
    if (typeof databases === 'function') indexedDbCount = (await databases.call(indexedDB)).length;
  } catch {
    /* Firefox-style engines lack databases(); leave it unknown */
  }

  return {
    origin: location.origin,
    isSecureContext: secure,
    usage,
    quota,
    details,
    localStorageBytes,
    sessionStorageBytes,
    cookieCount,
    cacheCount,
    serviceWorkerCount,
    indexedDbCount,
    warnings,
  };
}

/**
 * Injected into the page (ISOLATED world) to clear the listed data for THIS
 * origin. Self-contained; `types` arrives via `args` and has already been
 * validated by `buildClearPlan`, so nothing unexpected can reach it.
 */
async function clearStorageInPage(
  types: string[]
): Promise<{ cleared: string[]; skipped: { type: string; reason: string }[] }> {
  const cleared: string[] = [];
  const skipped: { type: string; reason: string }[] = [];

  const run = async (type: string, fn: () => Promise<void> | void): Promise<void> => {
    try {
      await fn();
      cleared.push(type);
    } catch (err) {
      skipped.push({ type, reason: err instanceof Error ? err.message : String(err) });
    }
  };

  for (const type of types) {
    if (type === 'localStorage') await run(type, () => localStorage.clear());
    else if (type === 'sessionStorage') await run(type, () => sessionStorage.clear());
    else if (type === 'cacheStorage') {
      await run(type, async () => {
        for (const key of await caches.keys()) await caches.delete(key);
      });
    } else if (type === 'serviceWorkers') {
      await run(type, async () => {
        for (const reg of await navigator.serviceWorker.getRegistrations()) await reg.unregister();
      });
    } else if (type === 'indexedDB') {
      await run(type, async () => {
        const databases = indexedDB.databases as undefined | (() => Promise<{ name?: string }[]>);
        if (typeof databases !== 'function') throw new Error('This browser cannot list databases.');
        // Await each delete instead of firing and forgetting: deleteDatabase is
        // an async request that BLOCKS while another tab holds the DB open, so
        // the old code reported "cleared" for a delete that had not happened.
        await Promise.all(
          (await databases.call(indexedDB)).map((db) => {
            const name = db.name;
            if (name === undefined) return Promise.resolve();
            return new Promise<void>((resolve, reject) => {
              const req = indexedDB.deleteDatabase(name);
              req.onsuccess = () => resolve();
              req.onerror = () => reject(req.error ?? new Error(`Could not delete "${name}".`));
              req.onblocked = () =>
                reject(new Error(`"${name}" is open in another tab — close it and retry.`));
            });
          })
        );
      });
    } else if (type === 'cookies') {
      await run(type, () => {
        // document.cookie reaches only non-HttpOnly cookies. Expire each one at
        // every path/domain scope it might have been set on.
        const host = location.hostname;
        const domains = [undefined, host, `.${host}`];
        const paths = ['/', location.pathname];
        for (const pair of document.cookie.split(';')) {
          const name = pair.split('=')[0]?.trim();
          if (name === undefined || name === '') continue;
          for (const path of paths) {
            for (const domain of domains) {
              document.cookie =
                `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}` +
                (domain === undefined ? '' : `; domain=${domain}`);
            }
          }
        }
      });
    }
  }
  return { cleared, skipped };
}

async function probeSiteStorage(tabId: number): Promise<Result<StorageProbe>> {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: probeStorageInPage,
    });
    const probe = results[0]?.result as StorageProbe | undefined;
    if (!probe) return { ok: false, error: 'Could not read this page’s storage.' };
    return { ok: true, value: probe };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

async function clearSiteData(
  tabId: number,
  url: string | undefined,
  types: ClearTypeId[],
  shouldReload: boolean
): Promise<Result<ClearOutcome>> {
  const plan = buildClearPlan(url ?? '', types);
  if (!plan.ok) return plan;

  let outcome: { cleared: string[]; skipped: { type: string; reason: string }[] };
  try {
    // ISOLATED world (no `world` key): a content script's storage is the page
    // origin's, which is what we clear. `types` is already validated.
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: clearStorageInPage,
      args: [[...plan.value.types]],
    });
    const raw = results[0]?.result as typeof outcome | undefined;
    if (!raw) return { ok: false, error: 'The page did not report what was cleared.' };
    outcome = raw;
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  // Deliberately NO before/after "bytes freed": navigator.storage.estimate is
  // padded and lazy (verified — Cache Storage deletion is not reflected for
  // seconds) and ignores localStorage and cookies entirely, so a delta is
  // fiction. The panel re-probes after a clear and shows the real new state.

  let didReload = false;
  if (shouldReload) {
    try {
      // The one way past the HTTP cache, which no extension API can clear for a
      // single origin.
      await browser.tabs.reload(tabId, { bypassCache: true });
      didReload = true;
    } catch {
      // The tab may have gone; the data is still cleared.
    }
  }

  return {
    ok: true,
    value: {
      cleared: outcome.cleared as ClearTypeId[],
      skipped: outcome.skipped as { type: ClearTypeId; reason: string }[],
      didReload,
    },
  };
}

// ---------------------------------------------------------------------------
// Region emulator — a MAIN-world shim that makes page JS read another region's
// clock, timezone, locale and geolocation
// ---------------------------------------------------------------------------

/**
 * Injected into the page's MAIN world. Overrides `Date`'s timezone-facing methods,
 * `Intl` defaults, `navigator.language(s)` and `navigator.geolocation` so page
 * code sees `config`'s region. Reversible: the undo stack is stored on
 * `window.__senmurvRegion`, so RESTORE (a separate injection) can call it.
 *
 * NOTE: passes a real FUNCTION, not a code string — neither `eval` nor
 * `new Function` — so it does NOT widen the sanctioned runner exception (see
 * agents.md → Security). Serialized, therefore self-contained (no imports/closures
 * from this module). Affects only code that runs AFTER it applies; a reload clears
 * it, and it cannot change the IP or the `Accept-Language` header.
 */
function applyRegionShim(config: RegionConfig): { ok: boolean; error?: string } {
  try {
    const w = window as unknown as { __senmurvRegion?: { restore: () => void } };
    if (w.__senmurvRegion && typeof w.__senmurvRegion.restore === 'function') {
      w.__senmurvRegion.restore();
    }

    const undo: Array<() => void> = [];
    const tz = config.timezone;
    const locale = config.locale;
    const coords = config.coords;
    const OrigDTF = Intl.DateTimeFormat;
    const intlRef = Intl as unknown as { DateTimeFormat: unknown; NumberFormat: unknown };

    const eastOffsetMinutes = (date: Date): number => {
      const parts = new OrigDTF('en-US', {
        timeZone: tz,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).formatToParts(date);
      const map: Record<string, string> = {};
      for (const part of parts) map[part.type] = part.value;
      let hour = Number(map.hour);
      if (hour === 24) hour = 0;
      const asUTC = Date.UTC(
        Number(map.year),
        Number(map.month) - 1,
        Number(map.day),
        hour,
        Number(map.minute),
        Number(map.second)
      );
      return Math.round((asUTC - date.getTime()) / 60000);
    };

    const withTz = (
      locales: string | string[] | undefined,
      options: Intl.DateTimeFormatOptions | undefined
    ): [string | string[] | undefined, Intl.DateTimeFormatOptions] => {
      const opts: Intl.DateTimeFormatOptions = options ? { ...options } : {};
      if (opts.timeZone === undefined) opts.timeZone = tz;
      return [locales === undefined && locale ? locale : locales, opts];
    };

    if (tz) {
      const origGTO = Date.prototype.getTimezoneOffset;
      Date.prototype.getTimezoneOffset = function (this: Date): number {
        return -eastOffsetMinutes(this);
      };
      undo.push(() => {
        Date.prototype.getTimezoneOffset = origGTO;
      });

      const PatchedDTF = function (
        locales?: string | string[],
        options?: Intl.DateTimeFormatOptions
      ): Intl.DateTimeFormat {
        const [loc, opts] = withTz(locales, options);
        return new OrigDTF(loc, opts);
      } as unknown as { prototype: unknown; supportedLocalesOf: unknown };
      PatchedDTF.prototype = OrigDTF.prototype;
      PatchedDTF.supportedLocalesOf = OrigDTF.supportedLocalesOf;
      intlRef.DateTimeFormat = PatchedDTF;
      undo.push(() => {
        intlRef.DateTimeFormat = OrigDTF;
      });

      const origLS = Date.prototype.toLocaleString;
      Date.prototype.toLocaleString = function (
        this: Date,
        locales?: string | string[],
        options?: Intl.DateTimeFormatOptions
      ): string {
        const [loc, opts] = withTz(locales, options);
        return origLS.call(this, loc, opts);
      };
      undo.push(() => {
        Date.prototype.toLocaleString = origLS;
      });

      const origLDS = Date.prototype.toLocaleDateString;
      Date.prototype.toLocaleDateString = function (
        this: Date,
        locales?: string | string[],
        options?: Intl.DateTimeFormatOptions
      ): string {
        const [loc, opts] = withTz(locales, options);
        return origLDS.call(this, loc, opts);
      };
      undo.push(() => {
        Date.prototype.toLocaleDateString = origLDS;
      });

      const origLTS = Date.prototype.toLocaleTimeString;
      Date.prototype.toLocaleTimeString = function (
        this: Date,
        locales?: string | string[],
        options?: Intl.DateTimeFormatOptions
      ): string {
        const [loc, opts] = withTz(locales, options);
        return origLTS.call(this, loc, opts);
      };
      undo.push(() => {
        Date.prototype.toLocaleTimeString = origLTS;
      });
    }

    if (locale) {
      const nav = navigator as unknown as Record<string, unknown>;
      const prevLang = Object.getOwnPropertyDescriptor(navigator, 'language');
      const prevLangs = Object.getOwnPropertyDescriptor(navigator, 'languages');
      Object.defineProperty(navigator, 'language', { get: () => locale, configurable: true });
      Object.defineProperty(navigator, 'languages', { get: () => [locale], configurable: true });
      undo.push(() => {
        if (prevLang) Object.defineProperty(navigator, 'language', prevLang);
        else delete nav.language;
        if (prevLangs) Object.defineProperty(navigator, 'languages', prevLangs);
        else delete nav.languages;
      });

      // `Number.prototype.toLocaleString()` (and Date's, handled above) read the
      // default locale directly, NOT via the Intl.NumberFormat constructor — so
      // patch it as well, or `(1234.5).toLocaleString()` ignores the region.
      const origNTLS = Number.prototype.toLocaleString;
      Number.prototype.toLocaleString = function (
        this: number,
        locales?: string | string[],
        options?: Intl.NumberFormatOptions
      ): string {
        return origNTLS.call(this, locales === undefined ? locale : locales, options);
      };
      undo.push(() => {
        Number.prototype.toLocaleString = origNTLS;
      });

      const OrigNF = Intl.NumberFormat;
      const PatchedNF = function (
        locales?: string | string[],
        options?: Intl.NumberFormatOptions
      ): Intl.NumberFormat {
        return new OrigNF(locales === undefined ? locale : locales, options);
      } as unknown as { prototype: unknown; supportedLocalesOf: unknown };
      PatchedNF.prototype = OrigNF.prototype;
      PatchedNF.supportedLocalesOf = OrigNF.supportedLocalesOf;
      intlRef.NumberFormat = PatchedNF;
      undo.push(() => {
        intlRef.NumberFormat = OrigNF;
      });
    }

    if (coords && navigator.geolocation) {
      const geo = navigator.geolocation as unknown as {
        getCurrentPosition: unknown;
        watchPosition: unknown;
        clearWatch: unknown;
      };
      const origGet = geo.getCurrentPosition;
      const origWatch = geo.watchPosition;
      const origClear = geo.clearWatch;
      const makePos = (): GeolocationPosition =>
        ({
          coords: {
            latitude: coords.lat,
            longitude: coords.lon,
            accuracy: 20,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        }) as unknown as GeolocationPosition;
      let watchId = 0;
      geo.getCurrentPosition = (success: PositionCallback): void => {
        if (typeof success === 'function') success(makePos());
      };
      geo.watchPosition = (success: PositionCallback): number => {
        if (typeof success === 'function') success(makePos());
        // A spoofed region is static, so the position never changes: deliver it
        // once and never re-fire. Return a unique NON-ZERO id (the old shim
        // returned 0 for every watch) so the paired clearWatch(id) is well-formed.
        watchId += 1;
        return watchId;
      };
      geo.clearWatch = (): void => {
        // No live watch is ever scheduled, so there is nothing to cancel — but
        // the method must exist and accept our ids without reaching the original.
      };
      undo.push(() => {
        geo.getCurrentPosition = origGet;
        geo.watchPosition = origWatch;
        geo.clearWatch = origClear;
      });
    }

    (window as unknown as { __senmurvRegion?: unknown }).__senmurvRegion = {
      config,
      restore: () => {
        for (let i = undo.length - 1; i >= 0; i -= 1) {
          try {
            const fn = undo[i];
            if (fn) fn();
          } catch {
            // best-effort restore
          }
        }
        delete (window as unknown as Record<string, unknown>).__senmurvRegion;
      },
    };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Injected to undo the region shim, if one is active. */
function restoreRegionShim(): { ok: boolean } {
  const w = window as unknown as { __senmurvRegion?: { restore: () => void } };
  if (w.__senmurvRegion && typeof w.__senmurvRegion.restore === 'function') {
    w.__senmurvRegion.restore();
  }
  return { ok: true };
}

/** Injected to read whether a shim is active and with what config. */
function regionStateShim(): { active: boolean; config: RegionConfig | null } {
  const w = window as unknown as { __senmurvRegion?: { config: RegionConfig } };
  return { active: Boolean(w.__senmurvRegion), config: w.__senmurvRegion?.config ?? null };
}

async function applyRegion(tabId: number, config: RegionConfig): Promise<Result<void>> {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: applyRegionShim,
      args: [config],
    });
    const outcome = results[0]?.result as { ok: boolean; error?: string } | undefined;
    if (!outcome?.ok) return { ok: false, error: outcome?.error ?? 'The region shim failed.' };
    return { ok: true, value: undefined };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

async function restoreRegion(tabId: number): Promise<Result<void>> {
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: restoreRegionShim,
    });
    return { ok: true, value: undefined };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

async function getRegionState(
  tabId: number
): Promise<Result<{ active: boolean; config: RegionConfig | null }>> {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: regionStateShim,
    });
    const outcome = results[0]?.result as
      | { active: boolean; config: RegionConfig | null }
      | undefined;
    return { ok: true, value: outcome ?? { active: false, config: null } };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Web storage (Storage tab) — ISOLATED-world injection
// ---------------------------------------------------------------------------

/**
 * Injected into the page (ISOLATED world, like the Site-data probe): a content
 * script's `localStorage` / `sessionStorage` ARE the page origin's, so this needs
 * no MAIN-world access and no extra permission. Each area is guarded separately —
 * one throw (site data blocked, opaque origin) must not lose the other.
 */
function readWebStorageInPage(): {
  origin: string;
  local: { key: string; value: string }[];
  session: { key: string; value: string }[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const dump = (store: Storage, label: string): { key: string; value: string }[] => {
    const out: { key: string; value: string }[] = [];
    try {
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (key === null) continue;
        out.push({ key, value: store.getItem(key) ?? '' });
      }
    } catch (err) {
      warnings.push(`${label} is unreadable: ${err instanceof Error ? err.message : String(err)}`);
    }
    return out;
  };
  return {
    origin: location.origin,
    local: dump(window.localStorage, 'localStorage'),
    session: dump(window.sessionStorage, 'sessionStorage'),
    warnings,
  };
}

/** Injected writer — returns an error string (e.g. quota exceeded) rather than throwing. */
function writeWebStorageInPage(
  area: 'local' | 'session',
  key: string,
  value: string
): string | null {
  try {
    (area === 'local' ? window.localStorage : window.sessionStorage).setItem(key, value);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function removeWebStorageInPage(area: 'local' | 'session', key: string): string | null {
  try {
    (area === 'local' ? window.localStorage : window.sessionStorage).removeItem(key);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function clearWebStorageInPage(area: 'local' | 'session'): string | null {
  try {
    (area === 'local' ? window.localStorage : window.sessionStorage).clear();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

async function readWebStorage(tabId: number): Promise<Result<WebStorageSnapshot>> {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: readWebStorageInPage,
    });
    const snapshot = results[0]?.result as WebStorageSnapshot | undefined;
    if (!snapshot) return { ok: false, error: 'Could not read this page’s storage.' };
    return { ok: true, value: snapshot };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/** Run one injected storage mutation; the injected fn reports failure as a string. */
async function mutateWebStorage(
  tabId: number,
  func: (...args: never[]) => string | null,
  args: unknown[]
): Promise<Result<void>> {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: func as (...a: unknown[]) => string | null,
      args,
    });
    const failure = results[0]?.result as string | null | undefined;
    if (typeof failure === 'string') return { ok: false, error: failure };
    return { ok: true, value: undefined };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Cookies tab — browser.cookies against the active tab's URL
// ---------------------------------------------------------------------------

/**
 * Validate the tab's URL as a cookie-addressable http(s) page. Takes the URL
 * directly (already resolved by withActiveTab) rather than re-fetching the
 * tab via browser.tabs.get — every caller here is reached through
 * withActiveTab, which already paid for exactly one browser.tabs.query.
 */
function cookieUrlFrom(url: string | undefined): Result<URL> {
  return parseCookieUrl(url ?? '');
}

function toCookieRow(c: Cookies.Cookie): CookieRow {
  return {
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    secure: c.secure,
    httpOnly: c.httpOnly,
    sameSite: (c.sameSite ?? 'unspecified') as CookieRow['sameSite'],
    expirationDate: typeof c.expirationDate === 'number' ? c.expirationDate : null,
    session: c.session,
    hostOnly: c.hostOnly,
  };
}

/**
 * Every cookie readable for this tab, INCLUDING HttpOnly ones (invisible to
 * `document.cookie` — the reason this tab needs the `cookies` permission).
 * Queried by domain rather than URL so cookies scoped to another path still
 * appear; Chrome's URL match is a path PREFIX test that would hide them.
 */
async function listCookies(
  url: string | undefined
): Promise<Result<{ origin: string; rows: CookieRow[] }>> {
  const urlRes = cookieUrlFrom(url);
  if (!urlRes.ok) return urlRes;
  try {
    const all = await browser.cookies.getAll({ domain: urlRes.value.hostname });
    const rows = all.map(toCookieRow).sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true, value: { origin: urlRes.value.origin, rows } };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

async function setCookie(url: string | undefined, edit: CookieEdit): Promise<Result<void>> {
  const urlRes = cookieUrlFrom(url);
  if (!urlRes.ok) return urlRes;
  const path = edit.path.trim() === '' ? '/' : edit.path.trim();
  const warning = cookieWriteWarning({ ...edit, path }, urlRes.value);
  if (warning !== null) return { ok: false, error: warning };
  try {
    // `domain` is deliberately omitted so Chrome derives a host-only cookie from
    // the URL — that side-steps the leading-dot rule and the __Host- prefix trap.
    const details: Cookies.SetDetailsType = {
      url: urlForPath(urlRes.value, path),
      name: edit.name.trim(),
      value: edit.value,
      path,
      secure: edit.secure,
      httpOnly: edit.httpOnly,
      sameSite: edit.sameSite,
    };
    if (edit.expirationDate !== null) details.expirationDate = edit.expirationDate;
    const written = await browser.cookies.set(details);
    if (written === null) {
      return { ok: false, error: 'Chrome rejected the cookie (check Secure / SameSite / name).' };
    }
    return { ok: true, value: undefined };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

async function removeCookie(
  url: string | undefined,
  name: string,
  path: string
): Promise<Result<void>> {
  const urlRes = cookieUrlFrom(url);
  if (!urlRes.ok) return urlRes;
  try {
    await browser.cookies.remove({ url: urlForPath(urlRes.value, path || '/'), name });
    return { ok: true, value: undefined };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/** Remove every cookie this tab can see, each at its own path. */
async function clearCookies(url: string | undefined): Promise<Result<number>> {
  const urlRes = cookieUrlFrom(url);
  if (!urlRes.ok) return urlRes;
  try {
    const all = await browser.cookies.getAll({ domain: urlRes.value.hostname });
    // Concurrent, not sequential — each removal targets an independent
    // name+path pulled from the same snapshot, so nothing depends on order.
    // allSettled (not all) so one un-addressable cookie can't abort the rest.
    const results = await Promise.allSettled(
      all.map((c) =>
        browser.cookies.remove({ url: urlForPath(urlRes.value, c.path), name: c.name })
      )
    );
    const removed = results.filter((r) => r.status === 'fulfilled').length;
    return { ok: true, value: removed };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Accounts tab — saved logins, PIN-locked encryption
// ---------------------------------------------------------------------------

const PIN_LENGTH_ERROR = `PIN must be ${ACCOUNTS_PIN_MIN_LENGTH}-${ACCOUNTS_PIN_MAX_LENGTH} digits.`;

/**
 * Resolve a draft's password state: keep the existing encrypted password,
 * encrypt a newly-entered one, or drop it entirely for `useDefaultPassword`.
 * Then validate and persist. `shared/crypto.ts` throws when Accounts are
 * locked (caught by this handler's `.catch` in the switch below), so a save
 * that needs to encrypt a password while locked fails with a clear error.
 */
async function saveAccount(draft: AccountDraft): Promise<Result<Account[]>> {
  const now = Date.now();
  const existing = (await getAccounts()).find((a) => a.id === draft.id);

  let encryptedPassword = existing?.encryptedPassword;
  if (draft.useDefaultPassword) {
    encryptedPassword = undefined;
  } else if (draft.newPassword !== undefined) {
    if (draft.newPassword.trim() === '') {
      return { ok: false, error: 'Enter a password, or check "use default password".' };
    }
    encryptedPassword = await encryptSecret(draft.newPassword);
  } else if (!encryptedPassword) {
    return { ok: false, error: 'Enter a password, or check "use default password".' };
  }

  const candidate: Account = {
    id: draft.id,
    name: draft.name,
    address: draft.address,
    username: draft.username,
    useDefaultPassword: draft.useDefaultPassword,
    usernameField: draft.usernameField,
    passwordField: draft.passwordField,
    loginButton: draft.loginButton,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (encryptedPassword) candidate.encryptedPassword = encryptedPassword;
  if (draft.group) candidate.group = draft.group;

  const validated = validateAccount(candidate);
  if (!validated.ok) return validated;
  return { ok: true, value: await upsertAccountStored(validated.value) };
}

/** Clone a saved account (fresh id, de-duplicated name). Crypto-free — the
 *  copied ciphertext is valid under any id — so this works even while
 *  Accounts is locked. */
async function duplicateAccountInStore(id: string): Promise<Result<Account[]>> {
  const accounts = await getAccounts();
  const cloned = duplicateAccount(accounts, id, Date.now());
  if (!cloned.ok) return cloned;
  return { ok: true, value: await upsertAccountStored(cloned.value) };
}

/**
 * Navigate to the saved account's address, wait for the page to load, decrypt
 * the right password (the account's own, or the shared default), and ask the
 * content script to fill + click via the saved locators.
 */
async function runAccountLogin(tabId: number, id: string): Promise<Result<void>> {
  const account = (await getAccounts()).find((a) => a.id === id);
  if (!account) return { ok: false, error: 'Account not found — it may have been deleted.' };

  if (!isRunnableUrl(account.address)) {
    return { ok: false, error: 'This address is not allowed (chrome://, Web Store, or similar).' };
  }

  let password: string;
  try {
    if (account.useDefaultPassword) {
      const record = await getDefaultPasswordRecord();
      if (!record) {
        return {
          ok: false,
          error:
            'No default password is set — set one in Accounts, or give this account its own password.',
        };
      }
      password = await decryptSecret(record.encryptedPassword);
    } else {
      if (!account.encryptedPassword)
        return { ok: false, error: 'This account has no password saved.' };
      password = await decryptSecret(account.encryptedPassword);
    }
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  const navResult = await navigateAndWaitForLoad(tabId, account.address);
  if (!navResult.ok) return navResult;

  const prefs = await getPrefs();
  const timeoutMs = (prefs.findTimeoutSeconds ?? FIND_TIMEOUT_SECONDS_DEFAULT) * 1000;

  return askTab<void>(tabId, {
    type: MESSAGE_TYPES.ACCOUNT_LOGIN_FILL,
    payload: {
      username: account.username,
      password,
      usernameField: account.usernameField,
      passwordField: account.passwordField,
      loginButton: account.loginButton,
      timeoutMs,
    },
  });
}

/**
 * Change the PIN and re-encrypt every existing secret (every account's own
 * password, plus the shared default password if one is set) under the new
 * key. shared/crypto.ts's changePin computes everything before returning —
 * nothing is written until this function persists it, so a failure never
 * leaves mixed old-key/new-key ciphertext on disk.
 */
async function changeAccountsPin(currentPin: string, newPin: string): Promise<Result<void>> {
  const accounts = await getAccounts();
  const defaultRecord = await getDefaultPasswordRecord();

  const secretsToReencrypt: EncryptedSecret[] = [];
  for (const account of accounts) {
    if (account.encryptedPassword) secretsToReencrypt.push(account.encryptedPassword);
  }
  if (defaultRecord) secretsToReencrypt.push(defaultRecord.encryptedPassword);

  const result = await changePin(currentPin, newPin, secretsToReencrypt);
  if (!result.ok) return result;

  let cursor = 0;
  const updatedAccounts = accounts.map((account) => {
    if (!account.encryptedPassword) return account;
    const encryptedPassword = result.value.reencrypted[cursor];
    cursor += 1;
    return { ...account, encryptedPassword: encryptedPassword! };
  });
  await saveAccounts(updatedAccounts);

  if (defaultRecord) {
    const encryptedPassword = result.value.reencrypted[cursor]!;
    await setDefaultPasswordRecord({ encryptedPassword, updatedAt: Date.now() });
  }

  return { ok: true, value: undefined };
}

// ---------------------------------------------------------------------------
// Message hub
// ---------------------------------------------------------------------------

// The polyfill's OnMessageListener union type checks a listener against ONE
// of {always-true callback, async, no-response} — it has no way to express
// "true when responding asynchronously, otherwise undefined", which is the
// standard MV3 idiom and exactly what this listener does. Cast rather than
// force every early-exit path to a shape that doesn't match its behavior.
browser.runtime.onMessage.addListener(((message: unknown, _sender, sendResponse) => {
  // isRuntimeMessage only validates the `type` discriminant, not the payload
  // shape. A valid-type message with a missing/renamed payload throws
  // synchronously here (e.g. reading `message.payload.script`); catch it so the
  // caller gets an error instead of a hung `sendMessage`. Async branches guard
  // themselves via withActiveTab / the storage `.catch`.
  try {
    if (!isRuntimeMessage(message)) return undefined;

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

      case MESSAGE_TYPES.CLEAR_TASKS:
        saveTasks([])
          .then(() => sendResponse({ ok: true, value: [] }))
          .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
        return true;

      case MESSAGE_TYPES.RENAME_TAG:
        renameTagAcross(message.payload.from, message.payload.to)
          .then((value) => sendResponse({ ok: true, value }))
          .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
        return true;

      case MESSAGE_TYPES.DELETE_TAG:
        clearTagAcross(message.payload.tag)
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

      case MESSAGE_TYPES.SET_CHECKLISTS:
        saveChecklists(message.payload.checklists)
          .then(() => sendResponse({ ok: true, value: message.payload.checklists }))
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

      case MESSAGE_TYPES.SET_NOTES:
        saveNotes(message.payload.notes)
          .then(() => sendResponse({ ok: true, value: message.payload.notes }))
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

      case MESSAGE_TYPES.GET_QUERY_PARAM_SETS:
        getQueryParamSets()
          .then((value) => sendResponse({ ok: true, value }))
          .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
        return true;

      case MESSAGE_TYPES.SAVE_QUERY_PARAM_SET:
        upsertQueryParamSet(message.payload.set)
          .then((value) => sendResponse({ ok: true, value }))
          .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
        return true;

      case MESSAGE_TYPES.SET_QUERY_PARAM_SETS:
        saveQueryParamSets(message.payload.sets)
          .then(() => sendResponse({ ok: true, value: message.payload.sets }))
          .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
        return true;

      case MESSAGE_TYPES.DELETE_QUERY_PARAM_SET:
        deleteQueryParamSet(message.payload.id)
          .then((value) => sendResponse({ ok: true, value }))
          .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
        return true;

      case MESSAGE_TYPES.RUN_SCRIPT:
        withActiveRunnableTab((tabId) => runScriptInPage(tabId, message.payload.code)).then(
          sendResponse
        );
        return true;

      case MESSAGE_TYPES.STOP_SCRIPT:
        withActiveRunnableTab((tabId) => stopFlowInPage(tabId)).then(sendResponse);
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
      case MESSAGE_TYPES.HIGHLIGHT_MATCHES:
      case MESSAGE_TYPES.SCROLL_TO_MATCH:
      case MESSAGE_TYPES.RESOLVE_SELECTOR:
      case MESSAGE_TYPES.SCAN_TAB_ORDER:
      case MESSAGE_TYPES.GET_STOP_LOCATORS:
      case MESSAGE_TYPES.RUN_A11Y_SCAN:
        withActiveRunnableTab((tabId) => askTab(tabId, message)).then(sendResponse);
        return true;

      case MESSAGE_TYPES.BYPASS_PAGE:
        withActiveRunnableTab((tabId) => bypassPage(tabId, message)).then(sendResponse);
        return true;

      case MESSAGE_TYPES.RESTORE_PAGE:
        withActiveRunnableTab((tabId) => restorePage(tabId, message)).then(sendResponse);
        return true;

      case MESSAGE_TYPES.GET_BYPASS_STATE:
        withActiveRunnableTab((tabId) => bypassStateFor(tabId, message)).then(sendResponse);
        return true;

      case MESSAGE_TYPES.BYPASS_XRM:
        withActiveRunnableTab((tabId) => bypassXrm(tabId)).then(sendResponse);
        return true;

      case MESSAGE_TYPES.GET_XRM_WEB_API_URL:
        withActiveRunnableTab((tabId) => xrmWebApiUrl(tabId)).then(sendResponse);
        return true;

      case MESSAGE_TYPES.SHOW_LOGICAL_NAMES:
        withActiveRunnableTab((tabId) => showLogicalNames(tabId)).then(sendResponse);
        return true;

      case MESSAGE_TYPES.PROBE_SITE_STORAGE:
        withActiveRunnableTab((tabId) => probeSiteStorage(tabId)).then(sendResponse);
        return true;

      case MESSAGE_TYPES.CLEAR_SITE_DATA:
        withActiveTab((tab) =>
          clearSiteData(tab.id, tab.url, message.payload.types, message.payload.shouldReload)
        ).then(sendResponse);
        return true;

      case MESSAGE_TYPES.APPLY_REGION:
        withActiveRunnableTab((tabId) => applyRegion(tabId, message.payload.config)).then(
          sendResponse
        );
        return true;

      case MESSAGE_TYPES.RESTORE_REGION:
        withActiveRunnableTab((tabId) => restoreRegion(tabId)).then(sendResponse);
        return true;

      case MESSAGE_TYPES.GET_REGION_STATE:
        withActiveRunnableTab((tabId) => getRegionState(tabId)).then(sendResponse);
        return true;

      case MESSAGE_TYPES.READ_WEB_STORAGE:
        withActiveRunnableTab((tabId) => readWebStorage(tabId)).then(sendResponse);
        return true;

      case MESSAGE_TYPES.WRITE_WEB_STORAGE: {
        const { area, key, value } = message.payload;
        withActiveRunnableTab((tabId) =>
          mutateWebStorage(tabId, writeWebStorageInPage, [area, key, value])
        ).then(sendResponse);
        return true;
      }

      case MESSAGE_TYPES.REMOVE_WEB_STORAGE: {
        const { area, key } = message.payload;
        withActiveRunnableTab((tabId) =>
          mutateWebStorage(tabId, removeWebStorageInPage, [area, key])
        ).then(sendResponse);
        return true;
      }

      case MESSAGE_TYPES.CLEAR_WEB_STORAGE: {
        const { area } = message.payload;
        withActiveRunnableTab((tabId) =>
          mutateWebStorage(tabId, clearWebStorageInPage, [area])
        ).then(sendResponse);
        return true;
      }

      case MESSAGE_TYPES.LIST_COOKIES:
        withActiveTab((tab) => listCookies(tab.url)).then(sendResponse);
        return true;

      case MESSAGE_TYPES.SET_COOKIE:
        withActiveTab((tab) => setCookie(tab.url, message.payload.cookie)).then(sendResponse);
        return true;

      case MESSAGE_TYPES.REMOVE_COOKIE:
        withActiveTab((tab) =>
          removeCookie(tab.url, message.payload.name, message.payload.path)
        ).then(sendResponse);
        return true;

      case MESSAGE_TYPES.CLEAR_COOKIES:
        withActiveTab((tab) => clearCookies(tab.url)).then(sendResponse);
        return true;

      case MESSAGE_TYPES.GET_PROFILES:
        getProfiles()
          .then((value) => sendResponse({ ok: true, value }))
          .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
        return true;

      case MESSAGE_TYPES.SAVE_PROFILE:
        upsertProfileStored(message.payload.profile)
          .then((value) => sendResponse({ ok: true, value }))
          .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
        return true;

      case MESSAGE_TYPES.SET_PROFILES:
        saveProfiles(message.payload.profiles)
          .then(() => sendResponse({ ok: true, value: message.payload.profiles }))
          .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
        return true;

      case MESSAGE_TYPES.DELETE_PROFILE:
        deleteProfile(message.payload.id)
          .then((value) => sendResponse({ ok: true, value }))
          .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
        return true;

      case MESSAGE_TYPES.GET_ACCOUNTS:
        getAccounts()
          .then((value) => sendResponse({ ok: true, value }))
          .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
        return true;

      case MESSAGE_TYPES.SAVE_ACCOUNT:
        saveAccount(message.payload.account)
          .then(sendResponse)
          .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
        return true;

      case MESSAGE_TYPES.DELETE_ACCOUNT:
        deleteAccount(message.payload.id)
          .then((value) => sendResponse({ ok: true, value }))
          .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
        return true;

      case MESSAGE_TYPES.DUPLICATE_ACCOUNT:
        duplicateAccountInStore(message.payload.id)
          .then(sendResponse)
          .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
        return true;

      case MESSAGE_TYPES.GET_DEFAULT_PASSWORD_STATE:
        getDefaultPasswordRecord()
          .then((record) =>
            sendResponse({
              ok: true,
              value: { isSet: record !== undefined, updatedAt: record?.updatedAt ?? null },
            })
          )
          .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
        return true;

      case MESSAGE_TYPES.SAVE_DEFAULT_PASSWORD: {
        const password = message.payload.password.trim();
        if (password === '') {
          sendResponse({ ok: false, error: 'Enter a password.' });
          return true;
        }
        encryptSecret(password)
          .then((encryptedPassword) =>
            setDefaultPasswordRecord({ encryptedPassword, updatedAt: Date.now() })
          )
          .then(() => sendResponse({ ok: true, value: undefined }))
          .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
        return true;
      }

      case MESSAGE_TYPES.CLEAR_DEFAULT_PASSWORD:
        clearDefaultPasswordRecord()
          .then(() => sendResponse({ ok: true, value: undefined }))
          .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
        return true;

      case MESSAGE_TYPES.GET_ACCOUNTS_LOCK_STATE:
        getLockState()
          .then((value) => sendResponse({ ok: true, value }))
          .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
        return true;

      case MESSAGE_TYPES.SET_ACCOUNTS_PIN:
        if (!isValidPin(message.payload.pin)) {
          sendResponse({ ok: false, error: PIN_LENGTH_ERROR });
          return true;
        }
        setUpPin(message.payload.pin, message.payload.sessionMinutes)
          .then(() => sendResponse({ ok: true, value: undefined }))
          .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
        return true;

      case MESSAGE_TYPES.UNLOCK_ACCOUNTS:
        unlockWithPin(message.payload.pin)
          .then(sendResponse)
          .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
        return true;

      case MESSAGE_TYPES.CHANGE_ACCOUNTS_PIN:
        if (!isValidPin(message.payload.newPin)) {
          sendResponse({ ok: false, error: PIN_LENGTH_ERROR });
          return true;
        }
        changeAccountsPin(message.payload.currentPin, message.payload.newPin)
          .then(sendResponse)
          .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
        return true;

      case MESSAGE_TYPES.SET_ACCOUNTS_SESSION_MINUTES:
        setSessionMinutes(message.payload.minutes)
          .then(sendResponse)
          .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
        return true;

      case MESSAGE_TYPES.LOCK_ACCOUNTS:
        lockAccounts()
          .then(() => sendResponse({ ok: true, value: undefined }))
          .catch((err) => sendResponse({ ok: false, error: errorMessage(err) }));
        return true;

      case MESSAGE_TYPES.RUN_ACCOUNT_LOGIN:
        withAnyActiveTab((tabId) => runAccountLogin(tabId, message.payload.id)).then(sendResponse);
        return true;

      default:
        // ELEMENT_PICKED / PICK_CANCELLED / FIELD_PICKED / ACTION_RECORDED are
        // addressed to the side panel, which listens directly.
        return undefined;
    }
  } catch (err) {
    sendResponse({ ok: false, error: errorMessage(err) });
    return true;
  }
}) as Runtime.OnMessageListenerCallback);

// ---------------------------------------------------------------------------
// Side-panel lifecycle — tear down in-page modes when the panel closes
// ---------------------------------------------------------------------------

// Chrome does NOT run the panel's React effect cleanups when the panel is
// closed (the document is destroyed, not unmounted), so a Tool / pick / record
// mode left active would strand its listeners and a crosshair cursor on the
// page until the next navigation. The panel opens a long-lived port on mount;
// its onDisconnect is the one reliable "panel closed" signal. On disconnect we
// stop every arbiter mode on the tab the panel was last driving.
//
// The panel heartbeats over the port (< the 30s idle threshold) so the SW stays
// alive while the panel is open — meaning onDisconnect fires ONLY on a genuine
// close, never on an idle-SW recycle that would wrongly kill an active hover.
browser.runtime.onConnect.addListener((port) => {
  if (port.name !== 'panel') return;
  // Draining heartbeats is enough; their arrival is what keeps the SW awake.
  port.onMessage.addListener(() => {});
  port.onDisconnect.addListener(() => {
    if (drivenTabId === undefined) return;
    // STOP_TOOL_MODE { mode: 'all' } routes to enterMode('idle') in the picker,
    // which stops every tool mode, pick, match AND record, restores the cursor
    // and destroys the overlay. stopInTab is a no-op if no content script runs
    // there (blocked page, already navigated away).
    void stopInTab(drivenTabId, {
      type: MESSAGE_TYPES.STOP_TOOL_MODE,
      payload: { mode: 'all' },
    });
  });
});
