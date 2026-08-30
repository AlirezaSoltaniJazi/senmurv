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

/** In-memory chrome.storage.session backing store — deliberately separate
 *  from `store`: session storage is a distinct area from local storage. */
const sessionStore: Record<string, unknown> = {};

/** Builds a storage.local-shaped mock area over whichever backing object is given. */
function makeStorageArea(backing: Record<string, unknown>) {
  return {
    get: vi.fn(async (key?: string | string[] | null) => {
      if (key === undefined || key === null) return { ...backing };
      if (typeof key === 'string') return { [key]: backing[key] };
      const out: Record<string, unknown> = {};
      for (const k of key) out[k] = backing[k];
      return out;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(backing, items);
    }),
    remove: vi.fn(async (key: string) => {
      delete backing[key];
    }),
    clear: vi.fn(async () => {
      for (const k of Object.keys(backing)) delete backing[k];
    }),
  };
}

const chromeMock = {
  runtime: {
    onMessage: makeEvent(),
    onInstalled: makeEvent(),
    onStartup: makeEvent(),
    onConnect: makeEvent(),
    sendMessage: vi.fn(),
    getURL: (path: string): string => `chrome-extension://test/${path}`,
    getManifest: () => ({ content_scripts: [{ js: ['assets/picker.js'] }] }),
    lastError: undefined as chrome.runtime.LastError | undefined,
    id: 'test-extension',
  },
  storage: {
    local: makeStorageArea(store),
    // Memory-only in a real browser (cleared on browser close); here it's
    // just a second in-memory object, distinct from `store`, so tests can
    // tell the two areas apart.
    session: makeStorageArea(sessionStore),
  },
  tabs: {
    query: vi.fn(async () => [{ id: 1, url: 'https://example.com', active: true }]),
    // Typed as unknown, not undefined, so a test can mockResolvedValueOnce the
    // reply a content script would send back through askTab.
    sendMessage: vi.fn(async (): Promise<unknown> => undefined),
    reload: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    onUpdated: makeEvent(),
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
  // Firefox-only fallback path in enableSidePanelOnActionClick — chromeMock
  // always has `sidePanel`, so this stays unexercised by default; a test
  // deletes `sidePanel` off a clone to reach it.
  action: {
    onClicked: makeEvent(),
  },
  sidebarAction: {
    toggle: vi.fn(async () => undefined),
    open: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  },
};

vi.stubGlobal('chrome', chromeMock);

// src/shared/browser-api.ts imports the real webextension-polyfill, which
// throws synchronously unless it detects a live extension `chrome.runtime.id`
// AND wraps every method assuming Chrome's callback-based signatures — our
// mock's methods are already promise-returning, so the real polyfill would
// wait forever on a callback that's never invoked. Mocking the module itself
// routes `browser.*` straight to chromeMock, matching how `chrome.*` worked
// before the cross-browser rename.
vi.mock('webextension-polyfill', () => ({ default: chromeMock }));

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  for (const k of Object.keys(sessionStore)) delete sessionStore[k];
});

export { chromeMock, store, sessionStore };
