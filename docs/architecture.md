# Architecture

Senmurv is a Manifest V3 extension with four execution contexts. Business logic lives in `src/shared/` (pure, testable); UI components and the content script stay thin.

## Contexts

| Context         | File                               | Role                                                                                                                                                                                                             |
| --------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Service worker  | `src/background/service-worker.ts` | Coordinator — side-panel behavior, message hub, runs scripts via `browser.scripting`, relays picker results, owns Accounts encryption (`shared/crypto.ts`) (nothing is seeded on install — storage starts empty) |
| Side panel (UI) | `src/sidepanel/*`                  | React app with tab routing (Data, Locator, Recorder, Scripts, Accounts, Tools, Cookies, Storage, Track, My Tasks, Notes, Settings, Export/Import); sends typed messages, renders results                         |
| Content script  | `src/content/picker.ts`            | Idle until asked for a mode; owns the mode arbiter, the Shadow-DOM overlay, and a lazily-imported chunk for the Tools modes                                                                                      |
| Page MAIN world | injected by `browser.scripting`    | Where saved user scripts run (governed by the page's CSP)                                                                                                                                                        |

## Message flow

```
Side Panel  ──RUN_SCRIPT──▶  Service Worker  ──browser.scripting.executeScript(world:'MAIN')──▶  Page
Side Panel  ──START_PICK──▶  Service Worker  ──browser.tabs.sendMessage──▶  Content Picker
Content Picker  ──ELEMENT_PICKED──▶  Service Worker  ──relay──▶  Side Panel
Side Panel  ──GET/SAVE/DELETE_SCRIPT──▶  Service Worker  ──browser.storage.local──▶  (persisted)
```

All messages are a discriminated union (`RuntimeMessage`) keyed on a `type` field, defined in `src/shared/messages.ts` with type guards. Message-type string constants live in `src/shared/constants.ts`.

## Data flow per tool

- **Generate Random Data** — fully client-side in the side panel: `shared/faker-data.ts#generateTestData(locale)` produces a `GeneratedData` object; the tab renders fields with copy/regenerate. No page or worker involvement.
- **Find Element Locator** — `LocatorTab` → `START_PICK` → picker highlights/captures → `shared/locators.ts` builds a ranked `LocatorSet` (raw locators + per-framework snippets) → `ELEMENT_PICKED` → rendered.
- **Execute JS Script** — scripts persisted via `shared/storage.ts`; **Run** sends `RUN_SCRIPT { code }`; the worker injects a self-contained runner into the page's MAIN world.
- **Accounts** — `SAVE_ACCOUNT` resolves the password (keep/encrypt-new/drop-for-default) via `shared/crypto.ts#encryptSecret`, validates via `shared/accounts.ts#validateAccount`, and persists via `shared/storage.ts`. **Login** (`RUN_ACCOUNT_LOGIN`) decrypts the right password, navigates the active tab to the saved address, waits for load, then sends `ACCOUNT_LOGIN_FILL` to the content script's `account-login.ts`, which fills both fields (native setter + dispatched events, ISOLATED world — never the sanctioned MAIN-world runner) and clicks the login button. **Export** (`EXPORT_ACCOUNTS`) re-verifies the PIN via `decryptSecretsWithPin` and returns plaintext for the panel to serialize and download; **Import** (`IMPORT_ACCOUNTS`) re-encrypts each incoming password via `encryptSecret` (fails with the standard "locked" error if Accounts isn't unlocked) and appends with fresh ids.

## In-page modes

The content script can be in exactly one mode at a time — `idle`, `pick-locator`,
`pick-fields`, `record`, `match` (Locator tab's highlight-matches mode), or one
of the Tools modes (`measure`, `color`, `font`, `taborder`, `assert`, `stack`,
`validation`, `logicalnames`). Every transition goes through the arbiter in `picker.ts`:

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
- `shared/storage.ts` — typed `browser.storage.local` wrapper for scripts, tasks, checklists, notes, prefs, value profiles, and Accounts (accounts, default password, PIN/security config).
- `shared/messages.ts` — message union + `sendRuntimeMessage`/`sendTabMessage` helpers + type guards.
- `shared/accounts.ts` — pure Accounts logic (validation, grouping, duplicate, rename-group); never sees a plaintext password.
- `shared/crypto.ts` — PIN-derived AES-GCM encrypt/decrypt for Accounts; service-worker only (see Architecture Rules in `agents.md`/`.claude/CLAUDE.md`).
- `shared/data-io.ts` — Export/Import parse/serialize for every data kind (Scripts' own `script-io.ts` is separate), including Accounts' shape validation (crypto-free — the actual encrypt/decrypt round trip is the `EXPORT_ACCOUNTS`/`IMPORT_ACCOUNTS` messages, not a function here).

## Storage

`browser.storage.local` under `STORAGE_KEYS.SCRIPTS` holds `SavedScript[]`. The list starts empty — no scripts are seeded on install. Accounts data lives under its own keys (`STORAGE_KEYS.ACCOUNTS`, `DEFAULT_PASSWORD`, `ACCOUNTS_SECURITY`) — passwords are stored only as `EncryptedSecret {ciphertext, iv}`, never plaintext; the PIN-derived key itself lives only in `browser.storage.session` (memory-only), never `.local`.
