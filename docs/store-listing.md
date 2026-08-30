# Chrome Web Store listing

Source of truth for the **Detailed description** field on the Senmurv Chrome Web
Store listing. Update this file when features change, then paste the "Current
listing" block into the CWS dashboard.

---

## Current listing

Senmurv is a QA / test-automation helper that lives in Chrome's side panel.

• Generate Random Data — locale-aware test data (name, phone, address, city, postal code, region/county, email, date of birth, UUID, and a random number of a length you set) across 15 countries, with one-click copy for every field — Phone copies both with and without the country code — and a phone country-code toggle.

• Find Element Locator — pick any element and get ranked, copy-ready locators (data-testid, formControlName, id, aria-label, CSS, XPath) with a live match-count / uniqueness check, plus snippets for Playwright, WebdriverIO, Cypress, Selenium, and Robot Framework, or a framework-agnostic "General" view of the raw locator value. A "Test a locator" box checks any selector instantly, "Highlight matches" outlines every match on the page, and "Add to account" seeds a suggestion straight into a saved Account's username, password, or login-button field.

• Execute JS Script — save (organised into folders), format, import (javascript: bookmarklets), search by name, and run your own JavaScript on the current page — optionally under one of the Region emulator's presets, restored automatically once the run finishes; each script's Run button toggles to Stop while it runs.

• Recorder — record a flow of clicks, inputs, and selects on the page (or build it by hand), then replay it, run from any step, stop a run mid-flow, save it as a script, or export it as a ready-to-run spec for Playwright, Cypress, WebdriverIO, Selenium, or Robot Framework. Steps include click, fill, select, checkbox, radio, wait, wait-for-element, press key, and run JS; fill steps can auto-generate realistic values (names, an email synced to the person, numbers by digit count, region/county, dates, a city, a UUID); a live on-page HUD (with a configurable auto-close) shows each step pass or fail. A run can also be wrapped in one of the Region emulator's presets, restored automatically afterwards.

• Accounts — save a site's login (address, account/email, password, and locators for the username field, password field, and login button) and sign in with one click. Passwords are never stored in plain text: they're encrypted with a key derived from a 6–15 digit PIN you set (never itself stored), with a configurable "stay unlocked" session (default 30 minutes, up to 6 hours) so you're not asked for it on every login, and a Change PIN flow. Save one Default password and let any account's "use default password" checkbox reuse it instead of storing its own — clearing it warns first if any account still depends on it. Organise accounts into Groups (collapsed by default, with an inline Rename for any group but Default), duplicate an account in one click, and add an optional Description that shows as a tooltip on hover (delay configurable in Settings).

• Tools — a searchable, pinnable toolbox of in-page inspectors and utilities, each with its own icon; pin up to 5 favourites to the top of the list:
– Inspect: Measure (box model & distances), Colour (every format + WCAG contrast), Fonts (the actually-rendered typeface), Tab order, and Accessibility (WCAG A / AA / AAA audit).
– Author tests: Assertions (snapshot an element's state into copy-ready framework assertions), Validation (read a field's client-side rules + a boundary-test checklist), Stacking (find the overlay intercepting a click), and Harden Selector (score a fragile selector and get a robust replacement).
– Drive & simulate: Bypass (unlock disabled / hidden / read-only fields), Region (make the page read another country's clock, timezone, locale & geolocation), Site data (clear this origin's storage), and Auto refresh (reload the tab on a timer).
– Format & decode: JWT decoder, and JSON Formatter (pretty-print / minify with a collapsible tree view).
– Dynamics 365 / Power Apps: Logical names (label every field, tab and section with its schema name), and Open in Web API (resolve the current record to its Dataverse Web API URL and open it in a new tab).
– Address bar: Query params (copy the record id or any param out of the current URL, edit params, save a whole combination as a named preset — renameable any time — to reapply in one click, and open the rebuilt URL).

• Cookies — view and edit every cookie for the current site, including the HttpOnly ones a page can't show you.

• Storage — view and edit the site's localStorage and sessionStorage.

• Value profiles (Cookies / Storage) — save the values you keep switching between while testing (locales, feature flags, logins) and apply one in a click.

• Track — a stopwatch for your work: start / pause / resume / stop tagged tasks, run several at once, star the ones that matter into their own Important section, clear them all in one go, and review time by day in a list or calendar.

• My Tasks — searchable checklists with subtasks, completion %, and deadlines (with days remaining); star a task into its own Important section, and a finished task moves into a collapsed Done section — start a Track timer on any task or subtask from here, and checking it done stops that timer automatically.

• Notes — quick free-form notes, searchable, collapsed to a 5-line preview with a per-note expand toggle and Expand all / Collapse all; star a note into its own Favorites section; saving clears the form for the next one, and unsaved text auto-saves as you type so closing the panel never loses it.

• Settings — panel font size (also adjustable with Cmd/Ctrl +/-, and reset with Cmd/Ctrl 0), the flow-run popup auto-close and element-find timeout, and Track-tag management (rename / recolour / delete); plus Refresh and Open-in-full-page from the toolbar.

• Export/Import — export or import Scripts (with their folders — checking a folder selects every script inside it), Cookie/Storage value profiles, Query params saved sets, Notes, My Tasks, and Accounts as JSON. Select one or many items; if a name already exists on import, choose Overwrite or Keep both (the new one gets auto-numbered). Accounts export re-enters your PIN, since it decrypts real passwords into the file; import requires a PIN to already be set, and always keeps both (fresh id, de-duplicated name) — checking a group's box selects every account in it, on export and on import alike.

All data and settings stay in your browser. Senmurv does not collect or transmit any data.
