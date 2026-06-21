# Test Patterns — senmurv

> Vitest setup, Chrome API mocking, DOM testing, and E2E patterns.
>
> **Primary unit targets**: the PURE modules `src/shared/locators.ts` (locator
> generation + ranking + framework snippets) and `src/shared/faker-data.ts`
> (`generateTestData(locale)`) — neither needs chrome mocks.

---

## Test Setup

```typescript
// tests/setup.ts

import { vi } from 'vitest';

// Mock chrome.* APIs globally
const chromeMock = {
  runtime: {
    id: 'test-extension-id',
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(),
    },
    onInstalled: {
      addListener: vi.fn(),
    },
    onStartup: {
      addListener: vi.fn(),
    },
    lastError: null as chrome.runtime.LastError | null,
    getURL: vi.fn((path: string) => `chrome-extension://test-id/${path}`),
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      getBytesInUse: vi.fn().mockResolvedValue(0),
    },
    sync: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
    session: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  sidePanel: {
    setPanelBehavior: vi.fn().mockResolvedValue(undefined),
    setOptions: vi.fn().mockResolvedValue(undefined),
  },
  scripting: {
    executeScript: vi.fn().mockResolvedValue([{ result: undefined }]),
  },
  tabs: {
    query: vi.fn().mockResolvedValue([]),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  },
  action: {
    onClicked: {
      addListener: vi.fn(),
    },
  },
};

// Assign to global
Object.assign(globalThis, { chrome: chromeMock });

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
  chromeMock.runtime.lastError = null;
});
```

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
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/index.html'],
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
import { getScripts, setScripts } from '@/shared/storage';
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

  describe('setScripts', () => {
    it('persists scripts to storage', async () => {
      const scripts = [{ id: 'scr_1', name: 'noop', code: '' }];

      await setScripts(scripts);

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        [STORAGE_KEYS.SCRIPTS]: scripts,
      });
    });
  });
});
```

### Testing Message Handlers

```typescript
// tests/background/message-handler.test.ts

import { describe, it, expect } from 'vitest';
import { handleMessage } from '@/background/service-worker';
import { MESSAGE_TYPES } from '@/shared/messages';

describe('handleMessage', () => {
  it('handles SAVE_SCRIPT message', async () => {
    const script = { name: 'log title', code: 'console.log(document.title)' };

    const result = await handleMessage({
      type: MESSAGE_TYPES.SAVE_SCRIPT,
      payload: { script },
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ name: 'log title' });
  });

  it('rejects unknown message types', async () => {
    const result = await handleMessage({
      type: 'UNKNOWN_TYPE' as any,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unhandled message');
  });
});
```

### Testing Pure Locator Generation (primary target)

```typescript
// tests/shared/locators.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { generateLocatorSet } from '@/shared/locators';

describe('generateLocatorSet', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('prefers data-testid over id and CSS', () => {
    document.body.innerHTML = `<button id="b1" data-testid="submit">Go</button>`;
    const el = document.querySelector('button')!;

    const set = generateLocatorSet(el);

    // LOCATOR_PRIORITY: data-testid > id > role+name > CSS > XPath
    expect(set.suggestions[0]).toMatchObject({
      strategy: 'data-testid',
      value: 'submit',
    });
  });

  it('emits per-framework snippets (WDIO, Playwright, Cypress, Selenium)', () => {
    document.body.innerHTML = `<input data-testid="email" />`;
    const el = document.querySelector('input')!;

    const set = generateLocatorSet(el);

    expect(set.suggestions[0].snippets).toHaveProperty('playwright');
    expect(set.suggestions[0].snippets).toHaveProperty('wdio');
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

```typescript
// tests/content/picker.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { showOverlay, removeOverlay } from '@/content/picker';

describe('picker overlay', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('injects the overlay host in shadow DOM', () => {
    showOverlay();

    const host = document.querySelector('senmurv-picker-overlay');
    expect(host).not.toBeNull();
    expect(host?.shadowRoot).not.toBeNull(); // closed shadow — test via side effects
  });

  it('removes the overlay cleanly', () => {
    showOverlay();
    removeOverlay();

    const host = document.querySelector('senmurv-picker-overlay');
    expect(host).toBeNull();
  });
});
```

---

## E2E Testing with Playwright

```typescript
// tests/e2e/extension.spec.ts

import { test, expect, chromium } from '@anthropic-ai/playwright';
import path from 'path';

const extensionPath = path.resolve(__dirname, '../../dist');

test.describe('senmurv extension', () => {
  test('side panel opens and shows the three tabs', async () => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });

    // Get extension ID
    const [background] = context.serviceWorkers();
    const extensionId = background.url().split('/')[2];

    // Open the Side Panel page directly
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);

    // Verify the tab routing rendered
    await expect(panel.locator('[data-testid="tab-data"]')).toBeVisible();
    await expect(panel.locator('[data-testid="tab-locator"]')).toBeVisible();
    await expect(panel.locator('[data-testid="tab-scripts"]')).toBeVisible();

    await context.close();
  });
});
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
