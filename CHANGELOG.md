# Changelog

All notable changes to Senmurv are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and the project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Cookies tab** — see every cookie for the current site, **including HttpOnly
  ones** that page JavaScript can never read, with its path, expiry and
  Secure / HttpOnly flags. Search, **edit** a cookie (value, path, expiry,
  Secure, HttpOnly, SameSite), **add** one, **delete** one, or delete them all.
  `domain` is derived from the tab so `__Host-` / `__Secure-` and
  `SameSite=None` rules can't be violated by accident — the editor says why
  before Chrome silently refuses a write.
  - Requires the new **`cookies`** permission; it is the only way to reach
    HttpOnly cookies at all.
- **Storage tab** — a viewer/editor for the site's **localStorage** and
  **sessionStorage**: search keys and values, edit a value inline (with a
  **Pretty JSON** button for stringified-JSON values), add a key, delete one, or
  clear the whole area behind a self-disarming confirm.
- **Value profiles (Cookies + Storage)** — save a key plus the values you switch
  between while testing (locales, feature flags, auth states), then apply each in
  one click; the live value is shown and the active choice highlighted. Optional
  prefix/suffix wrapping (e.g. JSON quoting) with a live preview, and an enable
  toggle. Ported from the Phantom Mock extension's cookie/storage profiles.
- **Data + Fill/Recorder → Region / County** — a new generator for a
  region/county name, offered in the Fill/Recorder generator menus and added as a
  field in **Generate Random Data**.
- **Fill/Recorder → Number by digit count** — configure a number field's
  **min/max number of digits** (e.g. 3–5 digits → a 3-to-5-digit number).
- **Fill/Recorder → name-synced Email** — **Sync FName / Sync LName** toggles make
  an email match the flow's name fields: a flow generates one person per run, so
  First / Last / Full name and the email all agree (`first.last.NNN@…`).
- **Tools → JSON Formatter** — pretty-print or minify JSON and explore it as a
  collapsible, colour-coded tree; strict-JSON parse errors are shown. Runs
  entirely locally — nothing is sent anywhere.
- **Tools → Auto refresh** — reload the tab you start it on every N seconds
  (presets 5 / 10 / 30 / 60 s, or custom). Keeps running while you use other panel
  tools; stops on **Stop** or when you close the panel.
- **Settings → Flow popup auto-close** — set how long the on-page run popup (HUD)
  stays after a flow finishes before it disappears (default 3 s).
- **Settings → Element find timeout** — set how long each flow step waits for its
  element before giving up (default 10 s); a **Wait for element** step with its
  own timeout still wins.
- **Settings → Track tags** — see every tag with its colour and usage count, and
  **rename** it (updates every entry), **delete** it (un-tags those entries but
  keeps them), or **recolour** it — recolours show everywhere a tag appears.
- **Recorder → Stop** — a **Stop** button appears while a flow runs and aborts it
  gracefully between steps (and mid-wait), instead of only pausing between steps.
- **Scripts → Run / Stop** — each script's **Run** button toggles to **Stop**
  while it runs and reverts to **Run** the moment it finishes; **Stop** reloads
  the page (the only reliable way to halt a plain JS script). The toolbar keeps a
  **Stop (reloads page)** button too.

### Changed

- **Scripts → row layout** — action buttons collapse to **icons** when the panel
  is narrow and show their text labels again when there is room; the **Run/Stop**
  icons are pixel-centred and matched in size; and nested scripts sit closer to
  their drag handle (less lead-in space before the checkbox).

## [0.6.0] - 2026-07-29

### Added

- **Track → Clear all** — a one-click button (with a confirm) to delete every
  tracked time entry at once, instead of removing them one by one.
- **Scripts → folders** — organise saved scripts into **folders** (one level:
  folder → scripts). **New folder** creates a folder you can rename inline; drag a
  script **onto a folder** to file it there, drop **near a row's top edge** to
  reorder, and use a script's **↥** button to move it back to the top level.
  Folders show a collapse caret and a script count; deleting a folder frees its
  scripts back to the top level. Grouping persists, and folders are never exported
  or run.
- **Recorder → step names** — an optional **name** on any step, shown in the
  on-page run popup (HUD) in place of the step kind, so a running flow reads in
  your words.
- **Recorder → step numbers & move-to** — each step box shows its **position
  number** (`#1, #2, …`), and a new **Move** control (⇄) relocates a step to
  **before/after another step** picked from a dropdown — alongside the existing
  ▲▼ nudges.
- **Data + Fill/Recorder → Region / County** — a new generator for a
  region/county name, offered in the Fill/Recorder generator menus and added as a
  field in **Generate Random Data**.
