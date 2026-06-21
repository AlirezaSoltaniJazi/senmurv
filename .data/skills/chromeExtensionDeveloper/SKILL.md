---
name: chromeExtensionDeveloper
description: >-
  Chrome extension development skill for the senmurv project — a QA /
  test-automation helper with three Side Panel tools: Generate Random Data
  (@faker-js/faker), Find Element Locator (in-page picker), and Execute JS
  Script (run saved scripts in the page's MAIN world). Covers Manifest V3,
  service worker lifecycle, the content picker script, chrome.sidePanel,
  chrome.scripting, message passing, chrome.storage.local patterns, build
  tooling, and testing. Activates when editing manifest.json, writing the
  service worker or content picker, configuring permissions, implementing
  chrome.* APIs (sidePanel, scripting, storage, tabs), building Side Panel UI,
  the locator picker, or the script runner, or debugging extension behavior.
compatibility: 'Chrome MV3, TypeScript 5+, Vite + CRXJS, Vitest, ESLint, Prettier'
metadata:
  author: senmurv
  version: '1.0.0'
  sdlc-phase: development
allowed-tools: Read Edit Write Bash(npm:*) Bash(npx:*) Bash(node:*) Glob Grep Agent
---

<!-- SKILL.md target: <=300 lines / <3,500 tokens. Tables, rules, checklists, links only. Code examples go in references/. -->

## Before You Start

**Read [LEARNED.md](LEARNED.md) first.** It contains corrections, preferences, and conventions accumulated from previous sessions. Apply every rule in that file — they override defaults in this skill.

**Announce skill usage.** Always say "Using: chromeExtensionDeveloper skill" at the very start of your response before doing any work.

## When to Use

1. Writing or modifying `manifest.json`, the service worker, or the content picker
2. Implementing chrome.\* API calls (sidePanel, scripting, storage.local, tabs, runtime)
3. Building Side Panel UI components (Data / Locator / Scripts tabs)
4. Working on the element-locator picker or the MAIN-world script runner
5. Setting up message passing between extension contexts (content <-> service worker <-> side panel)
6. Configuring permissions, host_permissions, or CSP policies
7. Writing or updating extension tests (Vitest with chrome API mocks)

## Do NOT Use

- **General web app UI** (React/Vue pages unrelated to extension surfaces) — use frontend skill
- **Backend API server code** (Express, Fastify, REST endpoints) — use backend skill
- **General TypeScript/JavaScript** (utilities not tied to chrome.\* APIs) — use JS/TS skill

## Architecture

```
senmurv/
├── manifest.json                     # MV3 manifest — permissions, side_panel, service_worker, content_scripts
├── src/
│   ├── background/
│   │   └── service-worker.ts         # sidePanel behavior, onInstalled seeding, message hub, runs scripts via chrome.scripting
│   ├── content/
│   │   └── picker.ts                 # idle until START_PICK; hover-highlight overlay (Shadow DOM, <senmurv-picker-overlay>), click-capture, computes locators
│   ├── sidepanel/
│   │   ├── index.html                # Side Panel entry HTML
│   │   ├── main.tsx                  # React mount
│   │   ├── App.tsx                   # tab routing: Data | Locator | Scripts
│   │   └── components/               # GenerateDataTab, LocatorTab, ScriptsTab
│   ├── shared/
│   │   ├── types.ts                  # SavedScript, GeneratedData, Locale, LocatorStrategy, LocatorSuggestion, LocatorSet
│   │   ├── messages.ts               # RuntimeMessage discriminated union + sendMessage helper + type guards
│   │   ├── constants.ts              # STORAGE_KEYS, MESSAGE_TYPES, DEFAULT_LOCALE, SUPPORTED_LOCALES, LOCATOR_PRIORITY
│   │   ├── locators.ts               # PURE locator generation + ranking + per-framework snippet formatting
│   │   ├── faker-data.ts             # generateTestData(locale) via @faker-js/faker
│   │   ├── sample-scripts.ts         # seeded sample script
│   │   └── storage.ts                # typed chrome.storage.local wrapper
│   └── utils/
│       └── id.ts                     # newId('scr_') prefixed UUID
├── public/
│   └── icons/                        # Extension icons (16, 32, 48, 128)
├── tests/                            # mirrors src/ (setup.ts + per-module tests)
├── vite.config.ts                    # Vite + CRXJS plugin configuration
├── tsconfig.json                     # Strict TypeScript configuration
└── package.json                      # Dependencies, scripts, dev tools
```

**Data flow**: Side Panel UI (Data / Locator / Scripts tab) -> `RuntimeMessage` to service worker -> service worker runs scripts via `chrome.scripting.executeScript` or queries/messages tabs via `chrome.tabs` -> content picker captures an element and sends `ELEMENT_PICKED` back to the side panel. Scripts persist in `chrome.storage.local`.

**Core purpose**: A QA / test-automation helper surfaced in a Chrome Side Panel — generate realistic test data, find robust element locators via an in-page picker, and save/run JS scripts in the page's MAIN world.

## Key Patterns

| Pattern                  | Approach                                             | Key Rule                                               |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------------------ |
| Side Panel surface       | `chrome.sidePanel.setPanelBehavior` + `setOptions`   | Open on action click; one panel HTML, React-rendered   |
| Script execution         | `chrome.scripting.executeScript({ world: 'MAIN' })`  | Inject one runner func; see sanctioned exception below |
| State management         | `chrome.storage.local` with typed wrappers           | Always use typed get/set helpers, never raw API        |
| Message passing          | Typed schemas via `chrome.runtime.sendMessage`       | Every message has `type` discriminant + typed payload  |
| Service worker lifecycle | Event-driven; seed on `onInstalled`, recover on wake | Never assume SW stays alive — re-read storage on wake  |
| Content picker UI        | Shadow DOM isolation (`<senmurv-picker-overlay>`)    | Never pollute page global styles or namespace          |
| Side Panel communication | One-time messages to service worker / tabs           | Always handle `chrome.runtime.lastError`               |
| Locator generation       | PURE functions in `shared/locators.ts`               | Rank by `LOCATOR_PRIORITY`; no DOM/chrome in pure code |
| Error handling           | Result objects `{ success, data?, error? }`          | Never throw in async chrome API callbacks              |

See [references/manifest-patterns.md](references/manifest-patterns.md) for full code examples.

## Code Style

| Rule               | Convention                                                               |
| ------------------ | ------------------------------------------------------------------------ |
| Language           | TypeScript 5+ strict mode (`strict: true` in tsconfig)                   |
| Formatter          | Prettier (2 spaces, single quotes, trailing commas)                      |
| Linter             | ESLint with @typescript-eslint, no-floating-promises                     |
| Import style       | Path aliases (`@/` for `src/`) — never deep relative (`../../`)          |
| Import order       | builtin -> external -> @/ aliases -> relative (auto-sorted)              |
| Type hints         | Explicit return types on all exported functions                          |
| Naming — files     | `kebab-case.ts` for modules, `PascalCase.tsx` for components             |
| Naming — types     | `PascalCase` (e.g., `SavedScript`, `LocatorSuggestion`)                  |
| Naming — functions | `camelCase` with descriptive verbs (`generateTestData`, `handleMessage`) |
| Naming — constants | `SCREAMING_SNAKE_CASE` (e.g., `STORAGE_KEYS`, `LOCATOR_PRIORITY`)        |
| Naming — messages  | `SCREAMING_SNAKE_CASE` type discriminants (`START_PICK`, `RUN_SCRIPT`)   |
| Exports            | Named exports only — never default exports                               |
| Strings            | Single quotes (enforced by Prettier)                                     |
| No `any`           | Use `unknown` + type guards — `any` is forbidden                         |
| Async              | Always `async/await` — never raw `.then()` chains                        |

See [references/code-style.md](references/code-style.md) for full formatting examples.

## Common Recipes

1. **Add a sample/seeded script**: Add entry in `shared/sample-scripts.ts` -> seed it on `onInstalled` in `background/service-worker.ts` -> persist via the `shared/storage.ts` wrapper to `chrome.storage.local`
2. **Add a locator strategy**: Add the strategy to `LocatorStrategy` in `shared/types.ts` -> add it to `LOCATOR_PRIORITY` in `shared/constants.ts` -> implement its PURE generation/ranking in `shared/locators.ts` -> add a per-framework snippet formatter -> test in `tests/shared/locators.test.ts`
3. **Add a new chrome API permission**: Add to `manifest.json` permissions array -> add justification comment -> update `references/manifest-patterns.md` -> test in isolation
4. **Add a Side Panel tab**: Create `sidepanel/components/FeatureTab.tsx` -> register it in `App.tsx` tab routing -> add any new message type it needs to `shared/messages.ts`
5. **Add storage migration**: Create versioned migration in `shared/storage.ts` -> run on `chrome.runtime.onInstalled` with `reason === 'update'` -> validate before + after
6. **Add a new message type**: Add type to `MESSAGE_TYPES` -> add a member to the `RuntimeMessage` union + a type guard in `shared/messages.ts` -> add a handler in the service worker (or picker) -> add a sender helper -> update tests

## Testing Standards

| Rule             | Convention                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| Framework        | Vitest with `@anthropic-ai/chrome-types` or `jest-chrome` mocks                                   |
| Test file naming | `*.test.ts` co-located or in `tests/` mirror                                                      |
| Chrome API mocks | Global mock setup in `tests/setup.ts`                                                             |
| DOM testing      | `happy-dom` for picker / DOM-dependent tests                                                      |
| E2E              | Playwright with `--load-extension` for integration                                                |
| What to mock     | All chrome.\* APIs (sidePanel, scripting, storage.local, tabs, runtime), DOM when expensive       |
| What NOT to mock | Pure functions (`shared/locators.ts`, `shared/faker-data.ts`), type construction, message schemas |
| Coverage target  | Service worker logic 80%+, message handlers 90%+; pure modules (locators, faker-data) 90%+        |

See [references/test-patterns.md](references/test-patterns.md) for full test examples.

## Performance Rules

- Use `chrome.scripting.executeScript` for on-demand script runs — keep the picker idle until `START_PICK`
- Minimize service worker wake-ups — batch storage operations
- Keep the picker dormant until activated — attach hover/click listeners only after `START_PICK`, detach after capture
- Debounce hover-highlight in the picker — pointer/mouseover events fire rapidly
- Avoid storing large objects in `chrome.storage.sync` (100KB quota) — use `.local` for saved scripts
- Lazy-load Side Panel tab components — keep first paint fast
- Keep locator generation pure and synchronous — no DOM walks beyond the picked element's ancestry

## Security

- Never use `eval()`, `new Function()`, or inline scripts in **extension** code — CSP (`script-src 'self'`) forbids them in MV3
- Validate all messages with type guards before processing — reject unknown message types
- Restrict `externally_connectable` to specific origins — never use wildcard
- Minimize `web_accessible_resources` exposure — only expose what the content picker needs
- Sanitize all user input before injecting into DOM (even in Shadow DOM)
- Prefer `activeTab` over broad `<all_urls>`; senmurv needs `<all_urls>` for the picker/script-runner — justify it
- Never store sensitive data in `chrome.storage.sync` — it syncs to Google account

**Sanctioned `new Function` exception (do NOT "fix" it away):** The **Execute JS Script** tool runs user-provided code in the page's MAIN world via `chrome.scripting.executeScript({ target, world: 'MAIN', func: runUserScript, args: [code] })`, and the injected `runUserScript(code)` calls `new Function(code)()`. This is the extension's whole purpose. It runs in the **page's** context governed by the **page's CSP** — exactly like a `javascript:` bookmarklet — NOT the extension's CSP; extension pages keep `script-src 'self'`. It is isolated to that single injected runner function and suppressed with an inline `// eslint-disable-next-line @typescript-eslint/no-implied-eval` plus a justifying comment. The general "no eval in extension code" rule still applies everywhere else — this exception must never be widened beyond the script runner.

See [references/security-checklist.md](references/security-checklist.md) for detailed checklists.

## Anti-Patterns

| Anti-Pattern                                 | Why It's Wrong                                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| `eval()`/`new Function()` in extension code  | Blocked by MV3 CSP — fails silently (the ONE exception is the MAIN-world script runner) |
| Storing state in service worker memory       | SW terminates unpredictably — state is lost                                             |
| Using `any` type for messages                | Loses type safety — bugs in message handling go undetected                              |
| Keeping the picker's listeners always on     | Wasteful and intrusive — stay idle until `START_PICK`, detach after capture             |
| Raw `chrome.storage.get/set` without types   | No validation — corrupt data silently breaks extension                                  |
| DOM/chrome calls inside `shared/locators.ts` | Must stay PURE and unit-testable — keep side effects in the picker                      |
| Default exports                              | Breaks tree-shaking and makes refactoring harder                                        |
| Deep relative imports (`../../../`)          | Fragile and unreadable — use `@/` path aliases                                          |
| Injecting styles without Shadow DOM          | Pollutes host page CSS — breaks both the picker overlay and page                        |
| Widening the `new Function` exception        | The MAIN-world runner is the only sanctioned use — never reuse it elsewhere             |

## Code Generation Rules

1. **Read before writing** — always read the target file and related modules before making changes
2. **Match existing style** — follow Prettier, ESLint, and import conventions exactly
3. **Type everything** — exported functions need explicit return types, messages need discriminants
4. **Handle errors** — every chrome API call checks `chrome.runtime.lastError` or uses try/catch
5. **Test alongside** — when creating a module, create its test file with chrome API mocks
6. **On correction** — acknowledge, restate as rule, apply to all subsequent actions, write to [LEARNED.md](LEARNED.md)
7. **On ambiguity** — check [LEARNED.md](LEARNED.md) first, then project files, ask ONE question, write preference to [LEARNED.md](LEARNED.md)

## Adaptive Interaction Protocols

Corrections and preferences persist via [LEARNED.md](LEARNED.md).

| Mode       | Detection Signal                                                                   | Behavior                                                              |
| ---------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Diagnostic | "manifest error", "SW terminated", "picker not injecting", "side panel won't open" | Read error context, trace to root cause, fix with minimal changes     |
| Efficient  | "another locator strategy like X", "add a side-panel tab", "same pattern as Y"     | Minimal explanation, replicate existing patterns, apply conventions   |
| Teaching   | "what does chrome.runtime do", "explain chrome.sidePanel / scripting"              | Explain with references to project examples, link to references/      |
| Review     | "review manifest", "check permissions", "audit CSP"                                | Read-only analysis, check against conventions, report without changes |

**Self-Learning**: All learnings are **written** to LEARNED.md — not suggested, written:

- Corrections -> `## Corrections` section
- Preferences -> `## Preferences` section
- Discovered conventions -> `## Discovered Conventions` section
- Format: `- YYYY-MM-DD: rule description`

## Sub-Agent Delegation

| Agent            | Role                                             | Spawn When                                          | Tools                          |
| ---------------- | ------------------------------------------------ | --------------------------------------------------- | ------------------------------ |
| code-reviewer    | Read-only Chrome extension code analysis         | PR review, architecture compliance, manifest audit  | Read Glob Grep                 |
| security-auditor | CSP and permissions audit for extension security | Security review, permission audit, CSP verification | Read Glob Grep                 |
| test-writer      | Test generation following project conventions    | "write tests for X", new script creation, coverage  | Read Edit Write Glob Grep Bash |

**Delegation rules**: Spawn when task is self-contained and won't need follow-up context. Never delegate tasks requiring architectural decisions. See [agents/](agents/) for full definitions.

## Freedom Levels

| Level             | Scope                                                                                | Examples                                                      |
| ----------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| **MUST** follow   | Typed messages, no `any`, pure `shared/locators.ts`, Shadow DOM picker, path aliases | "MUST type all messages", "MUST keep locator generation pure" |
| **SHOULD** follow | Named exports, explicit return types, co-located tests, chrome.storage wrappers      | "SHOULD export named", "SHOULD wrap chrome.storage calls"     |
| **CAN** customize | Side Panel component structure, test organization, tab layout                        | "CAN restructure tab components", "CAN group tests by file"   |

## References

| File                                                                           | Description                                              |
| ------------------------------------------------------------------------------ | -------------------------------------------------------- |
| [LEARNED.md](LEARNED.md)                                                       | **Auto-updated.** Corrections, preferences, conventions  |
| [INJECT.md](INJECT.md)                                                         | Always-loaded quick reference (hallucination firewall)   |
| [references/manifest-patterns.md](references/manifest-patterns.md)             | Manifest configuration patterns and examples             |
| [references/message-passing-guide.md](references/message-passing-guide.md)     | Typed message schemas, routing, port lifecycle examples  |
| [references/service-worker-patterns.md](references/service-worker-patterns.md) | Persistence, lifecycle, state recovery patterns          |
| [references/code-style.md](references/code-style.md)                           | Import order, TypeScript conventions, full examples      |
| [references/security-checklist.md](references/security-checklist.md)           | Per-permission, per-CSP, per-content-script checklists   |
| [references/common-issues.md](references/common-issues.md)                     | Troubleshooting common Chrome extension pitfalls         |
| [references/test-patterns.md](references/test-patterns.md)                     | Vitest setup, chrome mock patterns, DOM testing examples |
| [references/ai-interaction-guide.md](references/ai-interaction-guide.md)       | Anti-dependency strategies, correction protocols         |
| [content-script-template.ts](content-script-template.ts)                       | Copy-paste content script template                       |
| [assets/manifest-template.json](assets/manifest-template.json)                 | manifest.json starter template                           |
| [scripts/validate-chrome-extension.sh](scripts/validate-chrome-extension.sh)   | Manifest + structure convention checker                  |
| [agents/code-reviewer.md](agents/code-reviewer.md)                             | Read-only Chrome extension code analysis agent           |
| [agents/security-auditor.md](agents/security-auditor.md)                       | CSP and permissions audit agent                          |
| [agents/test-writer.md](agents/test-writer.md)                                 | Test generation agent                                    |
