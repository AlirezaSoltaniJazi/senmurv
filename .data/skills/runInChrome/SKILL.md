---
name: runInChrome
description: >-
  Launch and drive the built Senmurv extension in a real Chrome instance to
  verify a change actually works — not just that its unit tests pass. Loads
  dist/ as an unpacked extension via Playwright (Python), drives the side-panel
  React app, sends runtime messages, fires real mouse/keyboard events at a
  fixture page, and asserts on the resulting DOM. Use when asked to run, start,
  screenshot, or manually QA the extension, when verifying picker/recorder/Tools
  behaviour end-to-end, or when a change touches src/content/ (which has no unit
  coverage because happy-dom has no layout engine).
compatibility: 'macOS, Playwright 1.58 (Python), Chromium bundled with Playwright'
metadata:
  author: senmurv
  version: '1.0.0'
  sdlc-phase: verification
allowed-tools: Read Write Edit Bash(python3:*) Bash(npm:*) Bash(curl:*) Bash(mkdir:*) Bash(cp:*) Glob Grep
---

## Announce skill usage

Say "Using: runInChrome skill" at the start of your response.

## Why this exists

`src/content/*` has **zero unit coverage and cannot get any** — happy-dom has no
layout engine (`getBoundingClientRect()` returns all zeros), no
`checkVisibility`, no `elementsFromPoint`, no canvas 2D context, no
`document.fonts`. Anything touching the picker, the overlay, the mode arbiter or
an in-page Tools mode is only ever verified by running it.

It has already earned its keep: this harness caught Vite's `modulePreload` links
404-ing against the **host page's** origin — three console errors on every site
where a Tools chunk loaded. Unit tests, typecheck and the bundle guard all passed.

## Prerequisites

```bash
playwright --version          # 1.58.0, from pyenv — NOT in node_modules
ls ~/Library/Caches/ms-playwright/   # chromium-* must exist
```

`headless=False` is required. Playwright's default headless shell does not load
extensions. A Chrome window will open — that is expected.

## The four things that will bite you

| Trap                                                 | Why                                                                                                                                                                                                                                                 | Fix                                                                                                                       |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **The side panel cannot be opened programmatically** | It needs a toolbar click, which is browser chrome, not page content                                                                                                                                                                                 | Open the _same_ React app at `chrome-extension://<id>/src/sidepanel/index.html` in a tab                                  |
| **The panel tab must NOT be the active tab**         | `withActiveRunnableTab` resolves `chrome.tabs.query({active:true, lastFocusedWindow:true})`. If the panel is active it targets _itself_ — a `chrome-extension://` URL — and every page-acting message returns "This page does not allow extensions" | Call `fixture.bring_to_front()` **before** driving the panel. Playwright happily clicks and evaluates on a background tab |
| **`file://` fixtures are blocked**                   | `BLOCKED_URL_PREFIXES` includes `file://` and `view-source:`                                                                                                                                                                                        | Serve the fixture over HTTP: `python3 -m http.server 8899`                                                                |
| **Disabled form controls swallow clicks**            | Chrome does not dispatch mouse events on a `disabled` input — a click produces _nothing_, not a mis-targeted event                                                                                                                                  | Click an enabled field, or bypass the page first                                                                          |

## Recipe

```bash
# 1. Build, then serve a fixture over HTTP (never file://)
npm run build
cd <scratchpad> && (python3 -m http.server 8899 >server.log 2>&1 &)
cp <skill>/assets/fixture.html .          # form with disabled/required/hidden fields

# 2. Drive it
python3 verify.py
```

Start from [assets/verify-example.py](assets/verify-example.py) — a complete
44-assertion pass covering picker, recorder, mode switching, Bypass, Restore,
sticky mode and reload. Copy it and edit the checks.

Core skeleton:

```python
ctx = p.chromium.launch_persistent_context(
    tempfile.mkdtemp(), headless=False,
    args=[f"--disable-extensions-except={DIST}", f"--load-extension={DIST}", "--no-first-run"])

sw = ctx.service_workers[0] or ctx.wait_for_event("serviceworker", timeout=15000)
ext_id = sw.url.split("/")[2]                       # the MV3 worker registers async

fixture = ctx.pages[0]; fixture.goto("http://localhost:8899/fixture.html")
panel = ctx.new_page(); panel.goto(f"chrome-extension://{ext_id}/src/sidepanel/index.html")

panel.evaluate("() => { window.__events = []; "
               "chrome.runtime.onMessage.addListener(m => window.__events.push(m)); }")
fixture.bring_to_front()                            # ← the one that bites

send = lambda m: panel.evaluate("async m => chrome.runtime.sendMessage(m)", m)
```

## Drive it, don't just launch it

- **Messages** — `send({"type": "BYPASS_PAGE", "payload": {...}})`, then assert on
  `fixture.evaluate(...)`. This exercises panel → worker → content script → DOM.
- **Real input** — `fixture.mouse.move/click(x, y)`, `fixture.keyboard.press("Escape")`.
  Get coordinates from `fixture.locator("#x").bounding_box()`.
- **Push messages** — read them back from `window.__events` in the panel.
- **The UI itself** — `panel.get_by_role("button", name="Bypass page").click()`, then
  `panel.screenshot(path=...)`. **Look at the screenshot.** Message-level
  assertions passing proves nothing about whether anything rendered.
- **Console/network noise** — attach `page.on("console")` and `page.on("response")`
  and assert the extension adds **no** errors to the host page. Filter by
  `msg.location["url"]`, not by message text: a 404's text says nothing about which
  resource failed.

## Verifying lazy-chunk placement

```python
fixture.evaluate("() => performance.getEntriesByType('resource')"
                 ".map(e => e.name).filter(n => n.includes('/assets/tools-'))")
```

Must be `[]` before the first tool message and non-empty after. Entries appearing
on the **page's** origin mean a preload/import is resolving against the host page
— a defect, even when the module still loads from `chrome-extension://`.

## Before concluding "it's broken"

Isolate the failure before reporting it. Two of the first run's failures were
harness artifacts (a disabled input, the fixture's own missing favicon), not
product bugs. Write a small script that tests the one hypothesis.