- **Fill/Recorder → Number by digit count** — configure a number field's
  **min/max number of digits** (e.g. 3–5 digits → a 3-to-5-digit number).
- **Fill/Recorder → name-synced Email** — **Sync FName / Sync LName** toggles make
  an email match the flow's name fields: a flow generates one person per run, so
  First / Last / Full name and the email all agree (`first.last.NNN@…`).
- **Tools → JSON Formatter** — pretty-print or minify JSON and explore it as a
  collapsible, colour-coded tree; strict-JSON parse errors are shown. Runs
  entirely locally — nothing is sent anywhere.
- **Tools → Auto refresh** — reload the tab you start it on every N seconds
  (presets 5 / 10 / 30 / 60 s, or custom). Keeps running while you use other panel
  tools; stops on **Stop** or when you close the panel.
- **Settings → Flow popup auto-close** — set how long the on-page run popup (HUD)
  stays after a flow finishes before it disappears (default 3 s).
- **Settings → Element find timeout** — set how long each flow step waits for its
  element before giving up (default 10 s); a **Wait for element** step with its
  own timeout still wins.
- **Settings → Track tags** — see every tag with its colour and usage count, and
  **rename** it (updates every entry), **delete** it (un-tags those entries but
  keeps them), or **recolour** it — recolours show everywhere a tag appears.
- **Recorder → Stop** — a **Stop** button appears while a flow runs and aborts it
  gracefully between steps (and mid-wait), instead of only pausing between steps.
- **Scripts → Run / Stop** — each script's **Run** button toggles to **Stop**
  while it runs and reverts to **Run** the moment it finishes; **Stop** reloads
  the page (the only reliable way to halt a plain JS script). The toolbar keeps a
  **Stop (reloads page)** button too.

### Changed

- **Scripts → row layout** — action buttons collapse to **icons** when the panel
  is narrow and show their text labels again when there is room; the **Run/Stop**
  icons are pixel-centred and matched in size; and nested scripts sit closer to
  their drag handle (less lead-in space before the checkbox).

## [0.5.1] - 2026-07-26

### Added

- **Tools tab** — a new side-panel tab that will host seven page-inspection
  tools: Bypass, Site data, Measure, Colour, Tab order,
  Accessibility and Fonts. This release lands the tab, its launcher and the
  shared plumbing; each tool arrives in a later release.
- **Tools → Bypass** — strips the client-side locks an app puts on
  its own form so you can drive it in a test: `disabled`, `readonly`, their ARIA
  equivalents, `required`, `pattern`, length limits, and disabled dropdown
  options. Optionally reveals hidden elements, reveals password fields, closes
  modal dialogs, and descends into open shadow roots — all off by default.
  - **Restore** puts every changed attribute back exactly as it was, telling an
    absent attribute apart from a present empty one.
  - **Sticky mode** re-applies the bypass when the page re-renders, for apps
    that put their own locks back.
  - **Bypass Dynamics form** appears on Dynamics 365 / Power Apps pages and
    additionally uses the Xrm client API to make required fields optional and
    reveal hidden controls, tabs and sections — the behaviour Level Up for
    Dynamics CRM provides, which no DOM-level pass can reach.
  - **Save as a script** hands the current settings to the Scripts tab as a
    standalone script, so the bypass can be re-run after every page load.
- **Tools → Accessibility** — a hand-rolled WCAG **A / AA / AAA** scanner (no
  axe-core dependency) that groups findings into **failures** and **needs
  review**, each tagged with its success-criterion number, a fix, a help link
  and copy-ready locators. Export as TXT / CSV / JSON.
  - ~25 checks across images/alt, form labels, structure, links, keyboard
    reachability, ARIA (roles, references, required attributes, duplicate ids),
    language, and **text contrast** (reusing the same oracle-verified maths as
    the Colour tool, so it agrees with axe/Lighthouse).
  - Every heuristic is labelled **needs-review**, never a hard fail, and the tool
    states plainly that automated checks catch only ~30–40% of WCAG issues — it
    never claims conformance. The rule catalogue and its false-positive guards
    were adversarially reviewed before implementation.
- **Tools → Tab order** — visualise the page's keyboard tab sequence as numbered
  badges drawn on each stop, plus an ordered side-panel list (tag, accessible
  name, tabindex, shadow marker). Click a stop for copy-ready locators;
  export the sequence as TXT / CSV / JSON.
  - Flags **positive tabindex**, **missing accessible name**, **offscreen** stops
    and **tab order ≠ visual order**.
  - Correctly handles the flattened shadow tree (`<slot>`), per-scope positive
    tabindex, `delegatesFocus`, radio groups and disabled/inert exclusions — the
    computed order was verified to match Chrome's actual Tab-key order exactly.
  - Badges stay aligned while you scroll, a **Clear overlay** button removes them
    without leaving the tool, and a **Rescan** prompt appears when the page
    changes. (The overlay is now also reliably removed when you switch away from
    the tool.)
