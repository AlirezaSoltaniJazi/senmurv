import { BLOCKED_URL_PREFIXES, BYPASS_CSS, MESSAGE_TYPES } from '@/shared/constants';
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
  saveTasks,
  savePrefs,
  upsertChecklist,
  upsertNote,
  upsertScript,
  upsertTask,
} from '@/shared/storage';
import { clearTagInEntries, renameTagInEntries } from '@/shared/tasks';
import { buildClearPlan } from '@/shared/tools/site-data';
import type {
  ClearOutcome,
  ClearTypeId,
  BypassReport,
  BypassState,
  LocatorKind,
  PageBypassState,
  RegionConfig,
  Result,
  StorageProbe,
  TimeEntry,
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

// The tab the side panel is currently driving — the last runnable tab any
// panel→page command resolved through withActiveTab. Used to tear down in-page
// modes on that tab when the panel closes (see the onConnect handler below).
let drivenTabId: number | undefined;

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab;
  } catch {
    // chrome.tabs.query can reject during window teardown / no-window states.
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

/**
 * Ask a running Flow to abort by raising the cross-realm stop flag its interpreter
 * polls (`window.__senmurvFlowStop`). Injected as a real `func` (never a code
 * string) into the MAIN world — the same shape as the Region/Xrm shims, so it does
 * NOT widen the sanctioned `new Function` runner. A no-op when no flow is running.
 */
async function stopFlowInPage(tabId: number): Promise<Result<void>> {
  try {
    await chrome.scripting.executeScript({
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
  const next = renameTagInEntries(await getTasks(), from, to);
  await saveTasks(next);
  return next;
}

/** Un-tag every entry carrying `tag` (entries kept); returns the new list. */
async function clearTagAcross(tag: string): Promise<TimeEntry[]> {
  const next = clearTagInEntries(await getTasks(), tag);
  await saveTasks(next);
  return next;
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
    await chrome.scripting.insertCSS({ target: { tabId }, ...BYPASS_SHEET });
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
  return askTab<BypassReport>(tabId, message);
}

async function restorePage(tabId: number, message: RuntimeMessage): Promise<Result<BypassReport>> {
  const result = await askTab<BypassReport>(tabId, message);
  try {
    await chrome.scripting.removeCSS({ target: { tabId }, ...BYPASS_SHEET });
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
    const results = await chrome.scripting.executeScript({
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
    const results = await chrome.scripting.executeScript({
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
    const results = await chrome.scripting.executeScript({
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
      await chrome.tabs.reload(tabId, { bypassCache: true });
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
    const results = await chrome.scripting.executeScript({
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
    await chrome.scripting.executeScript({
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
    const results = await chrome.scripting.executeScript({
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
// Message hub
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  // isRuntimeMessage only validates the `type` discriminant, not the payload
  // shape. A valid-type message with a missing/renamed payload throws
  // synchronously here (e.g. reading `message.payload.script`); catch it so the
  // caller gets an error instead of a hung `sendMessage`. Async branches guard
  // themselves via withActiveTab / the storage `.catch`.
  try {
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

      default:
        // ELEMENT_PICKED / PICK_CANCELLED / FIELD_PICKED / ACTION_RECORDED are
        // addressed to the side panel, which listens directly.
        return false;
    }
  } catch (err) {
    sendResponse({ ok: false, error: errorMessage(err) });
    return true;
  }
});

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
chrome.runtime.onConnect.addListener((port) => {
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
