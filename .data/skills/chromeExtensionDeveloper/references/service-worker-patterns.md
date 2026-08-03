# Service Worker Patterns — senmurv

> Lifecycle management, persistence strategies, state recovery, and event-driven architecture.

---

## Service Worker Lifecycle

The MV3 service worker can terminate at any time. Design for statelessness:

```typescript
// src/background/service-worker.ts

// ✅ Correct — event listeners registered synchronously at top level
chrome.runtime.onInstalled.addListener(() => enableSidePanelOnActionClick());
chrome.runtime.onMessage.addListener(handleMessage);

// ✅ Also called unconditionally at module top level. Module-top-level code
// re-runs every time the SW script re-evaluates (install, browser startup,
// or waking from termination) — so this one call covers all three cases,
// and senmurv has no separate onStartup listener.
enableSidePanelOnActionClick();

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

import {
  FIND_TIMEOUT_SECONDS_DEFAULT,
  HUD_SECONDS_DEFAULT,
  STORAGE_KEYS,
} from '@/shared/constants';
import type { SavedScript, Prefs } from '@/shared/types';

const DEFAULT_PREFS: Prefs = {
  fontSize: 'medium',
  hudSeconds: HUD_SECONDS_DEFAULT,
  findTimeoutSeconds: FIND_TIMEOUT_SECONDS_DEFAULT,
};

// Typed storage wrapper (senmurv has one of these per data kind — scripts,
// tasks, checklists, notes, profiles, prefs — all following this shape)
export async function getScripts(): Promise<SavedScript[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SCRIPTS);
  const raw = result[STORAGE_KEYS.SCRIPTS];
  return Array.isArray(raw) ? raw : [];
}

export async function saveScripts(scripts: SavedScript[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SCRIPTS]: scripts });
}

export async function getPrefs(): Promise<Prefs> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.PREFS);
  return result[STORAGE_KEYS.PREFS] ?? DEFAULT_PREFS;
}

export async function savePrefs(prefs: Prefs): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.PREFS]: prefs });
}
```

---

## Installation & Update Handlers

senmurv deliberately seeds **nothing** on install — the Scripts list, tasks,
notes and checklists all start empty (see `docs/tools.md` / `docs/architecture.md`
→ Storage). The actual `onInstalled` handler only re-asserts the Side Panel
behavior:

```typescript
// src/background/service-worker.ts

function enableSidePanelOnActionClick(): void {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('[Senmurv] setPanelBehavior failed:', err));
}

enableSidePanelOnActionClick();
chrome.runtime.onInstalled.addListener(() => {
  enableSidePanelOnActionClick();
});
```

If a future change needs an `install`/`update` migration, keep the same shape —
switch on `details.reason`, and validate/rewrite storage rather than seeding
sample data into it.

---

## Running Scripts in the MAIN World

The Execute JS Script tool injects a runner into the page's MAIN world. The
runner uses `new Function` deliberately — see [security-checklist.md](security-checklist.md)
for the sanctioned exception (it is governed by the page's CSP, not the extension's):

```typescript
// src/background/service-worker.ts (simplified — the real handler goes through
// withActiveRunnableTab, which resolves + validates the tab first)

// The panel already resolved the saved script and sends its CODE directly —
// the service worker never looks a script up by id.
async function runScriptInPage(tabId: number, code: string): Promise<Result<void>> {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: runUserScript,
    args: [code],
  });

  return { ok: true, value: undefined };
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
// Recover after a service worker restart. senmurv has no onStartup listener —
// the module's top-level code below re-runs on every wake (install, browser
// startup, or restart after termination), so this one call covers all three.
// Nothing needs re-seeding either — storage is never pre-populated.
function enableSidePanelOnActionClick(): void {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('[Senmurv] setPanelBehavior failed:', err));
}

// Runs whenever the service worker wakes — cheap and idempotent.
enableSidePanelOnActionClick();
```

---

## Rules

1. **Register all event listeners synchronously** at top level — never conditionally
2. **Never store state in variables** — always use `chrome.storage.local`
3. **Design for termination** — SW can die between any two lines of code
4. **Recover on wake** — re-assert `sidePanel` behavior with an unconditional top-level call (senmurv has no `onStartup` listener — module top-level code already re-runs on every wake) plus `onInstalled`
5. **Never seed sample/default data** — the Scripts list, tasks, notes and checklists start empty by design; do not add seeding back
6. **Batch storage operations** — minimize reads/writes to reduce wake-ups
