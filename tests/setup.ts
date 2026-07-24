import { beforeEach, vi } from 'vitest';

type Listener = (...args: unknown[]) => unknown;

/** A minimal capturing chrome event mock with a `dispatch` test helper. */
function makeEvent() {
  const listeners = new Set<Listener>();
  return {
    addListener: vi.fn((fn: Listener) => listeners.add(fn)),
    removeListener: vi.fn((fn: Listener) => listeners.delete(fn)),
    hasListener: vi.fn((fn: Listener) => listeners.has(fn)),
    dispatch: (...args: unknown[]): unknown[] => Array.from(listeners).map((fn) => fn(...args)),
    clearListeners: (): void => listeners.clear(),
  };
}

/** In-memory chrome.storage.local backing store. */
const store: Record<string, unknown> = {};

const chromeMock = {
  runtime: {
    onMessage: makeEvent(),
    onInstalled: makeEvent(),
    onStartup: makeEvent(),
    sendMessage: vi.fn(),
    getURL: (path: string): string => `chrome-extension://test/${path}`,
    getManifest: () => ({ content_scripts: [{ js: ['assets/picker.js'] }] }),
    lastError: undefined as chrome.runtime.LastError | undefined,
    id: 'test-extension',
  },
  storage: {
    local: {
      get: vi.fn(async (key?: string | string[] | null) => {
        if (key === undefined || key === null) return { ...store };
        if (typeof key === 'string') return { [key]: store[key] };
        const out: Record<string, unknown> = {};
        for (const k of key) out[k] = store[k];
        return out;
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(store, items);
      }),
      remove: vi.fn(async (key: string) => {
        delete store[key];
      }),
      clear: vi.fn(async () => {
        for (const k of Object.keys(store)) delete store[k];
      }),
    },
  },
  tabs: {
    query: vi.fn(async () => [{ id: 1, url: 'https://example.com', active: true }]),
    // Typed as unknown, not undefined, so a test can mockResolvedValueOnce the
    // reply a content script would send back through askTab.
    sendMessage: vi.fn(async (): Promise<unknown> => undefined),
  },
  sidePanel: {
    setPanelBehavior: vi.fn(async () => undefined),
    setOptions: vi.fn(async () => undefined),
  },
  scripting: {
    executeScript: vi.fn(async (): Promise<{ result?: unknown }[]> => [{ result: { ok: true } }]),
    insertCSS: vi.fn(async () => undefined),
    removeCSS: vi.fn(async () => undefined),
  },
};

vi.stubGlobal('chrome', chromeMock);

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
});

export { chromeMock, store };
