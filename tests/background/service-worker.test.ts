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

describe('picking + scripts CRUD', () => {
  it('relays START_PICK to the active tab content script', async () => {
    const res = await send({ type: MESSAGE_TYPES.START_PICK });
    expect(res).toEqual({ ok: true, value: undefined });
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(1, {
      type: MESSAGE_TYPES.START_PICK,
    });
  });

  it('returns stored scripts for GET_SCRIPTS', async () => {
    store[STORAGE_KEYS.SCRIPTS] = [makeScript(), makeScript({ id: 'scr_2' })];
    const res = await send({ type: MESSAGE_TYPES.GET_SCRIPTS });
    expect(res?.ok).toBe(true);
    expect((res?.value as SavedScript[]).map((s) => s.id)).toEqual(['scr_1', 'scr_2']);
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
