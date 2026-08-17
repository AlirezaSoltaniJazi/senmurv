# Senmurv — AI Agent Context

## What This Is

Manifest V3 browser extension — Chrome (primary) and Firefox (local dev/QA build, unpublished) — that gives QA / test-automation engineers a set of tools inside the browser's side panel (Chrome Side Panel / Firefox Sidebar), routed as tabs in `src/sidepanel/App.tsx`:

1. **Generate Random Data** — realistic, locale-aware test data (first/last name, phone, address, postal code, region/county, email, date of birth) via `@faker-js/faker`, with a locale switcher (default `en_GB`), copy-to-clipboard, and regenerate.
2. **Find Element Locator** — an in-page element picker (hover-highlight, click-capture) that produces ranked locator suggestions (data-testid › id › role+name › CSS › XPath), each with its live **match count / uniqueness**, plus copy-ready snippets for **Playwright, WebdriverIO, Cypress, Selenium, and Robot Framework**. Also includes a "Test a locator" box (with match-highlighting) to count matches for any CSS/XPath.
3. **Recorder** — record clicks/inputs/selects into an editable step list (or build by hand), then run/run-from-step/stop, save as a script, or export as a spec for the frameworks above.
4. **Execute JS Script** — save / edit / import (`javascript:` bookmarklets) JS scripts in `browser.storage.local` and run a chosen script in the page's **MAIN world** via `browser.scripting`.
5. **Tools** — a launcher of page-inspection/utility tools (Bypass, Site data, Measure, Colour, Tab order, Accessibility, Fonts, Assertions, Stacking, Validation, Region, Harden selector, JWT decoder, JSON Formatter, Query params, Logical names, Auto refresh) — registry in `src/shared/tools.ts`.
6. **Cookies** / **Storage** — view and edit the current site's cookies (incl. HttpOnly) and localStorage/sessionStorage, with saved **value profiles** for values you switch between often.
7. **Track**, **My Tasks**, **Notes** — a tagged time-tracking stopwatch, checklist tasks with deadlines, and free-form notes.
8. **Settings** — panel font size, Flow/HUD timings, and Track-tag management.

Built with TypeScript (strict, no `any`), React 19, Vite. Two separate build pipelines: `@crxjs/vite-plugin` for Chrome, a hand-rolled `vite.config.firefox.ts` for Firefox (see Known Gotchas — `vite-plugin-web-extension` is NOT viable on this stack).

## Stack

| Layer             | Technology                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------- |
| Language          | TypeScript strict (no `any`)                                                              |
| UI                | React 19                                                                                  |
| Build             | Vite 8 (Rolldown engine) + `@crxjs/vite-plugin` (Chrome) / hand-rolled config (Firefox)   |
| Test              | Vitest + happy-dom                                                                        |
| Lint              | ESLint (flat config) + Prettier                                                           |
| Runtime           | Manifest V3 — Chrome, Firefox (128+, local dev/QA only)                                   |
| Surface           | Chrome Side Panel (`chrome.sidePanel`) / Firefox Sidebar (`sidebarAction`)                |
| Cross-browser API | `webextension-polyfill` via `src/shared/browser-api.ts` — `browser.*`, not raw `chrome.*` |
| Storage           | `browser.storage.local` (typed wrappers)                                                  |
| Cookies           | `browser.cookies` (Cookies tab)                                                           |
| Scripts           | `browser.scripting.executeScript` (`world: 'MAIN'`)                                       |

## Project Structure

