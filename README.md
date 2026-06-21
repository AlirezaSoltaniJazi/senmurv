# Senmurv

A Manifest V3 Chrome extension — a QA / test-automation helper that lives in the **Chrome Side Panel**:

- **Generate Random Data** — locale-aware test data (name, phone, address, postal code, email, DOB) via `@faker-js/faker`, with copy + regenerate.
- **Find Element Locator** — pick any element on the page and get ranked locators (data-testid › id › role+name › CSS › XPath) plus copy-ready snippets for **WDIO, Playwright, Cypress, Selenium**.
- **Execute JS Script** — save, import (`javascript:` bookmarklets), and run JS scripts in the page.

## Quick start

```bash
npm install
npm run build          # → dist/
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `dist/`. Click the Senmurv toolbar icon to open the side panel.

## Development

```bash
npm run dev            # dev build with HMR
npm test               # run tests
npm run lint && npm run format:check && npm run typecheck
npm run package        # build + zip → release/
```

## Docs

- [docs/getting-started.md](docs/getting-started.md) — install, build, load, package
- [docs/architecture.md](docs/architecture.md) — contexts and data flow
- [docs/tools.md](docs/tools.md) — the three tools in detail
- [agents.md](agents.md) — conventions and AI-agent context