- **Tools → Colour** — hover an element for its colours in every format (HEX,
  HEX8, RGB, HSL, HWB) and its **WCAG contrast** verdict (AA / AAA at normal and
  large text), click to pin it with copy-ready locators. Also a **screen
  eyedropper** (where the browser supports it) to sample any pixel.
  - The effective background is resolved by compositing ancestor
    `background-color`s; background images, gradients, `::before` overlays and
    non-sRGB (`oklch`/`lab`/`display-p3`) colours are **flagged, not guessed**.
  - Contrast maths are shared with the coming Accessibility tool and were
    verified against independently-computed reference values.
- **Tools → Measure** — measure the page in pixels three ways: **Element**
  (hover for the box model — content / border / margin boxes and each side),
  **Region** (drag a rectangle, in viewport and page coordinates), and
  **Distance** (click two elements for the gap and centre-to-centre distance).
  - A pinned element also produces copy-ready **locators** and **size
    assertions** for Playwright / Cypress / WebdriverIO / Selenium / Robot
    Framework — with the content-box vs border-box distinction handled correctly,
    so a CSS-property assertion never gets a bounding-box number by mistake.
- **Tools → Site data** — clears the current origin's storage so you can retest
  a flow or check a first-run experience, without a trip to `chrome://settings`
  and without any new permission.
  - Shows a per-origin breakdown (Cache Storage, IndexedDB, local/session
    storage, cookies, service workers) using the page's own quota estimate.
  - **Bust cache** (Cache Storage + service workers) re-fetches the app without
    logging you out; **Fresh visitor** clears everything for a first-run test.
  - **Clear + hard reload** also bypasses the HTTP cache on reload — the one way
    to reach it, since no extension API can clear the HTTP cache per-origin.
  - A session-destroying selection arms a two-step confirm, and the summary
    states up front that HttpOnly cookies survive and that the HTTP cache size
    is not something Chrome exposes to extensions.