```
src/
├── background/
│   └── service-worker.ts   # sidePanel behavior, message hub, script execution, locator-match counting
├── content/
│   ├── picker.ts           # message router + mode arbiter; picks elements; lazily imports ./tools
│   ├── context.ts          # contextAlive + notify (terminal) / notifyQuiet (streams)
│   ├── overlay.ts          # the one Shadow-DOM overlay: rect pool, tones, isOurHost
│   ├── recorder.ts         # passive interaction recorder
│   ├── match-highlight.ts  # Locator tab's "highlight every match" in-page mode
│   ├── raf-throttle.ts     # rAF-throttled hover/scroll handlers shared by Tools modes
│   ├── tools.ts            # DYNAMIC-import entry for the Tools-tab in-page modes
│   └── tools/               # per-tool in-page bridges (bypass, measure, a11y, stacking, …)
├── sidepanel/
│   ├── index.html
│   ├── main.tsx            # React root
│   ├── App.tsx             # tab routing: Data | Locator | Recorder | Scripts | Tools | Cookies | Storage | Track | My Tasks | Notes | Settings
│   └── components/         # GenerateDataTab, LocatorTab, RecorderTab, ScriptsTab, ToolsTab, CookiesTab, StorageTab, TrackTab, MyTasksTab, NotesTab, SettingsTab, tools/*
├── shared/                 # types, messages, constants, locators, faker-data, storage, bookmarklet,
│                           # profiles, tasks, checklists, cookie-url, csv, workflow, tools/*
│   └── browser-api.ts      # `export const browser` — the webextension-polyfill instance every
│                           # module imports instead of the raw `chrome` global
└── utils/                  # id generation
tests/                      # Vitest tests mirroring src/ structure
docs/                       # getting-started, architecture, tools
scripts/                    # bump-version.mjs, zip-extension.mjs, build-firefox.mjs
public/icons/               # Extension icons (16/32/48/128)
.data/skills/               # AI skill definitions and reference guides
manifest.json                # Chrome manifest — canonical, source-path-referencing, CRXJS-built
manifest.firefox.json        # Firefox manifest — same shape, no `sidePanel`; adds `sidebar_action`
                              # and `browser_specific_settings.gecko`
vite.config.ts                # Chrome build — @crxjs/vite-plugin
vite.config.firefox.ts        # Firefox build — plain rollupOptions, no extension-specific plugin
```

## How To Run

```bash
npm install              # install dependencies (incl. @faker-js/faker)
npm run dev              # dev build; load dist/ as unpacked extension in Chrome
npm run build            # production build → dist/
npm run build:firefox    # production build → dist-firefox/ (see scripts/build-firefox.mjs)
npm run dev:firefox      # Firefox build in watch mode — reload manually via about:debugging
npm test                 # run tests once
npm run lint && npm run format:check && npm run typecheck
npm run release          # full pipeline: lint, format, typecheck, test, package
npm run package          # build + zip → release/
npm run package:firefox  # build + zip → release/senmurv-firefox-<version>.zip
```

Load in Chrome: `chrome://extensions` → Developer mode → **Load unpacked** → select `dist/`. Click the toolbar icon to open the side panel.

Load in Firefox: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → select `dist-firefox/manifest.json`. Temporary-load only (no Mozilla signing yet, no AMO listing) — reload after each Firefox restart.

## Development Conventions

### Code Style

- Prettier: single quotes, trailing commas, 100-char width, 2-space indent, semicolons
- ESLint: strict no-any (warn), eqeqeq (error), no-throw-literal (error)
- All exported functions MUST have explicit return types
- Named exports only — never default exports
- Type-only imports on separate lines: `import type { X } from '...'`

### Naming Conventions

| Entity             | Style                | Example                                 |
| ------------------ | -------------------- | --------------------------------------- |
| Files (modules)    | kebab-case           | `faker-data.ts`, `bookmarklet.ts`       |
| Files (components) | PascalCase           | `LocatorTab.tsx`, `GenerateDataTab.tsx` |
| Types/Interfaces   | PascalCase           | `SavedScript`, `LocatorSuggestion`      |
| Constants          | SCREAMING_SNAKE      | `MESSAGE_TYPES`, `STORAGE_KEYS`         |
| Functions/vars     | camelCase            | `generateTestData()`, `buildLocators()` |
| Booleans           | is/has/should prefix | `isRunnableUrl()`, `hasTestId`          |
| IDs                | prefixed UUID        | `scr_` via `newId()`                    |

### Import Order

1. External packages (`react`, `@faker-js/faker`)
2. `@/` path aliases (cross-directory) — `@/shared/messages`, `import type { SavedScript } from '@/shared/types'`
3. Relative imports (same feature directory only) — `./LocatorTab`

Never use deep relative paths (`../../`) — always use `@/` aliases.

### Error Handling

