import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MESSAGE_TYPES, STORAGE_KEYS } from '@/shared/constants';
import type { SavedScript } from '@/shared/types';
import { chromeMock, store } from '../setup';
import '@/background/service-worker';

interface Response {
  ok: boolean;
  value?: unknown;
  error?: string;
}

/** Dispatch a runtime message and resolve with the handler's sendResponse value. */
function send(message: unknown): Promise<Response | undefined> {
  return new Promise((resolve) => {
    const results = chromeMock.runtime.onMessage.dispatch(message, {}, (resp: Response) =>
      resolve(resp)
    );
    if (!results.some((r) => r === true)) resolve(undefined);
  });
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function makeScript(overrides: Partial<SavedScript> = {}): SavedScript {
  return { id: 'scr_1', name: 'X', code: '1', createdAt: 1, updatedAt: 1, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  chromeMock.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com', active: true }]);
  chromeMock.scripting.executeScript.mockResolvedValue([{ result: { ok: true } }]);
});

describe('install', () => {
  it('enables the side panel and seeds no default scripts', async () => {
    chromeMock.runtime.onInstalled.dispatch();
    expect(chromeMock.sidePanel.setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: true,
    });
    await flush();
    expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
  });
});

describe('RUN_SCRIPT', () => {
  it('injects the runner into the page MAIN world', async () => {
    const res = await send({ type: MESSAGE_TYPES.RUN_SCRIPT, payload: { code: 'window.x=1' } });
    expect(res).toEqual({ ok: true, value: undefined });
    expect(chromeMock.scripting.executeScript).toHaveBeenCalledTimes(1);

    const [injection] = chromeMock.scripting.executeScript.mock.calls[0] as unknown as [
      { world: string; target: { tabId: number }; args: string[] },
    ];
    expect(injection.world).toBe('MAIN');
    expect(injection.target).toEqual({ tabId: 1 });
    expect(injection.args).toEqual(['window.x=1']);
  });

  it('surfaces an error thrown by the page script', async () => {
    chromeMock.scripting.executeScript.mockResolvedValueOnce([
      { result: { ok: false, error: 'boom' } },
    ]);
    const res = await send({ type: MESSAGE_TYPES.RUN_SCRIPT, payload: { code: 'throw 1' } });
    expect(res).toEqual({ ok: false, error: 'boom' });
  });

  it('refuses to run on a blocked page', async () => {
    chromeMock.tabs.query.mockResolvedValueOnce([
      { id: 2, url: 'chrome://extensions', active: true },
    ]);
    const res = await send({ type: MESSAGE_TYPES.RUN_SCRIPT, payload: { code: '1' } });
    expect(res?.ok).toBe(false);
    expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();
  });
});

