# Changelog

All notable changes to Senmurv are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and the project follows
[Semantic Versioning](https://semver.org/).

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

[0.2.0]: https://github.com/AlirezaSoltaniJazi/senmurv/releases/tag/v0.2.0
[0.1.0]: https://github.com/AlirezaSoltaniJazi/senmurv/releases/tag/v0.1.0
