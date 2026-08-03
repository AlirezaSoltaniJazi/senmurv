# Test Patterns — senmurv

> Vitest setup, Chrome API mocking, DOM testing, and E2E patterns.
>
> **Primary unit targets**: the PURE modules `src/shared/locators.ts` (locator
> generation + ranking + framework snippets) and `src/shared/faker-data.ts`
> (`generateTestData(locale)`) — neither needs chrome mocks.

---

## Test Setup

```typescript
// tests/setup.ts (the real file — trimmed of comments for space)

import { beforeEach, vi } from 'vitest';

type Listener = (...args: unknown[]) => unknown;

// A minimal capturing chrome event mock with a `dispatch` test helper — this is
// what makes it possible to drive the service worker's onMessage/onInstalled
// listeners from a test (see "Testing Message Handlers" below).
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

// In-memory chrome.storage.local backing store.
const store: Record<string, unknown> = {};

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
    sendMessage: vi.fn(async (): Promise<unknown> => undefined),
    reload: vi.fn(async () => undefined),
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
```

> `chrome.cookies` is NOT mocked here — no unit test currently drives the Cookies tab's
> service-worker handlers. Add a `cookies: { getAll, set, remove }` mock (`vi.fn()`) to
> `chromeMock` first if you write one.

---

## Vitest Configuration

```typescript
// vitest.config.ts

import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/**/*.html'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
```

---

## Unit Test Examples

### Testing Storage Helpers

```typescript
// tests/shared/storage.test.ts

import { describe, it, expect } from 'vitest';
import { getScripts, saveScripts } from '@/shared/storage';
import { STORAGE_KEYS } from '@/shared/constants';

describe('storage helpers', () => {
  describe('getScripts', () => {
    it('returns empty array when no scripts stored', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      const scripts = await getScripts();

      expect(scripts).toEqual([]);
      expect(chrome.storage.local.get).toHaveBeenCalledWith(STORAGE_KEYS.SCRIPTS);
    });

    it('returns stored scripts', async () => {
      const stored = [{ id: 'scr_1', name: 'log title', code: 'console.log(document.title)' }];
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.SCRIPTS]: stored,
      });

      const scripts = await getScripts();

      expect(scripts).toEqual(stored);
    });
  });

  describe('saveScripts', () => {
    it('persists scripts to storage', async () => {
      const scripts = [{ id: 'scr_1', name: 'noop', code: '' }];

      await saveScripts(scripts);

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        [STORAGE_KEYS.SCRIPTS]: scripts,
      });
    });
  });
});
```

### Testing Message Handlers

The service worker has no separately-exported `handleMessage` function — the whole
hub is one `chrome.runtime.onMessage.addListener(...)` registered as a side effect of
importing the module. The real pattern (see `tests/background/service-worker.test.ts`)
imports the module for that side effect, then dispatches through the `tests/setup.ts`
mock's capturing `onMessage.addListener`/`dispatch` helper:

```typescript
// tests/background/service-worker.test.ts

import { describe, it, expect } from 'vitest';
import { MESSAGE_TYPES } from '@/shared/constants';
import { chromeMock } from '../setup';
import '@/background/service-worker'; // registers the onMessage listener as a side effect

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

describe('SAVE_SCRIPT', () => {
  it('upserts and returns the new list', async () => {
    const script = { id: 'scr_1', name: 'log title', code: 'console.log(document.title)' };

    const result = await send({ type: MESSAGE_TYPES.SAVE_SCRIPT, payload: { script } });

    expect(result?.ok).toBe(true);
    expect(result?.value).toContainEqual(expect.objectContaining({ name: 'log title' }));
  });

  it('ignores an unknown message type (no listener responds)', async () => {
    const result = await send({ type: 'UNKNOWN_TYPE' });

    expect(result).toBeUndefined();
  });
});
```

### Testing Pure Locator Generation (primary target)