describe('Bypass', () => {
  const OPTIONS = {
    shouldEnableInputs: true,
    shouldDropValidation: true,
    shouldUnlockOptions: true,
    shouldRevealHidden: false,
    shouldRevealPasswords: false,
    shouldCloseDialogs: false,
    shouldPierceShadowDom: false,
  };

  it('injects the override sheet before asking the page to unlock', async () => {
    chromeMock.tabs.sendMessage.mockResolvedValueOnce({ ok: true, value: { total: 3 } });
    const res = await send({
      type: MESSAGE_TYPES.BYPASS_PAGE,
      payload: { options: OPTIONS, shouldWatch: false },
    });
    expect(res).toEqual({ ok: true, value: { total: 3 } });
    expect(chromeMock.scripting.insertCSS).toHaveBeenCalledTimes(1);
  });

  it('removes the SAME css string it inserted — a mismatch silently no-ops', async () => {
    chromeMock.tabs.sendMessage.mockResolvedValue({ ok: true, value: { total: 0 } });
    await send({
      type: MESSAGE_TYPES.BYPASS_PAGE,
      payload: { options: OPTIONS, shouldWatch: false },
    });
    await send({ type: MESSAGE_TYPES.RESTORE_PAGE });

    const [inserted] = chromeMock.scripting.insertCSS.mock.calls[0] as unknown as [
      { css: string; origin: string; target: { tabId: number } },
    ];
    const [removed] = chromeMock.scripting.removeCSS.mock.calls[0] as unknown as [
      { css: string; origin: string; target: { tabId: number } },
    ];
    expect(removed.css).toBe(inserted.css);
    expect(removed.origin).toBe(inserted.origin);
    expect(removed.target).toEqual(inserted.target);
  });

  it('still reports success when removeCSS fails after a restore', async () => {
    chromeMock.tabs.sendMessage.mockResolvedValueOnce({ ok: true, value: { total: 4 } });
    chromeMock.scripting.removeCSS.mockRejectedValueOnce(new Error('tab navigated'));
    const res = await send({ type: MESSAGE_TYPES.RESTORE_PAGE });
    expect(res).toEqual({ ok: true, value: { total: 4 } });
  });

  it('runs the Dynamics unlock in the MAIN world as a function, never a code string', async () => {
    chromeMock.scripting.executeScript.mockResolvedValueOnce([
      { result: { ok: true, value: { attributes: 2, controls: 5, tabs: 1, sections: 3 } } },
    ]);
    const res = await send({ type: MESSAGE_TYPES.BYPASS_XRM });
    expect(res).toEqual({ ok: true, value: { attributes: 2, controls: 5, tabs: 1, sections: 3 } });

    const [injection] = chromeMock.scripting.executeScript.mock.calls[0] as unknown as [
      { world: string; func: unknown; args?: unknown[] },
    ];
    expect(injection.world).toBe('MAIN');
    // A function, not a string — this is why it does not widen the sanctioned
    // `new Function` exception in runUserScript.
    expect(typeof injection.func).toBe('function');
    expect(injection.args).toBeUndefined();
  });

  it('surfaces the page’s message when there is no Dynamics form', async () => {
    chromeMock.scripting.executeScript.mockResolvedValueOnce([
      { result: { ok: false, error: 'No Dynamics form here — window.Xrm is not present.' } },
    ]);
    const res = await send({ type: MESSAGE_TYPES.BYPASS_XRM });
    expect(res?.ok).toBe(false);
    expect(res?.error).toMatch(/window\.Xrm/);
  });

  it('merges the MAIN-world Xrm probe into the unlock state', async () => {
    chromeMock.tabs.sendMessage.mockResolvedValueOnce({
      ok: true,
      value: { isActive: true, isWatching: false, report: null },
    });
    chromeMock.scripting.executeScript.mockResolvedValueOnce([{ result: true }]);
    const res = await send({ type: MESSAGE_TYPES.GET_BYPASS_STATE });
    expect(res).toEqual({
      ok: true,
      value: { isActive: true, isWatching: false, report: null, hasXrm: true },
    });
  });

  it('reports hasXrm false when the probe cannot run', async () => {
    chromeMock.tabs.sendMessage.mockResolvedValueOnce({
      ok: true,
      value: { isActive: false, isWatching: false, report: null },
    });
    chromeMock.scripting.executeScript.mockRejectedValueOnce(new Error('blocked'));
    const res = await send({ type: MESSAGE_TYPES.GET_BYPASS_STATE });
    expect((res?.value as { hasXrm: boolean }).hasXrm).toBe(false);
  });

  it('refuses to unlock a blocked page', async () => {
    chromeMock.tabs.query.mockResolvedValueOnce([
      { id: 2, url: 'chrome://extensions', active: true },
    ]);
    const res = await send({
      type: MESSAGE_TYPES.BYPASS_PAGE,
      payload: { options: OPTIONS, shouldWatch: false },
    });
    expect(res?.ok).toBe(false);
    expect(chromeMock.scripting.insertCSS).not.toHaveBeenCalled();
  });
});

