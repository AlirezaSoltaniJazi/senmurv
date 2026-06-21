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