```typescript
// tests/shared/locators.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { buildLocatorSet } from '@/shared/locators';

describe('buildLocatorSet', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('prefers data-testid over id and CSS', () => {
    document.body.innerHTML = `<button id="b1" data-testid="submit">Go</button>`;
    const el = document.querySelector('button')!;

    const set = buildLocatorSet(el);

    // LOCATOR_PRIORITY: testId > formControl > id > attr > ariaLabel > roleName > css > xpath
    expect(set.suggestions[0]).toMatchObject({
      strategy: 'testId',
      label: 'data-testid',
      value: 'submit',
    });
  });

  it('emits per-framework snippets (snippets is an array of {framework, label, code})', () => {
    document.body.innerHTML = `<input data-testid="email" />`;
    const el = document.querySelector('input')!;

    const set = buildLocatorSet(el);
    const frameworks = set.suggestions[0]?.snippets.map((s) => s.framework);

    expect(frameworks).toContain('playwright');
    expect(frameworks).toContain('wdio');
  });
});
```

### Testing Faker Data Generation (primary target)

```typescript
// tests/shared/faker-data.test.ts

import { describe, it, expect } from 'vitest';
import { generateTestData } from '@/shared/faker-data';

describe('generateTestData', () => {
  it('returns a full record for the default locale', () => {
    const data = generateTestData('en_GB');

    expect(data.firstName).toBeTruthy();
    expect(data.lastName).toBeTruthy();
    expect(data.phone).toBeTruthy();
    expect(data.postalCode).toBeTruthy();
    expect(data.email).toContain('@');
  });

  it('is deterministic-shaped across supported locales', () => {
    const us = generateTestData('en_US');
    expect(Object.keys(us)).toEqual(Object.keys(generateTestData('de')));
  });
});
```

---

## Picker DOM Testing

The overlay lives in `src/content/overlay.ts` (not `picker.ts`) and has no
`showOverlay`/`removeOverlay` pair — `drawBoxes` lazily mounts the host on first
draw, and `destroyOverlay` tears it down. The host uses an **open** shadow root
(`mode: 'open'`), so `.shadowRoot` is reachable directly from the test:

```typescript
// tests/content/overlay.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { destroyOverlay, drawBoxes } from '@/content/overlay';

describe('picker overlay', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    destroyOverlay(); // drop any host a previous test left mounted
  });

  it('injects the overlay host in (open) shadow DOM on first draw', () => {
    drawBoxes([{ left: 0, top: 0, width: 10, height: 10 }]);

    const host = document.querySelector('senmurv-picker-overlay');
    expect(host).not.toBeNull();
    expect(host?.shadowRoot).not.toBeNull();
  });

  it('removes the overlay cleanly', () => {
    drawBoxes([{ left: 0, top: 0, width: 10, height: 10 }]);
    destroyOverlay();

    const host = document.querySelector('senmurv-picker-overlay');
    expect(host).toBeNull();
  });
});
```

---

## E2E Testing with Playwright

senmurv's actual E2E harness is **Python** Playwright (not a Node/Vitest
`tests/e2e/` suite — there isn't one). See the `runInChrome` skill for the full
recipe (loading `dist/` unpacked, resolving the service-worker's extension id,
driving the panel as a background tab). Sketch of the same check in that
harness:

```python
# via the runInChrome skill — see its assets/verify-example.py
ctx = p.chromium.launch_persistent_context(
    tempfile.mkdtemp(), headless=False,
    args=[f"--disable-extensions-except={DIST}", f"--load-extension={DIST}", "--no-first-run"])

sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker", timeout=15000)
ext_id = sw.url.split("/")[2]

panel = ctx.new_page()
panel.goto(f"chrome-extension://{ext_id}/src/sidepanel/index.html")

# Tab routing renders plain-text buttons, not data-testid — assert by role/name
for name in ("Data", "Locator", "Recorder", "Scripts", "Tools"):
    assert panel.get_by_role("button", name=name).is_visible()

ctx.close()
```

---

## Test Rules

1. **Mock all chrome.\* APIs** — never call real Chrome APIs in unit tests (sidePanel, scripting, storage.local, tabs, runtime)
2. **Reset mocks between tests** — use `beforeEach(() => vi.clearAllMocks())`
3. **Prioritize pure modules** — `shared/locators.ts` and `shared/faker-data.ts` are the highest-value unit targets (no chrome mocks needed)
4. **Test message schemas** — verify type discriminants and payload shapes
5. **Test error paths** — simulate `chrome.runtime.lastError`, missing tab, quota exceeded
6. **Use `happy-dom`** for picker / locator DOM tests — lighter than `jsdom`
7. **E2E for integration** — use Playwright with `--load-extension` for full flows