describe('Web API URL', () => {
  const RECORD = {
    entityLogicalName: 'account',
    entitySetName: 'accounts',
    recordId: '11111111-1111-1111-1111-111111111111',
    url: 'https://org.crm.dynamics.com/api/data/v9.2/accounts(11111111-1111-1111-1111-111111111111)',
  };

  it('resolves the record in the MAIN world as a function, never a code string', async () => {
    chromeMock.scripting.executeScript.mockResolvedValueOnce([
      { result: { ok: true, value: RECORD } },
    ]);
    const res = await send({ type: MESSAGE_TYPES.GET_XRM_WEB_API_URL });
    expect(res).toEqual({ ok: true, value: RECORD });

    const [injection] = chromeMock.scripting.executeScript.mock.calls[0] as unknown as [
      { world: string; func: unknown; args?: unknown[] },
    ];
    expect(injection.world).toBe('MAIN');
    // A function, not a string — this is why it does not widen the sanctioned
    // `new Function` exception in runUserScript.
    expect(typeof injection.func).toBe('function');
    expect(injection.args).toBeUndefined();
  });

  it('surfaces the page’s message when there is no Dynamics form', async () => {
    chromeMock.scripting.executeScript.mockResolvedValueOnce([
      { result: { ok: false, error: 'No Dynamics form here — window.Xrm is not present.' } },
    ]);
    const res = await send({ type: MESSAGE_TYPES.GET_XRM_WEB_API_URL });
    expect(res?.ok).toBe(false);
    expect(res?.error).toMatch(/window\.Xrm/);
  });

  it('surfaces the page’s message when the record is unsaved', async () => {
    chromeMock.scripting.executeScript.mockResolvedValueOnce([
      {
        result: {
          ok: false,
          error: 'This record has not been saved yet — it has no id to open in the Web API.',
        },
      },
    ]);
    const res = await send({ type: MESSAGE_TYPES.GET_XRM_WEB_API_URL });
    expect(res?.ok).toBe(false);
    expect(res?.error).toMatch(/not been saved/);
  });

  it('refuses to resolve on a blocked page', async () => {
    chromeMock.tabs.query.mockResolvedValueOnce([
      { id: 2, url: 'chrome://extensions', active: true },
    ]);
    const res = await send({ type: MESSAGE_TYPES.GET_XRM_WEB_API_URL });
    expect(res?.ok).toBe(false);
    expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();
  });
});

describe('Site data', () => {
  const PROBE = {
    origin: 'https://example.com',
    isSecureContext: true,
    usage: 5000,
    quota: 100000,
    details: [],
    localStorageBytes: 100,
    sessionStorageBytes: 0,
    cookieCount: 2,
    cacheCount: 1,
    serviceWorkerCount: 1,
    indexedDbCount: 0,
    warnings: [],
  };

  it('probes storage in the ISOLATED world — no `world` key', async () => {
    // The probe MUST stay ISOLATED: a content script's localStorage/caches are
    // the page origin's, which is what we mean to measure. MAIN would also work
    // but needlessly enters the page's own realm.
    chromeMock.scripting.executeScript.mockResolvedValueOnce([{ result: PROBE }]);
    const res = await send({ type: MESSAGE_TYPES.PROBE_SITE_STORAGE });
    expect(res).toEqual({ ok: true, value: PROBE });

    const [injection] = chromeMock.scripting.executeScript.mock.calls[0] as unknown as [
      Record<string, unknown>,
    ];
    expect('world' in injection).toBe(false);
    expect(typeof injection.func).toBe('function');
  });

  it('clears only validated types, passed as args to an ISOLATED injection', async () => {
    chromeMock.scripting.executeScript.mockResolvedValueOnce([
      { result: { cleared: ['localStorage'], skipped: [] } },
    ]);

    const res = await send({
      type: MESSAGE_TYPES.CLEAR_SITE_DATA,
      payload: { types: ['localStorage'], shouldReload: false },
    });
    expect(res?.ok).toBe(true);
    expect((res?.value as { cleared: string[] }).cleared).toEqual(['localStorage']);

    // The clear is the ONLY injection — no before/after storage probe, because
    // navigator.storage.estimate cannot support an honest "bytes freed" number.
    expect(chromeMock.scripting.executeScript).toHaveBeenCalledTimes(1);
    const [clearCall] = chromeMock.scripting.executeScript.mock.calls[0] as unknown as [
      Record<string, unknown>,
    ];
    expect('world' in clearCall).toBe(false);
    expect(clearCall.args).toEqual([['localStorage']]);
  });

  it('refuses an unknown type before it can reach the page', async () => {
    const res = await send({
      type: MESSAGE_TYPES.CLEAR_SITE_DATA,
      payload: { types: ['passwords'], shouldReload: false },
    });
    expect(res?.ok).toBe(false);
    expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();
  });

  it('refuses an empty selection', async () => {
    const res = await send({
      type: MESSAGE_TYPES.CLEAR_SITE_DATA,
      payload: { types: [], shouldReload: false },
    });
    expect(res?.ok).toBe(false);
    expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();
  });

  it('hard-reloads with bypassCache only when asked', async () => {
    chromeMock.scripting.executeScript.mockResolvedValue([
      { result: { cleared: ['cacheStorage'], skipped: [] } },
    ]);
    await send({
      type: MESSAGE_TYPES.CLEAR_SITE_DATA,
      payload: { types: ['cacheStorage'], shouldReload: true },
    });
    expect(chromeMock.tabs.reload).toHaveBeenCalledWith(1, { bypassCache: true });

    chromeMock.tabs.reload.mockClear();
    await send({
      type: MESSAGE_TYPES.CLEAR_SITE_DATA,
      payload: { types: ['cacheStorage'], shouldReload: false },
    });
    expect(chromeMock.tabs.reload).not.toHaveBeenCalled();
  });

  it('reports the types the page could not clear', async () => {
    chromeMock.scripting.executeScript.mockResolvedValueOnce([
      {
        result: {
          cleared: ['localStorage'],
          skipped: [{ type: 'indexedDB', reason: 'This browser cannot list databases.' }],
        },
      },
    ]);
    const res = await send({
      type: MESSAGE_TYPES.CLEAR_SITE_DATA,
      payload: { types: ['localStorage', 'indexedDB'], shouldReload: false },
    });
    expect(res?.ok).toBe(true);
    expect((res?.value as { skipped: { type: string }[] }).skipped).toEqual([
      { type: 'indexedDB', reason: 'This browser cannot list databases.' },
    ]);
  });

  it('refuses to clear on a blocked page', async () => {
    chromeMock.tabs.query.mockResolvedValueOnce([
      { id: 2, url: 'chrome://extensions', active: true },
    ]);
    const res = await send({
      type: MESSAGE_TYPES.CLEAR_SITE_DATA,
      payload: { types: ['localStorage'], shouldReload: false },
    });
    expect(res?.ok).toBe(false);
    expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();
  });
});