- **Tools → Fonts** — hover any text for its typography and, crucially, the
  **typeface that actually renders** — not just the CSS `font-family` stack but
  which family in it the browser really used, labelled **web font** / **local /
  system** / **generic fallback**. Click to pin it with copy-ready locators.
  - Reads size (px / pt / rem), weight (value + name), style, line height (px and
    ratio), letter/word spacing, transform, variant and colour, and emits a
    copy-ready CSS `font` **shorthand**.
  - Resolves the rendered face with a canvas width test against all three generic
    baselines and an `@font-face` walk (surfacing the web font's `src`), so it
    does not fall for `document.fonts.check` returning true for unknown families.
    The ordering logic is pure and unit-tested; the DOM probes are injected.
- **Tools → Region** — make this page's JavaScript read **another country's
  clock, timezone, locale and geolocation**, to test date/time rendering, `Intl`
  formatting and location-aware UI as if you were there. Pick a region and Apply;
  Restore puts it back. It overrides `Date`'s timezone methods, `Intl` +
  `toLocaleString` defaults, `navigator.language(s)` and `navigator.geolocation`
  via a reversible MAIN-world shim — **no new permission**.
  - **Honest by design**: it is **client-side only**. Your IP is unchanged (a
    server's IP geolocation still sees your real country) and so is the
    `Accept-Language` request header, so a site that decides locale/region from
    those won't switch. It affects code that runs after you apply it, and a page
    reload clears it — all stated in the panel.
- **Recorder → Export as spec** — turn a recorded flow into a **real, runnable
  test file** for Playwright, Cypress, WebdriverIO, Selenium or Robot Framework —
  not the MAIN-world replay script, but a paste-ready `.spec` wrapped in the
  framework's `describe`/`test` scaffold with a `goto`/`visit` to the current
  page. Pick the framework, copy the code; the suggested filename and each step
  (click, fill, press, select, check, wait, run-JS) map to that framework's
  idiom, disabled steps are skipped, and single quotes are escaped. It's
  best-effort — random-value fills become a labelled placeholder and you still add
  your assertions (the **Assertions** tool helps) — but it collapses
  record-to-committed-test into one click. The codegen is pure and its output is
  pinned by tests.
- **Tools → Validation** — click a form field to read **every client-side
  validation rule it declares** — `required`, min/maxlength, min/max/step,
  `pattern` (explained in plain English, e.g. `\d{5}` → "exactly 5 digits"),
  `inputmode`, `autocomplete` — plus its live `ValidityState`, and get a
  **boundary-test checklist** generated from those constraints (empty, over/under
  length, below-min/above-max, off-step, format and unicode edge cases) with a
  concrete example value to try per case and an expected accept/reject/review.
  Copy any value or the whole checklist. Knowing a form's rules before testing it
  is half the battle; this reads them in one click instead of from source.
- **Tools → Stacking** — click a point to see every element stacked under it,
  top to bottom, and **which one actually receives the click**. It flags when a
  non-interactive overlay (often an invisible, `opacity: 0` backdrop) is sitting
  on top of a clickable element and stealing its clicks — the direct cause of the
  "element click intercepted / not clickable at point" failure that flakes
  Playwright, Cypress and Selenium tests. Each layer shows its `z-index`,
  position, opacity and `pointer-events`, plus a copy-ready locator, so you can
  grab the interceptor's selector and fix the test.
- **Tools → Assertions** — click any element to snapshot its state — text, form
  value, checked, enabled/disabled, visible, and a curated set of attributes —
  and get **copy-ready assertions** for Playwright, Cypress, WebdriverIO,
  Selenium and Robot Framework, each targeted by the element's recommended
  locator (`toHaveText` / `toHaveValue` / `toBeChecked` / `toBeEnabled` /
  `toBeVisible` / `toHaveAttribute` and the equivalents). A recorded flow with no
  assertions isn't a test — this fills that gap. State is read on mouse-down, so a
  checkbox reports its real state instead of the value it toggles to on click.
- **Tools → Harden selector** — paste a fragile selector (a DevTools "Copy
  selector" chain, a long `nth-child` CSS, an absolute XPath) and get a **0–100
  robustness score**, the **named reasons** it will break (positional `nth-child`,
  build-hashed / CSS-in-JS classes, framework-generated ids, absolute paths,
  text dependence, deep chains), and the **robust replacement** the picker would
  recommend — resolved against the live page. Turns the locator list's "here are
  options" into "paste what you have, here's why it flakes, use this instead."
- **Locator → Highlight matches** — the "Test a locator" box gains a **Highlight**
  toggle that outlines and numbers **every** element a CSS/XPath matches directly
  on the page, not just a count, and updates live as you edit the selector. **‹ ›**
  scroll through the matches one at a time ("match 3 of 5"). It answers the daily
  question a bare count can't — _which_ of the N matches are they? A broad selector
  is capped at the first 200 badges (the true match count is still reported), and
  the badges stay aligned as you scroll.
- **Tools → JWT decoder** — paste a JWT and read its header and claims as an
  annotated table (registered claims like `iss`/`sub`/`exp` are labelled, and
  `exp`/`nbf`/`iat` show their ISO date), with a live **expired / valid / not-yet-valid**
  badge counting down from the token's own `exp`/`nbf`. The signature is shown
  but **never verified** (that needs the signing key), and the token is decoded
  entirely in the panel — it never leaves your machine, unlike pasting it into an
  online decoder. Works on any page (it needs no page access).
- **Highlight an element on the page** — a `HIGHLIGHT_ELEMENT` message scrolls
  an element into view and outlines it, so a findings list in the panel can
  point at the thing it is describing.

### Changed

- **One in-page mode at a time** — the content script now routes every mode
  (pick element, pick fields, record, and the new Tools modes) through a single
  arbiter that stops the outgoing mode before starting the next one. This
  replaces the pairwise guards and fixes a case where switching mode while one
  was already active left the previous overlay and cursor in place.
- **The Tools modes load on demand** — they ship as a separate chunk fetched the
  first time you open a tool, so ordinary page loads are unaffected.
- `file://` and `view-source:` pages now report the same clear "this page does
  not allow extensions" message as `chrome://` pages, instead of failing later
  with a confusing injection error.

### Fixed

- **No more 404s in the page's console.** Module preloading is now disabled for
  the build: Vite injected `<link rel="modulepreload">` tags into the host
  page's `<head>`, where their relative URLs resolved against the site's own
  origin and 404'd — three console errors on any page where a Tools chunk
  loaded. The chunks themselves always loaded correctly; the preload hints were
  pure noise in someone else's console, which is the last thing a QA tool
  should add.

## [0.5.0] - 2026-07-23

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

[Unreleased]: https://github.com/AlirezaSoltaniJazi/senmurv/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/AlirezaSoltaniJazi/senmurv/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/AlirezaSoltaniJazi/senmurv/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/AlirezaSoltaniJazi/senmurv/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/AlirezaSoltaniJazi/senmurv/releases/tag/v0.4.0
[0.2.0]: https://github.com/AlirezaSoltaniJazi/senmurv/releases/tag/v0.2.0
[0.1.0]: https://github.com/AlirezaSoltaniJazi/senmurv/releases/tag/v0.1.0
