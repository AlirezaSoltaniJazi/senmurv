# Tools

## 1. Generate Random Data

Locale-aware test data via `@faker-js/faker`.

- **Fields**: first name, last name, phone, address, postal code, email, date of birth.
- **Locale switcher**: default `en_GB`; switchable (e.g. `en_US`, `de`, `fr`). Each locale uses the matching faker instance.
- **Actions**: per-field **Copy** (`navigator.clipboard.writeText`), and **Regenerate** for a fresh set.
- Pure generation lives in `src/shared/faker-data.ts`; the tab is a thin renderer.

## 2. Find Element Locator

Pick an element and get ranked, copy-ready locators — each annotated with how many elements it matches on the live page (**unique** / _N_ matches / no match).

- **Picker**: click **Pick element** → the page content script highlights elements on hover (Shadow-DOM overlay) and captures the next click (suppressing the page's own handler).
- **Ranking** (`LOCATOR_PRIORITY`): `data-testid` (and `data-test`/`data-cy`/`data-qa`) › `id` › role + accessible name › unique CSS selector › relative XPath (absolute XPath as fallback). The top viable strategy is marked **recommended**.
- **Match count / uniqueness**: every locator shows its live match count, so you can immediately tell whether a selector is unique on the page.
- **Test a locator**: type any CSS selector or XPath (e.g. `mat-label` or `//button[@type='submit']`) and see how many elements match — no picking required. CSS vs XPath is auto-detected.
- **Framework snippets** (all shown at once; filter with the chips):
  - **Playwright** — `getByTestId`, `getByRole`, `getByLabel`, `locator(css)`, `locator('xpath=…')`
  - **WebdriverIO** — `$('#id')`, `$('[data-testid="…"]')`, `$('aria/Name')`, `$('css')`, `$x('xpath')`
  - **Cypress** — `cy.get('[data-cy="…"]')`, `cy.get('#id')`, `cy.contains('text')`, `cy.get('css')` (XPath needs `cypress-xpath`)
  - **Selenium** — `By.id`, `By.cssSelector`, `By.xpath`
  - **Robot Framework** — `id:…`, `css:…`, `xpath:…` strategy strings (SeleniumLibrary/Browser)
- Generation/ranking/formatting is pure in `src/shared/locators.ts`.
- **Limits**: cannot pierce cross-origin iframes; unavailable on `chrome://`/Web Store/`about:` pages.

## 3. Execute JS Script

Save and run JS in the page.

- **Saved scripts**: name + code, persisted in `chrome.storage.local`. New / Edit / Delete / Run.
- **Import bookmarklet**: paste a `javascript:` URI; Senmurv strips the prefix and `decodeURIComponent`s it into the editor.
- **Run**: injected into the active tab's **MAIN world** via `chrome.scripting.executeScript`, so scripts can touch the page's own framework/state — exactly like a bookmarklet.
- **No defaults**: the script list starts empty — nothing is seeded.
- **CSP caveat**: execution follows the **page's** CSP. Sites that forbid `unsafe-eval` will reject it (same as a bookmarklet); the error is surfaced in the UI.

## 4. Tools

A launcher of seven page-inspection tools. Pick one and it takes the panel's
full height; **← Tools** goes back.

| Tool              | What it does                                                                                                                                                                                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bypass**        | Strips client-side locks so you can drive a disabled or hidden form. Inspired by [Level Up for Dynamics CRM](https://github.com/rajyraman/Levelup-for-Dynamics-CRM), whose equivalent is Xrm-specific — Senmurv's works on any page, and additionally uses the Xrm API when `window.Xrm` is present. |
| **Site data**     | Clears this origin's storage and offers a cache-bypassing reload.                                                                                                                                                                                                                                    |
| **Measure**       | Drag a region, or hover an element for its box model.                                                                                                                                                                                                                                                |
| **Colour**        | An element's colours in every format, plus its WCAG contrast verdict.                                                                                                                                                                                                                                |
| **Tab order**     | The page's computed keyboard tab order, numbered in place.                                                                                                                                                                                                                                           |
| **Accessibility** | WCAG A / AA / AAA checks with per-finding locators.                                                                                                                                                                                                                                                  |
| **Fonts**         | Typography of the hovered element, and the typeface that actually renders.                                                                                                                                                                                                                           |

Each tool states its own limits in the panel rather than in a footnote. Shared
ones: **top frame only** (cross-origin iframes are unreachable), closed shadow
roots cannot be inspected, and the tools are unavailable on `chrome://`,
`file://`, `view-source:` and Web Store pages.

> **Status:** all seven tools have shipped — **Bypass**, **Site data**,
> **Measure**, **Colour**, **Tab order**, **Accessibility** and **Fonts** — on
> the tab and its shared plumbing.

### Fonts — detail

Hover any text to read its typography and, most importantly, the **typeface that
actually renders**. The CSS `font-family` is only a wish-list; Fonts walks that
stack and tells you which family the browser really used, badged **web font**
(loaded via `@font-face`), **local / system** (installed on the machine) or
**generic fallback**. Click to pin it with copy-ready locators.

- **Reads** size (px · pt · rem), weight (numeric value + name, e.g. `600 — Semi
Bold`), style, line height (both px and unitless ratio), letter/word spacing,
  text-transform, font-variant and colour, and emits a copy-ready CSS `font`
  **shorthand**.
- **Resolving the rendered face** is the hard part, done honestly. A canvas
  width test compares each family against **all three** generic baselines
  (`serif` / `sans-serif` / `monospace`) — one baseline gives false negatives
  (Arial ≡ sans-serif on Windows) — with an allow-list for ubiquitous system
  faces whose metrics can coincide with a generic's. This sidesteps the classic
  trap that `document.fonts.check('16px Whatever')` returns **true** for any
  family with no matching `@font-face`. For web fonts it walks
  `document.styleSheets` + `adoptedStyleSheets` for the `CSSFontFaceRule` to
  surface the `src` URL (per-sheet `try/catch` for cross-origin sheets).
- The ordering algorithm is **pure and unit-tested** (`typography.ts`); the DOM
  probes (canvas render test, `@font-face` walk) are injected, since happy-dom
  has neither a canvas 2d context nor `document.fonts`.

**Limits**: top frame only; a face inside a closed shadow root or a cross-origin
sheet whose rules cannot be read is reported by name without its `src`; the
answer is element-level (the font under the cursor's element), not per-glyph.

### Accessibility — detail

A hand-rolled WCAG scanner (no axe-core) with **A / AA / AAA** level chips. It
groups findings into **Failures** (definite, machine-detectable fails) and
**Needs review** (heuristics a human must confirm), each tagged with its success
criterion, an impact, a fix, a help link and — on expand — copy-ready locators.
Export as TXT / CSV / JSON.

- **Coverage** spans images/alt (1.1.1), form labels & autocomplete (4.1.2 /
  1.3.5 / 3.3.2), structure (tables, headings, title, bypass — 1.3.1 / 2.4.x),
  links & keyboard reachability (2.4.4 / 2.1.1), ARIA (roles, references,
  required attributes, duplicate ids — 4.1.2), language (3.1.1) and **text
  contrast** (1.4.3 / 1.4.6, reusing the oracle-verified `contrast.ts`).
- **Honesty is the design.** Every heuristic is `needs-review`, never a hard
  fail; a clean scan is not conformance. Automated tooling catches only a
  minority of WCAG issues — roughly **30–40%** in the field (Deque's axe reaches
  ~57% under ideal conditions) — so the tool always says so. The rule catalogue
  and its **false-positive guards** were adversarially reviewed before
  implementation (a multi-token `aria-labelledby` fix, `≥3×3` table narrowing,
  skipping native state owners, contrast down-graded to needs-review over
  background images or positioned elements, etc.).
- **Not machine-detectable** (documented gaps, kept honest rather than faked):
  focus-visible correctness, live-region status messages, language-of-parts, and
  non-text/UI contrast — these need a manual audit.

### Tab order — detail

Scan the page to draw a numbered badge on every keyboard tab stop, in the order
Tab reaches them, alongside an ordered side-panel list (tag · accessible name ·
tabindex · shadow marker). Click a stop to scroll it into view and get copy-ready
locators; export the whole sequence as TXT / CSV / JSON.

- **Findings**: positive `tabindex` (an anti-pattern, drawn amber), a focusable
  element with **no accessible name**, an **offscreen** stop, and **tab order ≠
  visual order** (a stop that sits before its predecessor in reading order).
- **Correctness**: the order is computed from the DOM, never from `el.tabIndex`
  (which browsers and happy-dom disagree on). It walks the **flattened** tree
  (`<slot>` expanded), scopes positive `tabindex` per shadow root, collapses a
  `delegatesFocus` host to one stop, and applies radio-group and
  disabled/`inert` exclusions. The computed sequence was checked to **match
  Chrome's actual Tab-key order exactly**.
- **Live**: badges stay aligned as you scroll; a **Rescan** prompt appears when
  the DOM changes (it never auto-rescans, which would thrash on an SPA).

**Limits**: top frame only; closed shadow roots, cross-origin frames, roving
tabindex and JS focus managers are invisible; mutations inside shadow roots do
not trigger the stale prompt.

### Colour — detail

Hover an element to read its **text**, **background**, **border** and
**effective background** colours in HEX / HEX8 / RGB / HSL / HWB (each
copyable), plus its **WCAG contrast** verdict; click to pin it with copy-ready
locators. Where the browser supports it, **Pick a screen colour** opens the
native eyedropper to sample any pixel.

- **Contrast** grades AA (≥4.5, or ≥3 large) and AAA (≥7, or ≥4.5 large) for the
  actual text size. The maths use the single normative WCAG threshold (0.04045)
  and are **shared with the Accessibility tool**, so both agree with
  axe/Lighthouse. The values were checked against an independently-computed
  reference (e.g. `#767676` on white = 4.54 → passes AA; `#777777` = 4.48 →
  fails).
- **Effective background** is resolved by compositing ancestor
  `background-color`s (in gamma space, folding in `opacity`) over an assumed
  white backstop. This ancestor walk **cannot see** background images/gradients,
  `::before`/`::after` overlays, non-ancestor elements pulled behind by
  `z-index`, blend modes, or a dark page default — all of which are **flagged as
  warnings, never guessed**.
- **Non-sRGB colours** (`oklch()`, `lab()`, `color(display-p3 …)`) are shown as
  their raw computed string and excluded from contrast — the tool never
  fabricates a hex for a colour it cannot convert.

### Measure — detail

Three sub-modes, chosen with the chips:

- **Element** — hover for the DevTools-style box model (content / border / margin
  boxes, and the four padding/border/margin sides). Click to pin it; the pinned
  element also gets copy-ready **locators** and **size assertions**.
- **Region** — drag a rectangle; the live W×H shows in-page, and the reading
  includes both viewport and page-absolute coordinates.
- **Distance** — click one element then another for the horizontal/vertical gap
  and the centre-to-centre distance.

**The assertion trap it gets right:** a CSS-property assertion
(`toHaveCSS('width')`, `have.css`, `getCSSProperty`) reads the **content** box,
while a bounding-box assertion (`boundingBox()`, `getSize`, `outerWidth`,
`getRect`) reads the **border** box — they differ by exactly (padding + border).
Each emitted snippet is fed from the correct box, so pasting a Measure result
into a test does not silently assert the wrong number.

**Limits:** numbers are CSS px in the **top frame**. Browser page-zoom changes
what `getBoundingClientRect` reports, and a `transform` on the element (or an
ancestor) makes the reported box the axis-aligned bounding box of the
transformed element — the transform is named in the readout when present.

### Site data — detail

Clears the **current origin only**, from the page itself, needing no new
permission. The breakdown and the clearing both run in the page, so the numbers
and the deletions are for the site you are on — never the extension.

- **Presets.** _Bust cache_ (Cache Storage + service workers) re-fetches the
  app's assets without ending your session. _Fresh visitor_ clears everything,
  for testing a first-run flow. A session-destroying selection arms a two-step
  confirm.
- **Clear + hard reload** reloads with `bypassCache`, which is the only way to
  reach the HTTP disk cache.

**Two things it deliberately does not do**, because Chrome does not let an
extension do them honestly:

- **It never reports "bytes freed".** `navigator.storage.estimate()` is padded
  and lazy — verified in a real browser, Cache Storage deletion is not reflected
  for seconds — and it ignores localStorage and cookies entirely, so a
  before/after delta would be a made-up number. The tool re-reads storage after
  a clear and shows the real new state instead.
- **It cannot clear or size the HTTP disk cache per-origin.** No extension API
  exposes that. The numbers shown are quota storage; the hard reload is the
  practical substitute.

**Other limits:** only **non-HttpOnly** cookies can be removed from the page —
HttpOnly cookies are invisible to any script and survive. Cache Storage, service
workers and the storage estimate need a **secure context** (`https`, or
`http://localhost`), and the tool says so on a plain-http page.

### Bypass — detail

Every lock it strips is recorded before it is changed, so **Restore** puts the
page back exactly — including telling an absent attribute apart from a present
empty one. Three rules are worth knowing:

- **`step` is set to `any`, not removed.** An absent `step` on a number input
  means `step=1`, so removing it would leave `1.5` invalid.
- **`novalidate` is inverted.** The fix is to _add_ it, so Restore _removes_ it.
- **First write wins.** When sticky mode re-applies over a lock the app has put
  back, the originally-recorded value is kept — otherwise Restore would put back
  the app's re-locked state and appear to do nothing.

**Sticky mode** watches lock attributes only. `class` and `style` are
deliberately excluded: they are the highest-churn attributes on React/Angular
and watching them would storm on every render. A framework that re-hides a field
via `style` is therefore not tracked.

**Limits.** Client-side only — the server can still reject the submit, and on a
model-driven form (Angular Reactive Forms, Dynamics) it affects the _view_, not
the _model_, so a field may become typable while its value is still excluded
from `form.value`. Closed shadow roots are unreachable from any extension. A
full page reload discards the undo record, and the Restore button reflects that
rather than pretending.

**On Dynamics 365 / Power Apps**, an extra **Bypass Dynamics form** button uses
the `Xrm` client API — `setRequiredLevel('none')`, `setVisible`/`setDisabled` on
controls, and `setVisible` on tabs and sections. This is what Level Up for
Dynamics CRM does, and no DOM-level pass can reach it, because the model lives
in the page's JavaScript rather than in its markup.

### How it is wired

The in-page half of these tools is a **separate chunk** loaded on first use, so
it never parses on ordinary page loads. The content script runs at most one
in-page mode at a time — see `docs/architecture.md` → _In-page modes_.
