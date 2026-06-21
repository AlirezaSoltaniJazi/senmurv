# Senmurv — AI Agent Context

## What This Is

Chrome extension (Manifest V3) that gives QA / test-automation engineers three tools inside a **Chrome Side Panel**:

1. **Generate Random Data** — realistic, locale-aware test data (first/last name, phone, address, postal code, email, date of birth) via `@faker-js/faker`, with a locale switcher (default `en_GB`), copy-to-clipboard, and regenerate.
2. **Find Element Locator** — an in-page element picker (hover-highlight, click-capture) that produces ranked locator suggestions (data-testid › id › role+name › CSS › XPath), each with its live **match count / uniqueness**, plus copy-ready snippets for **Playwright, WebdriverIO, Cypress, Selenium, and Robot Framework**. Also includes a "Test a locator" box to count matches for any CSS/XPath.
3. **Execute JS Script** — save / edit / import (`javascript:` bookmarklets) JS scripts in `chrome.storage.local` and run a chosen script in the page's **MAIN world** via `chrome.scripting`.

Built with TypeScript (strict, no `any`), React 19, Vite + CRXJS.

## Stack

| Layer    | Technology                                         |
| -------- | -------------------------------------------------- |
| Language | TypeScript strict (no `any`)                       |
| UI       | React 19                                           |
| Build    | Vite 8 + @crxjs/vite-plugin                        |
| Test     | Vitest + happy-dom                                 |
| Lint     | ESLint (flat config) + Prettier                    |
| Runtime  | Chrome Extension Manifest V3                       |
| Surface  | Side Panel (`chrome.sidePanel`)                    |
| Storage  | `chrome.storage.local` (typed wrappers)            |
| Scripts  | `chrome.scripting.executeScript` (`world: 'MAIN'`) |

## Project Structure

```
src/
├── background/
│   └── service-worker.ts   # sidePanel behavior, message hub, script execution, locator-match counting
├── content/
│   └── picker.ts           # idle until START_PICK; Shadow-DOM hover overlay + click capture; computes locators
├── sidepanel/
│   ├── index.html
│   ├── main.tsx            # React root
│   ├── App.tsx             # tab routing: Data | Locator | Scripts
│   └── components/         # GenerateDataTab, LocatorTab, ScriptsTab
├── shared/                 # types, messages, constants, locators, faker-data, storage, bookmarklet
└── utils/                  # id generation
tests/                      # Vitest tests mirroring src/ structure
docs/                       # getting-started, architecture, tools
scripts/                    # bump-version.mjs, zip-extension.mjs
public/icons/               # Extension icons (16/32/48/128)
.data/skills/               # AI skill definitions and reference guides
```

## How To Run

```bash
npm install              # install dependencies (incl. @faker-js/faker)
npm run dev              # dev build; load dist/ as unpacked extension in Chrome
npm run build            # production build → dist/
npm test                 # run tests once
npm run lint && npm run format:check && npm run typecheck
npm run release          # full pipeline: lint, format, typecheck, test, package
npm run package          # build + zip → release/
```

Load in Chrome: `chrome://extensions` → Developer mode → **Load unpacked** → select `dist/`. Click the toolbar icon to open the side panel.

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
- `chrome.runtime.lastError` always checked in chrome API callbacks
- React components: try/catch with `setError()` state

## Architecture Rules

- **Service worker is the coordinator** — side-panel UI sends typed messages; the worker performs `chrome.scripting` / `chrome.tabs` operations and storage mutations.
- **Typed discriminated unions for messages** — `RuntimeMessage` uses a `type` field; validate with type guards before handling.
- **Business logic in `shared/`** — `locators.ts` and `faker-data.ts` are PURE and unit-testable; keep components thin.
- **Content script bridges only** — `picker.ts` handles DOM highlight/capture and delegates locator computation to `shared/locators.ts`; no app state lives there.
- **Shadow DOM for injected UI** — the picker's highlight overlay must not pollute host-page styles.
- **Side panel over popup** — the panel persists while the user interacts with the page (required for element picking).

## Files To Know

| File                               | Purpose                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| `src/background/service-worker.ts` | Side panel behavior, message hub, runs scripts in MAIN, locator-match counting |
| `src/content/picker.ts`            | Hover-highlight + click-capture element picker                                 |
| `src/shared/locators.ts`           | Locator generation, ranking, and per-framework snippet formatting              |
| `src/shared/faker-data.ts`         | `generateTestData(locale)` — faker-backed test data                            |
| `src/shared/messages.ts`           | `RuntimeMessage` union, `sendMessage` helper, type guards                      |
| `src/shared/constants.ts`          | `STORAGE_KEYS`, `MESSAGE_TYPES`, locales, `LOCATOR_PRIORITY`                   |
| `src/shared/storage.ts`            | Typed `chrome.storage.local` wrapper for saved scripts                         |
| `src/sidepanel/App.tsx`            | Side panel React app with tab routing                                          |
| `manifest.json`                    | MV3 manifest — permissions, entry points, side_panel                           |
| `vite.config.ts`                   | Build config — CRXJS plugin, path aliases                                      |
| `tests/setup.ts`                   | Chrome API mocks for all test files                                            |

## Files To Never Touch

- `dist/` — build output, auto-generated by Vite + CRXJS
- `release/` — packaged zip artifacts from `npm run package`
- `package-lock.json` — auto-managed by npm

## Security

- No `eval()` / `new Function()` in extension code — **except** the one sanctioned site below.
- **Sanctioned exception — the script runner:** the Execute JS Script tool runs user-provided code in the page's MAIN world via `chrome.scripting.executeScript({ target, world: 'MAIN', func: runUserScript, args: [code] })`. The injected `runUserScript(code)` calls `new Function(code)()`. This is the extension's purpose and runs under the **page's** CSP — exactly like a `javascript:` bookmarklet — never under the extension's CSP. Extension pages keep `script-src 'self'`. It is isolated to that one injected function and suppressed with an inline `// eslint-disable-next-line @typescript-eslint/no-implied-eval` and a justifying comment. **Do not widen this beyond the runner, and do not "fix" it away.**
- Validate all messages and stored data with type guards before processing.
- Block script injection / picking on `chrome://`, Chrome Web Store, and `about:` URLs.
- Shadow DOM isolation for the picker overlay.

## Known Gotchas

- **Side Panel API requires Chrome 114+.**
- **MAIN-world execution follows the page's CSP** — sites that block `unsafe-eval` will reject the runner (same limitation as a bookmarklet); surface the thrown error in the UI.
- **`chrome.tabs.sendMessage` needs the content script present** — injection is blocked on `chrome://`/Web Store/`about:` pages; handle gracefully.
- **Element picker can't pierce cross-origin iframes.**
- **CRXJS HMR quirks** — the service worker doesn't auto-reload; manually reload the extension after background changes.
- **`exactOptionalPropertyTypes` is ON** — can't assign `undefined` to optional props; omit the key instead.
- **Test environment is happy-dom, not jsdom** — some browser APIs differ.

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

## Testing

- **Framework**: Vitest + happy-dom (not Jest)
- **Structure**: `tests/` mirrors `src/`
- **Chrome mocks**: global setup in `tests/setup.ts` — mocks `chrome.runtime`, `chrome.storage.local`, `chrome.tabs`, `chrome.sidePanel`, `chrome.scripting`
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
