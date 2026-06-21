# Manifest Patterns — senmurv

> Manifest V3 configuration patterns, permission strategies, and content script declarations.

---

## Base Manifest Structure

```json
{
  "manifest_version": 3,
  "name": "Senmurv",
  "version": "1.0.0",
  "description": "QA helper — generate test data, find element locators, and run JS scripts from a Side Panel.",
  "permissions": ["sidePanel", "scripting", "storage", "tabs"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "src/background/service-worker.ts",
    "type": "module"
  },
  "side_panel": {
    "default_path": "src/sidepanel/index.html"
  },
  "action": {
    "default_title": "Senmurv",
    "default_icon": {
      "16": "public/icons/icon-16.png",
      "32": "public/icons/icon-32.png",
      "48": "public/icons/icon-48.png",
      "128": "public/icons/icon-128.png"
    }
  },
  "icons": {
    "16": "public/icons/icon-16.png",
    "32": "public/icons/icon-32.png",
    "48": "public/icons/icon-48.png",
    "128": "public/icons/icon-128.png"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/picker.ts"],
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [],
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

> The extension page CSP stays `script-src 'self'`. The Execute JS Script tool's
> `new Function` runs in the **page's** MAIN world under the page's CSP — see
> [security-checklist.md](security-checklist.md).

---

## Permission Justifications

Every permission MUST have a justification comment in the codebase:

| Permission                     | Justification                                                  |
| ------------------------------ | -------------------------------------------------------------- |
| `sidePanel`                    | Core surface — all three tools live in the Side Panel          |
| `scripting`                    | Run user scripts in the page's MAIN world (`executeScript`)    |
| `storage`                      | Persist saved scripts and preferences (`chrome.storage.local`) |
| `tabs`                         | Query the active tab and message the content picker            |
| `host_permissions: <all_urls>` | Picker + script-runner must work on any page the user opens    |

---

## Content Script Declaration (The Picker)

senmurv declares exactly one content script — the locator picker. It stays idle until it receives `START_PICK`:

```json
{
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/picker.ts"],
      "css": [],
      "run_at": "document_idle"
    }
  ]
}
```

**Rules**:

- The picker registers a message listener and stays dormant until `START_PICK`
- Runs in the default `ISOLATED` world — only the _script runner_ injects into `MAIN` (via `chrome.scripting.executeScript`)
- Set `run_at` to `document_idle` unless early DOM access is critical
- Never inject CSS globally — the overlay uses Shadow DOM (`<senmurv-picker-overlay>`)

---

## Web Accessible Resources (Minimal)

senmurv does not normally need web-accessible resources (the picker overlay is built in the content script with Shadow DOM). If a resource ever must be reachable from the page, expose only that file:

```json
{
  "web_accessible_resources": [
    {
      "resources": ["picker-overlay.css"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

**Rules**:

- Only expose files that the content picker absolutely needs
- Never expose source maps in production
- Restrict `matches` to specific origins when possible

---

## Side Panel Configuration

The Side Panel is registered in the manifest and opened on the action click in the service worker:

```json
{
  "side_panel": {
    "default_path": "src/sidepanel/index.html"
  }
}
```

```typescript
// src/background/service-worker.ts — open the panel when the toolbar icon is clicked
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// Optionally scope or re-point the panel per tab
await chrome.sidePanel.setOptions({
  path: 'src/sidepanel/index.html',
  enabled: true,
});
```

**Rules**:

- Requires Chrome 114+ — the `sidePanel` API is unavailable earlier
- `default_path` must point at the panel HTML bundled with the extension
- Use `setPanelBehavior({ openPanelOnActionClick: true })` so the toolbar icon opens it

---

## Scripting (MAIN-World Script Runner)

The Execute JS Script tool runs user code in the page's MAIN world via `chrome.scripting` — there is no manifest entry beyond the `scripting` permission and host access:

```typescript
await chrome.scripting.executeScript({
  target: { tabId },
  world: 'MAIN',
  func: runUserScript,
  args: [code],
});
```

The injected `runUserScript` is governed by the **page's** CSP (like a `javascript:` bookmarklet). See [security-checklist.md](security-checklist.md) for the sanctioned `new Function` exception.
