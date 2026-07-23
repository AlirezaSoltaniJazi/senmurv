# Changelog

All notable changes to Senmurv are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and the project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Recorder — enable / disable a step** — toggle any step off to keep it in the
  flow (and in the saved script) but skip it at run time; it shows dimmed in the
  list, greyed in the run HUD, and the run count reflects only enabled steps.
- **Recorder — duplicate a step** — copy a step with all its settings directly
  below it; newly added or duplicated steps scroll into view and briefly
  highlight so they're easy to find in a long flow.
- **Recorder — the page follows the run** — each step scrolls its target element
  into view before acting on it, and while a target isn't found the flow scrolls
  the page to hunt for it, so lazy or below-the-fold fields render and get filled
  instead of timing out.
- **Scripts — drag to reorder** — drag the handle on a saved script to reorder
  the list; the new order is saved.
- **Settings — larger text** — added an **X-Large** font preset and a
  **fine-tune slider** for exact UI scaling (80–170%), alongside Small / Medium /
  Large.

### Changed

- **Recorder — random data re-randomizes on every run** — a Fill field set to a
  random generator (name, email, phone, postal code, date, number, UUID, …) now
  emits a `{random:…}` token that produces fresh, valid data on **every run,
  including saved scripts**, instead of freezing a single value when saved.
  Static fields also accept inline tokens such as `{today+1}`, `{random:email}`,
  and `{random:number:1-99}`.
- **Recorder — name your saved flow** — "Save to Scripts" now requires a name
  (pre-filled when you open a script via **Customize**); saving under a name that
  already exists warns and lets you **Overwrite** it or **Save as a copy**
  (auto-numbered).

### Fixed

- **Valid mobile phone numbers** — random phone data no longer produces landline,
  freephone, or too-short numbers that failed "valid mobile" validation; it now
  generates real mobile numbers per locale (UK and US verified).
- **Track — header overlap on scroll** — the sticky panel header now stays above
  scrolled content, so task rows and inputs no longer bleed over it.
- **Tab switches start at the top** — moving between side-panel tabs no longer
  inherits the previous tab's scroll position.

## [0.4.0] - 2026-07-22

### Added

- **Track — time logging** — a stopwatch for QA work: start a task with a title
  and tag, then **pause / resume / stop** (a task accumulates multiple work
  intervals into one total). Run **several timers at once** and see all
  currently active ones, then browse history in a **List** view (grouped by day
  with a per-day total) or a **Calendar** view (per-day totals with tag dots;
  click a day to drill in). **Edit** a task's title, tag, and start/end times or
  **delete** it, with **color-coded tags** across both views.
- **Track — re-run** — restart a stopped task; its runs group under an
  expandable parent task, and each day's total stays exact.
- **Track — logged vs net time** — each day shows the total time **logged**
  across tasks (concurrent timers add up) and, when timers overlapped, the
  **net** wall-clock time with overlapping time merged and counted once.
- **My Tasks — checklists** — plan work as tasks with a **subtask checkbox
  list**. The parent auto-completes when all subtasks are done (and toggling it
  checks/unchecks them all). See a **per-task and overall completion %**, set an
  **exact deadline** per task, and get a **remaining-days** badge (colored when
  due soon or overdue).
- **My Tasks → Track** — press **Start** on a task or any subtask to begin
  timing it in Track without leaving the list; the card shows live elapsed time
  and a Stop button. The Start button hides once that task or subtask is marked
  complete.
- **Notes** — a notes tab to jot things down: create, edit, and delete
  free-form notes (an optional title plus a body), listed newest-first.
- **Settings** — choose the panel **font size** (Small / Medium / Large); the
  choice persists and applies in the full-page view too.
- **Refresh** — a toolbar button re-pulls data from storage, so a panel open in
  one window picks up changes made in another.
- **Open in full page** — a toolbar button opens the whole toolkit in a browser
  tab for a roomier view.
- **Recorder — record a flow** — press **Record** and your clicks, inputs, and
  selects on the page are captured as editable steps (top frame), or build steps
  by hand. New step types beyond click / fill / select / checkbox / radio:
  **Click element** (by CSS selector), **Press key**, **Wait for element**, and
  **Run JS**. **Ad-hoc Insert** keeps the fast path — pick many fields at once to
  fill live or add them as steps. Then **Run** the whole flow, **Run from any
  step**, **Copy as script**, or **Save to Scripts**.
- **Recorder — live run HUD** — running a flow shows an on-page panel that marks
  each step running / done / failed in real time (with the error inline),
  replacing the blocking end-of-run alert. Works for saved scripts too.
- **Stable selectors on Dynamics 365 / Power Apps** — the element picker now
  ignores session-generated ids (any id embedding a GUID) and prefers the stable
  `data-id`, so recorded and suggested selectors survive page reloads (also
  improves the Locator tool).

