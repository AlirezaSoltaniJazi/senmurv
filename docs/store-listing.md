# Chrome Web Store listing

Source of truth for the **Detailed description** field on the Senmurv Chrome Web
Store listing. Update this file when features change, then paste the "Current
listing" block into the CWS dashboard.

> Note: the archived listing below predated the **Tools** tab, the Recorder's
> **Export as spec**, and the Locator's **Highlight matches**. The current listing
> adds those plus the newest work — **Region / County** data, the **JSON
> Formatter** and **Auto refresh** tools, the Fill/Recorder generator options
> (digit-count numbers, name-synced email), the **Settings** flow timings and
> **Track-tag** management, and the Scripts **Run/Stop** toggle with folder
> grouping. Performance/reliability work is not user-facing copy, so it is
> intentionally not listed here.

---

## Current listing

Senmurv is a QA / test-automation helper that lives in Chrome's side panel.

• Generate Random Data — locale-aware test data (name, phone, address, postal code, region/county, email, date of birth) across 15 countries, with one-click copy and a phone country-code toggle.

• Find Element Locator — pick any element and get ranked, copy-ready locators (data-testid, formControlName, id, aria-label, CSS, XPath) with a live match-count / uniqueness check, plus snippets for Playwright, WebdriverIO, Cypress, Selenium, and Robot Framework. A "Test a locator" box checks any selector instantly, and "Highlight matches" outlines every match on the page.

• Execute JS Script — save (organised into folders), format, import (javascript: bookmarklets), and run your own JavaScript on the current page; each script's Run button toggles to Stop while it runs.

• Recorder — record a flow of clicks, inputs, and selects on the page (or build it by hand), then replay it, run from any step, stop a run mid-flow, save it as a script, or export it as a ready-to-run spec for Playwright, Cypress, WebdriverIO, Selenium, or Robot Framework. Steps include click, fill, select, checkbox, radio, wait, wait-for-element, press key, and run JS; fill steps can auto-generate realistic values (names, an email synced to the person, numbers by digit count, region/county, dates); a live on-page HUD (with a configurable auto-close) shows each step pass or fail.

• Tools — a toolbox of in-page inspectors and utilities:
– Inspect: Measure (box model & distances), Colour (every format + WCAG contrast), Fonts (the actually-rendered typeface), Tab order, and Accessibility (WCAG A / AA / AAA audit).
– Author tests: Assertions (snapshot an element's state into copy-ready framework assertions), Validation (read a field's client-side rules + a boundary-test checklist), Stacking (find the overlay intercepting a click), and Harden Selector (score a fragile selector and get a robust replacement).
– Drive & simulate: Bypass (unlock disabled / hidden / read-only fields), Region (make the page read another country's clock, timezone, locale & geolocation), Site data (clear this origin's storage), and Auto refresh (reload the tab on a timer).
– Format & decode: JWT decoder, and JSON Formatter (pretty-print / minify with a collapsible tree view).

• Track — a stopwatch for your work: start / pause / resume / stop tagged tasks, run several at once, clear them all in one go, and review time by day in a list or calendar.

• My Tasks — checklists with subtasks, completion %, and deadlines (with days remaining) — and start a Track timer on any task from here.

• Notes — quick free-form notes.

• Settings — panel font size, the flow-run popup auto-close and element-find timeout, and Track-tag management (rename / recolour / delete); plus Refresh and Open-in-full-page from the toolbar.

All data and settings stay in your browser. Senmurv does not collect or transmit any data.

---
