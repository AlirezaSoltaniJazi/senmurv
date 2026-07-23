<div align="center">

<img src="public/icons/logo.png" alt="Senmurv" width="120" height="120" />

# Senmurv

**A QA & test-automation toolkit that lives in your Chrome Side Panel.**

Generate test data · find robust locators · record & run page scripts · track time & tasks — on any page.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6)
![React](https://img.shields.io/badge/React-19-61DAFB)
![Tests](https://img.shields.io/badge/tests-Vitest-6E9F18)
![License](https://img.shields.io/badge/License-MIT-3FB950)

</div>

---

## Why Senmurv?

Writing browser tests means constantly answering the same questions: _what's a stable selector for this field? what realistic data do I type? how do I script a quick repetitive setup?_ Senmurv puts all of that one click away in the **side panel**, so it stays open while you work the page — no DevTools dance, no leaving the tab.

## Features

### 🎲 Generate Random Data

Locale-aware test data via [`@faker-js/faker`](https://fakerjs.dev/) — first/last name, phone, address, postal code, email, date of birth. Switch **country/locale** (15 supported — UK, US, Portugal, Belgium, Netherlands, Switzerland, Germany, Italy, France, Spain, Norway, Sweden, Finland, Czech Republic, Austria), toggle **phone country code** on/off, copy any field, or regenerate.

### 🎯 Find Element Locator

Pick any element on the page and get **ranked, copy-ready locators**, each with a **live match count** so you instantly know if it's unique:

```text
data-testid › formControlName › id › value / aria-label › role + name › CSS › XPath
```

- Copy-ready snippets for **Playwright, WebdriverIO, Cypress, Selenium, and Robot Framework**.
- **Angular-aware:** emits `[formcontrolname="…"]`, `aria-label`, and radio `value` selectors, and **ignores auto-generated** `mat-*` / `cdk-*` ids.
- **Test a locator** box — paste any CSS/XPath (or a framework snippet) and see how many elements it matches.

### 📝 Execute JS Script

Save, edit, **format** (pretty-print), and **import / export** your scripts (and decode `javascript:` bookmarklets), then run your own JavaScript in the page's context — like a bookmarklet manager, but in the side panel.

### ⏺ Recorder

**Record a flow** of your real interactions — clicks, inputs, selects — into an editable step list (or build steps by hand), then **Run** it, **Run from any step**, **Copy as script**, or **Save to Scripts**. Steps cover click (by text or selector), fill, select, checkbox, radio, wait, wait-for-element, press key, and run JS. A live **on-page HUD** marks each step running / done / failed as it goes. **Ad-hoc Insert** keeps the fast path — pick many form fields at once to fill live or add them as steps. Generated scripts are self-contained and replay like a bookmarklet.

### ⏱️ Track (time logging)

A stopwatch for QA work: start a task with a title + tag, then **pause / resume / stop** — with several timers at once. Review history as a **List** (grouped by day, with per-day totals — time _logged_ vs _net_ wall-clock when timers overlap) or a **Calendar**; **edit / delete** entries and **re-run** a stopped task (its runs group under one expandable task). Color-coded tags throughout.

### ✅ My Tasks

Plan work as **checklists** — a task with a subtask checkbox list, a per-task and overall **completion %**, and an **exact deadline** with a days-remaining badge. Hit **Start** on a task (or subtask) to begin timing it in **Track** without leaving the list.

### 🗒️ Notes

Jot down quick free-form notes (optional title + body), newest first.

### ⚙️ Settings & toolbar

Choose the panel **font size** (Small / Medium / Large). A toolbar **Refresh** re-syncs data across open panels, and **Open in full page** launches the whole toolkit in a browser tab.

## Install

### From source (unpacked)

```bash
npm install
npm run build          # → dist/
```

Then in Chrome:

1. open `chrome://extensions`
2. enable **Developer mode**
3. **Load unpacked** → select the `dist/` folder
4. click the Senmurv toolbar icon to open the side panel

### Chrome Web Store

_Coming soon._ Once published, this section will link to the store listing.

## Development

```bash
npm run dev            # dev build with HMR (load dist/ unpacked)
npm test               # run the Vitest suite
npm run lint           # ESLint
npm run format:check   # Prettier
npm run typecheck      # tsc --noEmit
npm run package        # build + zip → release/senmurv-<version>.zip
```

### Tech stack

| Layer    | Tech                                                           |
| -------- | -------------------------------------------------------------- |
| Language | TypeScript (strict, no `any`)                                  |
| UI       | React 19 + Chrome Side Panel                                   |
| Build    | Vite + [@crxjs/vite-plugin](https://crxjs.dev/)                |
| Tests    | Vitest + happy-dom                                             |
| APIs     | `chrome.sidePanel`, `chrome.scripting`, `chrome.storage.local` |

## Releasing

A GitHub Actions workflow (`Release`) runs lint/format/typecheck/test, builds, packages, tags the version, and creates a GitHub Release (and optionally publishes to the Chrome Web Store). See [docs/getting-started.md](docs/getting-started.md#versioning).

## Documentation

- [docs/getting-started.md](docs/getting-started.md) — install, build, load, package, versioning
- [docs/architecture.md](docs/architecture.md) — contexts, message flow, data flow
- [docs/tools.md](docs/tools.md) — the four tools in detail
- [agents.md](agents.md) — conventions & AI-agent context
- [CHANGELOG.md](CHANGELOG.md) · [PRIVACY.md](PRIVACY.md)

## Privacy

Senmurv stores your scripts and settings only in your browser (`chrome.storage.local`) and reads page content solely to perform an action you trigger. It does not collect, transmit, or sell any data. See [PRIVACY.md](PRIVACY.md).

## License

[MIT](LICENSE) © Alireza Soltani