### Changed

- The **Fill** tab is now the unified **Recorder** — the old **Fields / Flow**
  toggle is gone; both are folded into one step list.
- A flow **Click button** step that can't find its target now **fails** (red in
  the run HUD) instead of silently passing.
- Recorder steps are **kept while you switch side-panel tabs** — an in-progress
  flow is no longer lost when you leave the tab.
- The transient **"Saved."** confirmation in Track now clears itself after a few
  seconds instead of lingering.

## [0.2.0] - 2026-06-22

### Added

- **Scripts import / export** — selectively export saved scripts to a versioned
  JSON file and import them back, choosing exactly which to bring in and how to
  resolve clashes (**Overwrite existing** or **Keep both** with auto-renaming).
- **Format script** — one-click pretty-print of script code (handy for decoded
  one-line bookmarklets), powered by js-beautify.
- **More countries / locales** — Portugal, Belgium, Netherlands, Switzerland,
  Norway, Sweden, Finland, Czech Republic, and Austria (each with the correct
  phone dialing code), alongside the existing United Kingdom, United States,
  Germany, Italy, France, and Spain.
- **Fill → Flow: random-value generators** — a fill step can now generate a
  random value (first/full name, email, phone, address, postal code, etc.) on
  each run, with a per-flow locale selector, instead of only a static value.
- **Fill → Flow: "nth match" targeting** — when a CSS selector matches several
  elements, target a specific one by index (e.g. a repeated field in a second
  form section).
- **Fill → Flow: editable CSS selector** per step, shown alongside the field
  label so the locator is always visible and editable.

### Changed

- **Faster startup** — locale data for the Data/Fill tools now loads on demand
  per locale rather than bundling all locales up front, roughly halving the
  initial parse for the default locale.
- **Flow runs are best-effort** — a step whose target can't be found is skipped
  and reported in an end-of-run summary instead of aborting the whole flow.
- **Field-by-label is framework-agnostic** — label targeting now matches
  standard `<label>`, `aria-label`/`aria-labelledby`, `placeholder`, and common
  field containers, not only Angular Material's `mat-label`.
- Clearer, product-neutral placeholders throughout the Flow step editor.

### Fixed

- More reliable dropdown/checkbox handling in flows: stale overlays are
  dismissed before opening a select, selects open via `mousedown`+click,
  options are detected by bounding box (so fixed-position overlay panels are
  seen), checkboxes can be matched by visible text, and a disabled select is
  reported distinctly from an empty one.

## [0.1.0] - 2026-06-21

Initial release. A Manifest V3 Chrome extension with a Side Panel QA toolkit.

### Added

- **Generate Random Data** — locale-aware test data (first/last name, phone,
  address, postal code, email, date of birth) via `@faker-js/faker`, with a
  locale switcher (default `en_GB`), per-field copy, regenerate, and a
  region-aware phone toggle (with/without country dial code).
- **Find Element Locator** — in-page element picker with ranked locator
  suggestions, each annotated with live **match count / uniqueness**, plus a
  **Test a locator** box that accepts raw CSS/XPath or pasted framework
  snippets. Copy-ready snippets for **Playwright, WebdriverIO, Cypress,
  Selenium, and Robot Framework**. Angular-aware: emits `[formcontrolname=…]`
  and `aria-label`/radio-`value` selectors and ignores auto-generated
  `mat-*`/`cdk-*` ids.
- **Execute JS Script** — save, edit, and import (`javascript:` bookmarklets)
  scripts and run them in the page's MAIN world via `chrome.scripting`.
- **Fill (script generator)** — continuous multi-pick of form fields with
  automatic field-type detection (resolving Material labels/wrappers to their
  control) and a random-data generator per field; **Generate & Fill** live,
  **Copy as script**, or **Save to Scripts**.
- **Fill → Flow mode** — a step builder for multi-step workflows: ordered
  click / wait / fill / select (specific option, first, or random) / checkbox
  steps, with element picking for targets; **Run flow**, **Copy as script**, or
  **Save**. Generated fill/flow scripts round-trip via the Scripts tab
  **Customize** button.
- Chrome Side Panel UI, MV3 service worker, content picker, a Vitest test
  suite, and CI (lint / format / typecheck / test / build) plus a release
  workflow.

[Unreleased]: https://github.com/AlirezaSoltaniJazi/senmurv/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/AlirezaSoltaniJazi/senmurv/releases/tag/v0.4.0
[0.2.0]: https://github.com/AlirezaSoltaniJazi/senmurv/releases/tag/v0.2.0
[0.1.0]: https://github.com/AlirezaSoltaniJazi/senmurv/releases/tag/v0.1.0
