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

describe('Unlock (God Mode)', () => {
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
      type: MESSAGE_TYPES.UNLOCK_PAGE,
      payload: { options: OPTIONS, shouldWatch: false },
    });
    expect(res).toEqual({ ok: true, value: { total: 3 } });
    expect(chromeMock.scripting.insertCSS).toHaveBeenCalledTimes(1);
  });

  it('removes the SAME css string it inserted — a mismatch silently no-ops', async () => {
    chromeMock.tabs.sendMessage.mockResolvedValue({ ok: true, value: { total: 0 } });
    await send({
      type: MESSAGE_TYPES.UNLOCK_PAGE,
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
    const res = await send({ type: MESSAGE_TYPES.UNLOCK_XRM });
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
    const res = await send({ type: MESSAGE_TYPES.UNLOCK_XRM });
    expect(res?.ok).toBe(false);
    expect(res?.error).toMatch(/window\.Xrm/);
  });

  it('merges the MAIN-world Xrm probe into the unlock state', async () => {
    chromeMock.tabs.sendMessage.mockResolvedValueOnce({
      ok: true,
      value: { isUnlocked: true, isWatching: false, report: null },
    });
    chromeMock.scripting.executeScript.mockResolvedValueOnce([{ result: true }]);
    const res = await send({ type: MESSAGE_TYPES.GET_UNLOCK_STATE });
    expect(res).toEqual({
      ok: true,
      value: { isUnlocked: true, isWatching: false, report: null, hasXrm: true },
    });
  });

  it('reports hasXrm false when the probe cannot run', async () => {
    chromeMock.tabs.sendMessage.mockResolvedValueOnce({
      ok: true,
      value: { isUnlocked: false, isWatching: false, report: null },
    });
    chromeMock.scripting.executeScript.mockRejectedValueOnce(new Error('blocked'));
    const res = await send({ type: MESSAGE_TYPES.GET_UNLOCK_STATE });
    expect((res?.value as { hasXrm: boolean }).hasXrm).toBe(false);
  });

  it('refuses to unlock a blocked page', async () => {
    chromeMock.tabs.query.mockResolvedValueOnce([
      { id: 2, url: 'chrome://extensions', active: true },
    ]);
    const res = await send({
      type: MESSAGE_TYPES.UNLOCK_PAGE,
      payload: { options: OPTIONS, shouldWatch: false },
    });
    expect(res?.ok).toBe(false);
    expect(chromeMock.scripting.insertCSS).not.toHaveBeenCalled();
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
