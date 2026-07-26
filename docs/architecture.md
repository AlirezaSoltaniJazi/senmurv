# Architecture

Senmurv is a Manifest V3 extension with four execution contexts. Business logic lives in `src/shared/` (pure, testable); UI components and the content script stay thin.

## Contexts

| Context         | File                               | Role                                                                                                                            |
| --------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Service worker  | `src/background/service-worker.ts` | Coordinator — side-panel behavior, onInstalled seeding, message hub, runs scripts via `chrome.scripting`, relays picker results |
| Side panel (UI) | `src/sidepanel/*`                  | React app with three tabs; sends typed messages, renders results                                                                |
| Content script  | `src/content/picker.ts`            | Idle until asked for a mode; owns the mode arbiter, the Shadow-DOM overlay, and a lazily-imported chunk for the Tools modes     |
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

## In-page modes

The content script can be in exactly one mode at a time — `idle`, `pick-locator`,
`pick-fields`, `record`, or one of the Tools modes (`measure`, `color`, `font`,
`taborder`). Every transition goes through the arbiter in `picker.ts`:

```
enterMode(next) → stopCurrentMode() → set pageMode → applyCursor(next) → start(next)
```

Two consequences worth knowing before adding a mode:

- **The arbiter owns the page cursor**, not the individual modes. Two owners
  interleaving corrupt the saved value and leave a stuck crosshair.
- **Register the mode in the arbiter, not in another mode's guard.** The pairwise
  `if (isRecording()) return` guards this replaced do not scale past two modes.

`src/content/overlay.ts` holds the one Shadow-DOM overlay every mode draws
through. Its invariants (`all: initial` on the host, `pointer-events: none`,
mounted on `documentElement`) are load-bearing and documented in the file.

## Lazy Tools chunk

`picker.ts` is a declared content script, so it parses on **every** http/https
page load. The Tools modes therefore live behind a dynamic `import('./tools')`,
which CRXJS automatically lifts into `web_accessible_resources` (never hardcode
the chunk name — every filename is content-hashed).

**Bundle-placement rule:** nothing reachable from `src/shared/tools/*` may also
be reachable from `picker.ts`'s _static_ import graph, or the chunk is folded
back into the picker and the win silently disappears. `tests/build/bundle-placement.test.ts`
asserts this against `dist/` after a build.

## Key abstractions

- `shared/locators.ts` — pure locator generation, uniqueness checks (`querySelectorAll(...).length === 1`), ranking by `LOCATOR_PRIORITY`, and WDIO/Playwright/Cypress/Selenium formatters.
- `shared/faker-data.ts` — locale → faker instance map; `generateTestData()`.
- `shared/storage.ts` — typed `chrome.storage.local` wrapper for `SavedScript[]`.
- `shared/messages.ts` — message union + `sendMessage` helper + type guards.

## Storage

`chrome.storage.local` under `STORAGE_KEYS.SCRIPTS` holds `SavedScript[]`. The list starts empty — no scripts are seeded on install.
