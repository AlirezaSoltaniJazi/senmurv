# Security Checklist — senmurv

> Per-permission, per-content-script, and per-CSP verification checklists.

---

## Permission Audit Checklist

For every permission in `manifest.json`:

- [ ] Permission is necessary for core functionality (not "nice to have")
- [ ] Justification is documented in code or manifest comments
- [ ] No broader alternative exists (e.g., `activeTab` over `tabs`)
- [ ] Optional permissions used for non-critical features
- [ ] `host_permissions` are as narrow as possible (specific origins over `<all_urls>`)

### Per-Permission Verification

| Permission                     | Verify                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `sidePanel`                    | Only used to register/open the Side Panel surface                                                      |
| `scripting`                    | Only used by the script runner (`executeScript`) — never to inject arbitrary extension code into pages |
| `storage`                      | Data stored is non-sensitive (scripts/prefs), validated before write                                   |
| `tabs`                         | Only used to query the active tab and message the picker                                               |
| `host_permissions: <all_urls>` | Required by picker + runner; ensure no per-page data is collected or exfiltrated                       |

---

## Content Script (Picker) Security Checklist

- [ ] The picker content script runs in the `ISOLATED` world (default)
- [ ] No global namespace pollution (all code wrapped in IIFE or module)
- [ ] Shadow DOM used for the picker overlay (`<senmurv-picker-overlay>`)
- [ ] No inline event handlers in injected HTML
- [ ] All captured page text sanitized before DOM insertion (use `textContent`, not `innerHTML`)
- [ ] Message origin validated in `onMessage` listener
- [ ] Picker stays idle until `START_PICK`; listeners detached after capture
- [ ] No sensitive page data leaked beyond the computed locators

### DOM Injection Rules

```typescript
// ✅ Safe — Shadow DOM isolation
const host = document.createElement('senmurv-picker-overlay');
const shadow = host.attachShadow({ mode: 'closed' });
shadow.innerHTML = `<style>/* scoped styles */</style>`;
document.body.appendChild(host);

// ❌ Unsafe — global DOM pollution
document.body.innerHTML += '<div class="senmurv-overlay">...</div>';

// ✅ Safe — textContent for captured page data
const label = document.createElement('span');
label.textContent = capturedText; // Safe — no HTML parsing

// ❌ Unsafe — innerHTML with captured data
element.innerHTML = `<span>${capturedText}</span>`; // XSS risk
```

---

## Content Security Policy Checklist

- [ ] `script-src 'self'` — no remote scripts, no inline, no eval
- [ ] `object-src 'self'` — no plugins/embeds from external sources
- [ ] No `'unsafe-eval'` in CSP (MV3 forbids it anyway)
- [ ] No `'unsafe-inline'` in CSP
- [ ] No remote code loading (all code bundled locally)
- [ ] Dynamic imports only from extension bundle

### CSP Configuration

```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

**MV3 enforced restrictions** on **extension pages** (cannot be overridden):

- No `eval()`, `new Function()`, or `setTimeout/setInterval` with strings
- No inline scripts in HTML pages
- No remotely hosted code

---

## Sanctioned MAIN-World Script-Execution Exception

senmurv's **Execute JS Script** tool intentionally runs user-provided code. This is the extension's purpose and is a **documented, scoped exception** — do NOT flag it as a vulnerability or "fix" it away:

- [ ] The `new Function` call lives **only** inside the single injected runner func (`runUserScript`)
- [ ] It runs in the page's **MAIN world** via `chrome.scripting.executeScript({ world: 'MAIN' })`
- [ ] It is therefore governed by the **page's** CSP — exactly like a `javascript:` bookmarklet — NOT the extension's CSP
- [ ] Extension pages keep `script-src 'self'`; no `unsafe-eval` is added to the manifest CSP
- [ ] The call is suppressed with an inline `// eslint-disable-next-line @typescript-eslint/no-implied-eval` plus a justifying comment
- [ ] The exception is **never widened** beyond the script runner — all other extension code obeys the no-eval rule

```typescript
// Injected into the page's MAIN world — runs under the PAGE's CSP, like a bookmarklet.
function runUserScript(code: string): void {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- sanctioned: user script runner, page-CSP governed, isolated to this function
  new Function(code)();
}
```

---

## Message Security Checklist

- [ ] All incoming messages validated with type guard before processing
- [ ] Unknown message types rejected with error response
- [ ] `sender.id` verified matches own extension ID for internal messages
- [ ] External messages (`externally_connectable`) restricted to specific origins
- [ ] No sensitive data in message payloads sent to content scripts
- [ ] Port names validated on connection

### Message Validation Pattern

```typescript
function isValidMessage(message: unknown): message is ExtensionMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    typeof (message as { type: unknown }).type === 'string' &&
    Object.values(MESSAGE_TYPES).includes((message as { type: string }).type as MessageType)
  );
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Verify sender is our extension
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ success: false, error: 'Unauthorized sender' });
    return false;
  }

  // Validate message shape
  if (!isValidMessage(message)) {
    sendResponse({ success: false, error: 'Invalid message format' });
    return false;
  }

  // Process validated message...
});
```

---

## Web Accessible Resources Checklist

- [ ] Only files needed by content scripts are exposed
- [ ] Resources restricted to specific URL patterns (not `<all_urls>` unless necessary)
- [ ] No source maps exposed in production builds
- [ ] No sensitive configuration files exposed
- [ ] Extension-specific prefixed filenames to avoid collisions

---

## Storage Security Checklist

- [ ] No credentials, tokens, or API keys in `chrome.storage.sync` (syncs to Google)
- [ ] Saved scripts and prefs stored in `chrome.storage.local` (not `.sync`)
- [ ] Input validated and sanitized before storage write
- [ ] Storage quota monitored (sync: 100KB total, local: 10MB)
- [ ] Migration logic handles corrupt/invalid data gracefully

---

## Chrome Web Store Compliance

- [ ] All permissions justified in Chrome Web Store listing
- [ ] Privacy policy URL provided if data is collected
- [ ] No deceptive functionality or hidden behavior
- [ ] Extension name and description accurately reflect functionality
- [ ] No trademark infringement in branding or description
- [ ] Single purpose clearly defined and documented
