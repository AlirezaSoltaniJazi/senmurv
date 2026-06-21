# chromeExtensionDeveloper — Quick Reference

<!-- INJECT.md is always loaded into the agent's context (50-150 tokens max).
     It serves as a hallucination firewall — a compact cheat-sheet of the
     most critical facts the agent needs to know at all times. -->

- **FIRST**: Read [LEARNED.md](LEARNED.md) — corrections and preferences from previous sessions
- **Stack**: Chrome MV3, TypeScript 5+ strict, React 19, Vite + CRXJS, Vitest, ESLint, Prettier
- **Purpose**: QA Side Panel helper — Generate Random Data (faker), Find Element Locator (picker), Execute JS Script (MAIN-world runner)
- **Source**: `src/` — background (service-worker), content (picker), sidepanel (React UI), shared (types/messages/locators/faker-data/storage)
- **APIs**: `chrome.sidePanel`, `chrome.scripting` (`world:'MAIN'`), `chrome.storage.local`, `chrome.tabs`, `chrome.runtime`
- **Key rules**: Typed messages (discriminant union: START_PICK, ELEMENT_PICKED, RUN_SCRIPT, GET_SCRIPTS, SAVE_SCRIPT, DELETE_SCRIPT); Shadow DOM picker (`<senmurv-picker-overlay>`); pure `shared/locators.ts`; `@/` aliases; no `any`; named exports; typed `chrome.storage.local`
- **Never** (extension code): `eval()`/`new Function()`, `any`, default exports, raw chrome.storage, global CSS injection
- **ONE exception**: the Execute JS Script runner calls `new Function(code)()` inside a MAIN-world injected func — governed by the PAGE's CSP, isolated to that runner; do NOT remove it
- **Sub-agents**: code-reviewer (read-only audit), security-auditor (CSP/permissions), test-writer (Vitest generation)
- **Self-learning**: On correction -> write to LEARNED.md. On ambiguity -> check LEARNED.md first.
- **Full guide**: See [SKILL.md](SKILL.md) for conventions and [references/](references/) for detailed examples
