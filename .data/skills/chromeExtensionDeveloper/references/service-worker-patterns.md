# Service Worker Patterns — senmurv

> Lifecycle management, persistence strategies, state recovery, and event-driven architecture.

---

## Service Worker Lifecycle

The MV3 service worker can terminate at any time. Design for statelessness:

```typescript
// src/background/service-worker.ts

// ✅ Correct — event listeners at top level (registered synchronously)
chrome.runtime.onInstalled.addListener(handleInstalled);
chrome.runtime.onStartup.addListener(handleStartup);
chrome.runtime.onMessage.addListener(handleMessage);

// ✅ Open the Side Panel when the toolbar icon is clicked (set once, synchronously)
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// ❌ Wrong — conditional event registration (may miss events after wake)
if (someCondition) {
  chrome.runtime.onMessage.addListener(handler); // DON'T DO THIS
}
```

---

## State Persistence

Never store state in service worker memory — it will be lost:

```typescript
// src/shared/storage.ts

import { STORAGE_KEYS, DEFAULT_LOCALE } from '@/shared/constants';
import type { SavedScript, Locale } from '@/shared/types';

// Typed storage wrapper
export async function getScripts(): Promise<SavedScript[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SCRIPTS);
  return result[STORAGE_KEYS.SCRIPTS] ?? [];
}

export async function setScripts(scripts: SavedScript[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SCRIPTS]: scripts });
}

export async function getLocale(): Promise<Locale> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.LOCALE);
  return result[STORAGE_KEYS.LOCALE] ?? DEFAULT_LOCALE;
}

export async function setLocale(locale: Locale): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.LOCALE]: locale });
}
```

---

## Installation & Update Handlers

```typescript
// src/background/service-worker.ts

import { SAMPLE_SCRIPTS } from '@/shared/sample-scripts';

async function handleInstalled(details: chrome.runtime.InstalledDetails): Promise<void> {
  switch (details.reason) {
    case 'install':
      await initializeExtension();
      break;
    case 'update':
      await migrateStorage(details.previousVersion!);
      break;
  }
}

async function initializeExtension(): Promise<void> {
  // Seed the sample script(s) so the Scripts tab isn't empty on first run
  const existing = await getScripts();
  if (existing.length === 0) {
    await setScripts(SAMPLE_SCRIPTS);
  }
}
```

---

## Running Scripts in the MAIN World

The Execute JS Script tool injects a runner into the page's MAIN world. The
runner uses `new Function` deliberately — see [security-checklist.md](security-checklist.md)
for the sanctioned exception (it is governed by the page's CSP, not the extension's):

```typescript
// src/background/service-worker.ts

async function handleRunScript(scriptId: string): Promise<MessageResponse> {
  const script = (await getScripts()).find((s) => s.id === scriptId);
  if (!script) return { success: false, error: 'Script not found' };

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { success: false, error: 'No active tab' };

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    func: runUserScript,
    args: [script.code],
  });

  return { success: true };
}

// Injected into the page's MAIN world. Runs under the PAGE's CSP, like a bookmarklet.
function runUserScript(code: string): void {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- sanctioned: user script runner, page-CSP governed, isolated to this function
  new Function(code)();
}
```

---

## Error Recovery Pattern

```typescript
// Recover after service worker restart — re-assert the panel behavior and re-seed if storage is empty
chrome.runtime.onStartup.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  const scripts = await getScripts();
  if (scripts.length === 0) {
    await setScripts(SAMPLE_SCRIPTS);
  }
});
```

---

## Rules

1. **Register all event listeners synchronously** at top level — never conditionally
2. **Never store state in variables** — always use `chrome.storage.local`
3. **Design for termination** — SW can die between any two lines of code
4. **Recover on startup** — re-assert `sidePanel` behavior and re-read storage on `onStartup` / `onInstalled`
5. **Seed on install only** — only write `SAMPLE_SCRIPTS` when storage is empty, never clobber user data
6. **Batch storage operations** — minimize reads/writes to reduce wake-ups
