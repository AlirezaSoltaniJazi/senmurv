# Architecture

Senmurv is a Manifest V3 extension with four execution contexts. Business logic lives in `src/shared/` (pure, testable); UI components and the content script stay thin.

## Contexts

| Context         | File                               | Role                                                                                                                            |
| --------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Service worker  | `src/background/service-worker.ts` | Coordinator — side-panel behavior, onInstalled seeding, message hub, runs scripts via `chrome.scripting`, relays picker results |
| Side panel (UI) | `src/sidepanel/*`                  | React app with three tabs; sends typed messages, renders results                                                                |
| Content script  | `src/content/picker.ts`            | Idle until `START_PICK`; hover-highlight overlay (Shadow DOM) + click capture; computes locators                                |
| Page MAIN world | injected by `chrome.scripting`     | Where saved user scripts run (governed by the page's CSP)                                                                       |

## Message flow

```
Side Panel  ──RUN_SCRIPT──▶  Service Worker  ──chrome.scripting.executeScript(world:'MAIN')──▶  Page
Side Panel  ──START_PICK──▶  Service Worker  ──chrome.tabs.sendMessage──▶  Content Picker
Content Picker  ──ELEMENT_PICKED──▶  Service Worker  ──relay──▶  Side Panel
Side Panel  ──GET/SAVE/DELETE_SCRIPT──▶  Service Worker  ──chrome.storage.local──▶  (persisted)
```

All messages are a discriminated union (`RuntimeMessage`) keyed on a `type` field, defined in `src/shared/messages.ts` with type guards. Message-type string constants live in `src/shared/constants.ts`.

## Data flow per tool

- **Generate Random Data** — fully client-side in the side panel: `shared/faker-data.ts#generateTestData(locale)` produces a `GeneratedData` object; the tab renders fields with copy/regenerate. No page or worker involvement.
- **Find Element Locator** — `LocatorTab` → `START_PICK` → picker highlights/captures → `shared/locators.ts` builds a ranked `LocatorSet` (raw locators + per-framework snippets) → `ELEMENT_PICKED` → rendered.
- **Execute JS Script** — scripts persisted via `shared/storage.ts`; **Run** sends `RUN_SCRIPT { code }`; the worker injects a self-contained runner into the page's MAIN world.

## Key abstractions

- `shared/locators.ts` — pure locator generation, uniqueness checks (`querySelectorAll(...).length === 1`), ranking by `LOCATOR_PRIORITY`, and WDIO/Playwright/Cypress/Selenium formatters.
- `shared/faker-data.ts` — locale → faker instance map; `generateTestData()`.
- `shared/storage.ts` — typed `chrome.storage.local` wrapper for `SavedScript[]`.
- `shared/messages.ts` — message union + `sendMessage` helper + type guards.

## Storage

`chrome.storage.local` under `STORAGE_KEYS.SCRIPTS` holds `SavedScript[]`. The list starts empty — no scripts are seeded on install.