- Result objects `{ ok: true; value: T } | { ok: false; error: string }` for fallible ops
- Type guards validate all untrusted data (messages, stored JSON) before use
- All extension API calls go through `browser.*` (from `@/shared/browser-api`), which is
  promise-based — no `chrome.runtime.lastError` checks, `try`/`catch` or `.catch()` instead.
  `chrome.sidePanel` is the one deliberate exception (see Architecture Rules)
- React components: try/catch with `setError()` state

## Architecture Rules

- **`browser.*` (webextension-polyfill), not raw `chrome.*`** — every module imports `browser` from `@/shared/browser-api` and calls `browser.scripting`/`browser.storage`/`browser.tabs`/etc. `chrome.sidePanel` is the ONE deliberate exception: it's a Chrome-only API with no `webextension-polyfill` typing and no Firefox equivalent, so `src/background/service-worker.ts`'s `enableSidePanelOnActionClick` checks the raw `chrome.sidePanel` global directly and falls back to `browser.action.onClicked` → `browser.sidebarAction.toggle()` when it's absent (Firefox). Do not widen that exception to other APIs — everything else has a `browser.*` form.
- **Two manifests, one source tree** — `manifest.json` (Chrome, canonical) and `manifest.firefox.json` (Firefox: no `sidePanel` permission, adds `sidebar_action` + `browser_specific_settings.gecko`, dual `background.service_worker`/`background.scripts` keys) both reference the SAME `src/` files by source path. Never hand-edit `manifest.json` to add Firefox-only content — it must stay a zero-diff, Chrome-canonical file so CRXJS's manifest-driven entry discovery is never affected by a key it doesn't expect.
- **The Firefox content script is a two-stage bridge** — `src/content/picker-loader.js` is a deliberately import-free classic script (Firefox can't declare `content_scripts` as ES modules) that does one thing: `browser.runtime.getURL('picker.js')` + dynamic `import()` to jump into the real ESM bundle. From inside that module, `picker.ts`'s own relative `import('./tools')` resolves correctly against ITS OWN url — the same trick CRXJS's auto-generated Chrome loader uses. `scripts/build-firefox.mjs` copies this file in verbatim (never through Vite) and rewrites `dist-firefox/manifest.json`'s `content_scripts[].js` to point at it. **This bridge only works because `manifest.firefox.json` declares `web_accessible_resources: [{ resources: ["picker.js", "assets/*"], matches: [...] }]`** — without it Firefox silently refuses the content-script-initiated `import()`, `picker.js` never loads, its `runtime.onMessage` listener never registers, and every page-requiring feature (Tools, Locator, Recorder) fails with "Could not reach the page" (this exact regression shipped once — CRXJS auto-generates the Chrome equivalent, so there was nothing to copy from when the Firefox manifest was hand-authored). `picker.js` and `assets/*` are stable, non-hashed path patterns per `vite.config.firefox.ts`'s `entryFileNames`/`chunkFileNames`, so this can be a static entry in `manifest.firefox.json` — it does not need to be computed per-build.
- **Service worker is the coordinator** — side-panel UI sends typed messages; the worker performs `browser.scripting` / `browser.tabs` operations and storage mutations.
- **Typed discriminated unions for messages** — `RuntimeMessage` uses a `type` field; validate with type guards before handling.
- **Business logic in `shared/`** — `locators.ts` and `faker-data.ts` are PURE and unit-testable; keep components thin.
- **The one carve-out from that purity rule** — `shared/tools/bypass.ts` MUTATES the DOM, and `field-detect.ts` reads it. They stay chrome-free and take their root (and, for bypass, a `BypassEnv` for the two reads needing a layout engine) as arguments, so happy-dom still drives them. Injecting the environment rather than reaching for globals is what keeps them testable — follow that shape rather than adding more DOM-touching modules to `shared/`.
- **Content script bridges only** — `picker.ts` handles DOM highlight/capture and delegates locator computation to `shared/locators.ts`; no app state lives there.
- **One in-page mode at a time** — every mode transition goes through `enterMode` in `picker.ts`, which stops the outgoing mode first. Never add a pairwise `if (otherModeActive) return` guard; they do not scale. The **arbiter** owns the page cursor, not the mode.
- **Streams use `notifyQuiet`, terminal messages use `notify`** (`src/content/context.ts`). A panel-addressed message can fail to be answered when the panel is closed; `notify` treats that as "we are orphaned, tear down", which is right for a single pick but would kill a hover mode on its first frame.
- **Keep the Tools chunk lazy** — `picker.ts` parses on every http/https page load, so the Tools modes sit behind `import('./tools')`. Nothing reachable from `src/shared/tools/*` may also be reachable from `picker.ts`'s _static_ graph. `tests/build/bundle-placement.test.ts` enforces this against `dist/`.
- **Shadow DOM for injected UI** — the picker's highlight overlay must not pollute host-page styles.
- **Side panel over popup** — the panel persists while the user interacts with the page (required for element picking).

## Files To Know

| File                               | Purpose                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/background/service-worker.ts` | Side panel behavior, message hub, runs scripts in MAIN, locator-match counting                        |
| `src/content/picker.ts`            | Message router, mode arbiter, element picker, lazy `./tools` loader                                   |
| `src/content/picker-loader.js`     | Firefox-only classic-script bridge into `picker.ts`'s real ESM bundle (see Architecture Rules)        |
| `src/content/overlay.ts`           | The one Shadow-DOM overlay (rect pool, tones, `isOurHost`)                                            |
| `src/shared/tools.ts`              | `TOOLS` registry backing the Tools launcher                                                           |
| `src/shared/locators.ts`           | Locator generation, ranking, and per-framework snippet formatting                                     |
| `src/shared/faker-data.ts`         | `generateTestData(locale)` — faker-backed test data                                                   |
| `src/shared/messages.ts`           | `RuntimeMessage` union, `sendRuntimeMessage`/`sendTabMessage` helpers, type guards                    |
| `src/shared/constants.ts`          | `STORAGE_KEYS`, `MESSAGE_TYPES`, locales, `LOCATOR_PRIORITY`                                          |
| `src/shared/storage.ts`            | Typed `browser.storage.local` wrapper for scripts, tasks, checklists, notes, prefs and value profiles |
| `src/shared/browser-api.ts`        | The one `webextension-polyfill` import point — `export const browser`                                 |
| `src/sidepanel/App.tsx`            | Side panel React app with tab routing                                                                 |
| `manifest.json`                    | Chrome MV3 manifest — permissions, entry points, `side_panel`                                         |
| `manifest.firefox.json`            | Firefox MV3 manifest — `sidebar_action`, `browser_specific_settings.gecko`, no `sidePanel`            |
| `vite.config.ts`                   | Chrome build config — CRXJS plugin, path aliases                                                      |
| `vite.config.firefox.ts`           | Firefox build config — plain `rollupOptions`, no extension-specific plugin                            |
| `scripts/build-firefox.mjs`        | Runs the Firefox Vite build, rewrites `dist-firefox/manifest.json`, copies `picker-loader.js`         |
| `tests/setup.ts`                   | `chrome`/`browser` (via a `webextension-polyfill` mock) API mocks for all test files                  |

## Files To Never Touch

- `dist/`, `dist-firefox/` — build output, auto-generated by Vite (+ CRXJS for Chrome)
- `release/` — packaged zip artifacts from `npm run package` / `npm run package:firefox`
- `package-lock.json` — auto-managed by npm

## Security

- No `eval()` / `new Function()` in extension code — **except** the one sanctioned site below.
- **Sanctioned exception — the script runner:** the Execute JS Script tool runs user-provided code in the page's MAIN world via `browser.scripting.executeScript({ target, world: 'MAIN', func: runUserScript, args: [code] })`. The injected `runUserScript(code)` calls `new Function(code)()`. This is the extension's purpose and runs under the **page's** CSP — exactly like a `javascript:` bookmarklet — never under the extension's CSP. Extension pages keep `script-src 'self'`. It is isolated to that one injected function and suppressed with an inline `// eslint-disable-next-line @typescript-eslint/no-implied-eval` and a justifying comment. **Do not widen this beyond the runner, and do not "fix" it away.** Firefox 128+ supports `world: 'MAIN'` scripting with the same page-CSP-governs-injected-code semantics — this has not been empirically re-verified against a live strict-CSP page in Firefox, only inferred from Mozilla's own MDN/Bugzilla documentation of the feature.
- **`world: 'MAIN'` is NOT the same as the exception.** `BYPASS_XRM` also injects into the MAIN world (`executeScript({ world: 'MAIN', func: xrmBypass })`) because the Dynamics `Xrm` client API only exists in the page's own realm. It passes a **serialized function, not a code string**, and uses neither `eval` nor `new Function` — so it does not widen the sanctioned exception above. The **Region emulator** (`APPLY_REGION` / `RESTORE_REGION` / `GET_REGION_STATE`, funcs `applyRegionShim` / `restoreRegionShim` / `regionStateShim`) is the same shape: MAIN-world `func` injections that override `Date` / `Intl` / `navigator` to emulate a region, passing real functions, never strings. **Logical names** (`SHOW_LOGICAL_NAMES`, func `readXrmLogicalNames`) is the same shape again: it reads the Dynamics `Xrm` form metadata in the MAIN world and returns plain JSON records — `executeScript` results must be serialisable, so it hands back names, never elements, and the content script re-resolves them against `[data-id]` to draw the overlay. **Open in Web API** (`GET_XRM_WEB_API_URL`, func `readXrmWebApiUrl`) is the same shape again: it resolves the current record's id and entity set name via the Dynamics `Xrm` API (async, since `Xrm.Utility.getEntityMetadata` is) and returns a plain JSON record — a Dataverse Web API URL, never a DOM reference. Any future MAIN-world injection must clear the same bar: a real `func`, never a string.
- **`shared/workflow.ts`'s `PREAMBLE` is a text template, not a second instance.** The Recorder's exported flow script embeds a `runJs` helper whose body is `new Function(...)` — but that whole helper exists only as **text inside a template-literal string** assembled by `buildWorkflowScript()`. The generated script runs like any other saved script, through the one sanctioned runner above; nothing in `workflow.ts` itself executes `new Function` at the extension-code level. A text search (e.g. `grep -rn "new Function" src/`) will still match this string plus prose comments discussing the exception — read the matches, don't just count them.
- Validate all messages and stored data with type guards before processing.
- Block script injection / picking on `chrome://`, `chrome-extension://`, `edge://`, `moz-extension://`, Chrome Web Store, `addons.mozilla.org`, and `about:` URLs (`BLOCKED_URL_PREFIXES` in `src/shared/constants.ts`).
- Shadow DOM isolation for the picker overlay.

## Known Gotchas

- **`vite-plugin-web-extension` (and `@samrum/vite-plugin-web-extension`) are NOT viable for the Firefox build on this stack.** This project's Vite 8 uses the Rolldown bundler engine by default, not classic Rollup. `vite-plugin-web-extension@4.5.1`'s background-script build requests `output.format: 'iife'` together with code-splitting, which Rolldown rejects outright (Rollup was more permissive); it also ignores the configured `outDir` and writes into the shared `dist/`, clobbering the Chrome build, regardless of config or CLI override. Both were reproduced directly, not inferred. `vite.config.firefox.ts` uses plain `rollupOptions` instead — no extension-specific plugin. Re-verify against Rolldown compatibility before ever reaching for one of these plugins again.
- **`chrome.sidePanel` has no Firefox equivalent and no `webextension-polyfill` typing** — see the Architecture Rules entry above. Firefox's `sidebarAction.toggle()` must be called synchronously as the first statement in the `action.onClicked` handler; it loses "user gesture" status after any `await` (Bugzilla 1800401).
- **Side Panel API requires Chrome 114+; Firefox sidebar support assumed 128+** (set as `browser_specific_settings.gecko.strict_min_version` in `manifest.firefox.json`, for `world: 'MAIN'` scripting parity).
- **MAIN-world execution follows the page's CSP** — sites that block `unsafe-eval` will reject the runner (same limitation as a bookmarklet) on both browsers; surface the thrown error in the UI.
- **`browser.tabs.sendMessage` needs the content script present** — injection is blocked on `chrome://`/Web Store/`about:`/`moz-extension://`/AMO pages; handle gracefully.
- **Element picker can't pierce cross-origin iframes.**
- **CRXJS HMR quirks** — the service worker doesn't auto-reload; manually reload the extension after background changes. The Firefox build has no HMR at all — `npm run dev:firefox` rebuilds on change but you reload manually via `about:debugging`.
- **`exactOptionalPropertyTypes` is ON** — can't assign `undefined` to optional props; omit the key instead.
- **Test environment is happy-dom, not jsdom** — some browser APIs differ.
- **The real `webextension-polyfill` throws synchronously unless `chrome.runtime.id` is truthy, and wraps every method assuming Chrome's callback-based signatures** — `tests/setup.ts` mocks the whole `webextension-polyfill` MODULE (`vi.mock('webextension-polyfill', () => ({ default: chromeMock }))`) rather than relying on the real polyfill to wrap `chromeMock`'s already-promise-returning functions; the real polyfill would wait forever on a callback `chromeMock` never invokes.

## Common Patterns

### Adding a new runtime message

1. Add the type to `MESSAGE_TYPES` in `src/shared/constants.ts`.
2. Add the variant to the `RuntimeMessage` union (and a type guard) in `src/shared/messages.ts`.
3. Handle it in the `src/background/service-worker.ts` `onMessage` switch (`return true` for async `sendResponse`).

### Adding a locator strategy or framework snippet

1. Extend the computation/ranking in `src/shared/locators.ts` (keep it pure).
2. Add the framework formatter mapping.
3. Add a test in `tests/shared/locators.test.ts` (assert uniqueness + ranking + snippet string).

### Adding a side-panel tab

1. Create `src/sidepanel/components/MyTab.tsx` (named export, explicit return type, thin — delegate to `shared/`).
2. Register it in `src/sidepanel/App.tsx` tab routing.

### Adding a Tools sub-tool

1. Pure logic in `src/shared/tools/<tool>.ts` — no extension API calls, `Document`-injectable so happy-dom can drive it. Never import it from `picker.ts`'s static graph.
2. In-page bridge in `src/content/tools/<tool>.ts`, registered in the `HANDLERS` map in `src/content/tools.ts` (only if it needs an interactive mode).
3. UI in `src/sidepanel/components/tools/<Tool>Tool.tsx`, rendered by `ToolsTab` inside `ToolShell` — which already owns the title, the standing limits and stop-on-unmount.
4. Flip `isReady: true` on its entry in `src/shared/tools.ts`, and add any new `PageMode` member to `src/shared/types.ts`.
5. Tests in `tests/shared/tools/<tool>.test.ts`. `src/content/*` is not unit-testable — happy-dom has no layout engine (`getBoundingClientRect()` returns zeros).

Imports from these nested directories must use `@/` aliases (`@/content/overlay`), never `../`.

## Testing

- **Framework**: Vitest + happy-dom (not Jest)
- **Structure**: `tests/` mirrors `src/`
- **Chrome mocks**: global setup in `tests/setup.ts` — mocks `chrome.runtime`, `chrome.storage.local`, `chrome.tabs`, `chrome.sidePanel`, `chrome.scripting`, `chrome.action`, `chrome.sidebarAction` (the last two only exercised by the Firefox-fallback test in `tests/background/service-worker.test.ts`), and mocks the `webextension-polyfill` module itself so `browser.*` resolves to the same mock (see Known Gotchas)
- **Primary unit targets**: `shared/locators.ts` (DOM fixtures, uniqueness, ranking, framework snippets) and `shared/faker-data.ts` (seeded determinism, all fields present per locale)
- **Run**: `npm test`, `npm run test:coverage`

## Skills Reference

> Project conventions live in `.data/skills/chromeExtensionDeveloper/`. Check before making architectural decisions.
>
> Key references:
>
> - `references/code-style.md` — Formatting and naming rules
> - `references/manifest-patterns.md` — Manifest V3 patterns (sidePanel, scripting)
> - `references/service-worker-patterns.md` — Service worker lifecycle
> - `references/message-passing-guide.md` — Typed message passing
> - `references/security-checklist.md` — Security best practices (incl. the sanctioned runner exception)
> - `references/test-patterns.md` — Vitest + happy-dom patterns
> - `references/common-issues.md` — Chrome extension gotchas

## Sub-Agent Capabilities

> The `chromeExtensionDeveloper` skill supports sub-agent delegation:
>
> - `agents/code-reviewer.md` — Read-only code audit
> - `agents/security-auditor.md` — CSP and permissions analysis (knows about the sanctioned runner exception)
> - `agents/test-writer.md` — Vitest test generation
>
> Ensure `Agent` is in allowed-tools when using these.