describe('picking + scripts CRUD', () => {
  it('relays START_PICK to the active tab content script', async () => {
    const res = await send({ type: MESSAGE_TYPES.START_PICK });
    expect(res).toEqual({ ok: true, value: undefined });
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(1, {
      type: MESSAGE_TYPES.START_PICK,
    });
  });

  it('relays START_PICK_FIELDS to the active tab content script', async () => {
    const res = await send({ type: MESSAGE_TYPES.START_PICK_FIELDS });
    expect(res).toEqual({ ok: true, value: undefined });
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(1, {
      type: MESSAGE_TYPES.START_PICK_FIELDS,
    });
  });

  it('returns stored scripts for GET_SCRIPTS', async () => {
    store[STORAGE_KEYS.SCRIPTS] = [makeScript(), makeScript({ id: 'scr_2' })];
    const res = await send({ type: MESSAGE_TYPES.GET_SCRIPTS });
    expect(res?.ok).toBe(true);
    expect((res?.value as SavedScript[]).map((s) => s.id)).toEqual(['scr_1', 'scr_2']);
  });

  it('relays START_TOOL_MODE with its payload intact', async () => {
    const res = await send({
      type: MESSAGE_TYPES.START_TOOL_MODE,
      payload: { mode: 'measure' },
    });
    expect(res).toEqual({ ok: true, value: undefined });
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(1, {
      type: MESSAGE_TYPES.START_TOOL_MODE,
      payload: { mode: 'measure' },
    });
  });

  it('returns the content script’s answer for TOOL_PING instead of discarding it', async () => {
    chromeMock.tabs.sendMessage.mockResolvedValueOnce({ ok: true, value: { ready: true } });
    const res = await send({ type: MESSAGE_TYPES.TOOL_PING });
    expect(res).toEqual({ ok: true, value: { ready: true } });
  });

  it('reports an unreachable page for TOOL_PING once injection also fails', async () => {
    chromeMock.tabs.sendMessage.mockRejectedValue(new Error('no receiver'));
    chromeMock.scripting.executeScript.mockRejectedValueOnce(new Error('cannot inject'));
    const res = await send({ type: MESSAGE_TYPES.TOOL_PING });
    expect(res?.ok).toBe(false);
    expect(res?.error).toMatch(/Could not reach the page/);
  });

  it('never fails STOP_TOOL_MODE, even with no content script present', async () => {
    chromeMock.tabs.sendMessage.mockRejectedValueOnce(new Error('no receiver'));
    const res = await send({ type: MESSAGE_TYPES.STOP_TOOL_MODE, payload: { mode: 'all' } });
    expect(res).toEqual({ ok: true, value: undefined });
  });

  it.each([
    ['chrome://extensions'],
    ['file:///Users/me/page.html'],
    ['view-source:https://example.com'],
    ['https://chromewebstore.google.com/detail/x'],
  ])('refuses to reach a blocked page: %s', async (url) => {
    chromeMock.tabs.query.mockResolvedValueOnce([{ id: 2, url, active: true }]);
    const res = await send({ type: MESSAGE_TYPES.TOOL_PING });
    expect(res?.ok).toBe(false);
    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('passes the content script’s Result straight through, never double-wrapped', async () => {
    // A double wrap would report a page-side failure to the panel as a success.
    chromeMock.tabs.sendMessage.mockResolvedValueOnce({ ok: false, error: 'page said no' });
    const res = await send({ type: MESSAGE_TYPES.HIGHLIGHT_ELEMENT, payload: { selector: 'a' } });
    expect(res).toEqual({ ok: false, error: 'page said no' });
  });

  it('counts matches for TEST_LOCATOR', async () => {
    chromeMock.scripting.executeScript.mockResolvedValueOnce([{ result: { ok: true, count: 3 } }]);
    const res = await send({
      type: MESSAGE_TYPES.TEST_LOCATOR,
      payload: { query: 'mat-label', kind: 'css' },
    });
    expect(res).toEqual({ ok: true, value: { count: 3 } });

    const [injection] = chromeMock.scripting.executeScript.mock.calls[0] as unknown as [
      { args: unknown[] },
    ];
    expect(injection.args).toEqual(['mat-label', 'css']);
  });
});

describe('never hangs the caller', () => {
  it('answers with an error for a valid-type message with a missing payload (sync branch)', async () => {
    // isRuntimeMessage passes on `type` alone; reading message.payload.script
    // throws synchronously. The hub must catch it and respond, not hang.
    const res = await send({ type: MESSAGE_TYPES.SAVE_SCRIPT });
    expect(res?.ok).toBe(false);
    expect(typeof res?.error).toBe('string');
  });

  it('answers with an error for a missing payload on a tab-directed branch (async branch)', async () => {
    // message.payload.code is read lazily inside the withActiveTab callback, so
    // the throw is async — withActiveTab must turn it into a Result, not reject.
    const res = await send({ type: MESSAGE_TYPES.RUN_SCRIPT });
    expect(res?.ok).toBe(false);
    expect(typeof res?.error).toBe('string');
  });

  it('answers with an error when chrome.tabs.query rejects', async () => {
    chromeMock.tabs.query.mockRejectedValueOnce(new Error('No current window'));
    const res = await send({ type: MESSAGE_TYPES.RUN_SCRIPT, payload: { code: '1' } });
    expect(res?.ok).toBe(false);
    expect(chromeMock.scripting.executeScript).not.toHaveBeenCalled();
  });
});

describe('panel lifecycle teardown', () => {
  /** A minimal chrome.runtime.Port with a dispatchable onDisconnect. */
  function makePort(name: string) {
    const disc = new Set<() => void>();
    return {
      name,
      onMessage: { addListener: () => undefined },
      onDisconnect: {
        addListener: (fn: () => void) => disc.add(fn),
        dispatch: () => disc.forEach((fn) => fn()),
      },
    };
  }

  it('stops every in-page mode on the driven tab when the panel port disconnects', async () => {
    // A panel→page command records the driven tab (id 1 from the default mock).
    await send({ type: MESSAGE_TYPES.RUN_SCRIPT, payload: { code: '1' } });
    const port = makePort('panel');
    chromeMock.runtime.onConnect.dispatch(port);
    port.onDisconnect.dispatch();
    await flush();

    const calls = chromeMock.tabs.sendMessage.mock.calls as unknown as [
      number,
      { type?: string; payload?: unknown },
    ][];
    const stop = calls.find(([, m]) => m?.type === MESSAGE_TYPES.STOP_TOOL_MODE);
    expect(stop).toBeDefined();
    expect(stop![0]).toBe(1);
    expect(stop![1].payload).toEqual({ mode: 'all' });
  });

  it('ignores ports that are not the panel', async () => {
    await send({ type: MESSAGE_TYPES.RUN_SCRIPT, payload: { code: '1' } });
    chromeMock.tabs.sendMessage.mockClear();
    const port = makePort('something-else');
    chromeMock.runtime.onConnect.dispatch(port);
    port.onDisconnect.dispatch();
    await flush();
    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalled();
  });
});
