# Common Issues — senmurv

> Troubleshooting guide for frequent Chrome extension development pitfalls.

---

## Service Worker Issues

### SW Terminates Unexpectedly

**Symptom**: Background logic stops working, alarms don't fire, state is lost.

**Cause**: MV3 service workers have a 30-second idle timeout (5 minutes with active events).

**Fix**:

- Store all state in `chrome.storage.local` — never in memory variables
- Use `chrome.alarms` instead of `setTimeout`/`setInterval`
- Re-sync state in `chrome.runtime.onStartup` listener

### Event Listeners Not Firing After Restart

**Symptom**: Messages not received, alarms ignored after browser restart.

**Cause**: Event listeners registered inside `async` functions or conditionally.

**Fix**: Register ALL event listeners synchronously at the top level of the service worker.

```typescript
// ✅ Top level — always registered
chrome.runtime.onMessage.addListener(handleMessage);

// ❌ Inside async — might miss events
async function init() {
  chrome.runtime.onMessage.addListener(handleMessage); // TOO LATE
}
```

---

## Content Picker Issues

### Picker Not Injecting

**Symptom**: The picker doesn't respond to `START_PICK` on a page.

**Causes & Fixes**:

1. **Manifest `matches` pattern wrong** — test patterns at https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns
2. **`run_at` timing** — use `document_idle` (default) for the picker
3. **Extension not reloaded** — after manifest changes, reload extension in `chrome://extensions`
4. **Page loaded before extension** — already-open tabs need refresh after install
5. **Restricted page** — content scripts never inject on `chrome://`, the Chrome Web Store, or other extension pages (see below)

### Picker Overlay Styles Leaking

**Symptom**: The overlay's CSS affects the host page, or page CSS affects the overlay.

**Fix**: Always use Shadow DOM for the picker overlay:

```typescript
const host = document.createElement('senmurv-picker-overlay');
const shadow = host.attachShadow({ mode: 'closed' });
// All styles go inside shadow — fully isolated
```

### Picker Can't Select Inside an Iframe

**Symptom**: Hover-highlight / click-capture doesn't work over content inside an iframe.

**Cause**: The picker runs per-frame, but it cannot pierce **cross-origin** iframes — and click coordinates from the top frame don't map into them.

**Fix**: Document the limitation; for same-origin iframes the content script is injected into each frame, so picking works there. Cross-origin iframe contents are out of scope.

---

## Message Passing Issues

### `sendMessage` Returns `undefined`

**Symptom**: Response from background is always `undefined`.

**Causes**:

1. **Async handler without `return true`** — if handler is async, listener MUST return `true`
2. **No listener registered** — service worker terminated before message arrived
3. **Multiple listeners** — only one can `sendResponse`

```typescript
// ✅ Return true for async handlers
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleAsync(msg).then(sendResponse);
  return true; // CRITICAL — keeps channel open
});
```

### "Could not establish connection" Error

**Symptom**: `chrome.runtime.sendMessage` throws connection error.

**Causes**:

1. **Extension reloaded** — content scripts from old version are orphaned
2. **Service worker not running** — message arrives before SW wakes up
3. **Tab closed** — attempting to send to a closed tab

**Fix**: Always wrap in try/catch:

```typescript
try {
  const response = await chrome.runtime.sendMessage(message);
} catch {
  // Extension context invalidated — reload page or fail gracefully
}
```

---

## Storage Issues

### Storage Quota Exceeded

**Symptom**: `chrome.storage.local.set` fails silently or throws.

**Fix**:

- `sync` quota: 100KB total, 8KB per item — use for preferences only
- `local` quota: 10MB — use for saved scripts
- Monitor with `chrome.storage.local.getBytesInUse()`

### Storage Data Corruption After Update

**Symptom**: Extension breaks after update due to changed data schema.

**Fix**: Always version your storage schema and run migrations:

```typescript
chrome.runtime.onInstalled.addListener(async ({ reason, previousVersion }) => {
  if (reason === 'update') {
    await migrateStorage(previousVersion!);
  }
});
```

---

## Build Issues

### CRXJS Hot Reload Not Working

**Symptom**: Changes don't reflect in the extension during development.

**Fixes**:

1. Check Vite dev server is running
2. Verify CRXJS plugin version matches Vite version
3. Service worker changes often require manual reload at `chrome://extensions`
4. Content script changes require page refresh

### TypeScript Errors with Chrome API Types

**Symptom**: `chrome.*` APIs show type errors or are unrecognized.

**Fix**: Install Chrome types:

```bash
npm install -D @anthropic-ai/chrome-types
# or
npm install -D @anthropic-ai/web-extensions
```

Add to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["@anthropic-ai/chrome-types"]
  }
}
```

---

## Side Panel Issues

### Side Panel Doesn't Open

**Symptom**: Clicking the toolbar icon does nothing, or the panel never appears.

**Causes & Fixes**:

1. **Chrome too old** — the `chrome.sidePanel` API requires **Chrome 114+**
2. **Behavior not set** — call `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` at the top level of the service worker
3. **`default_path` wrong** — `side_panel.default_path` must point at the bundled panel HTML
4. **`sidePanel` permission missing** — add it to `manifest.json` permissions

---

## Execute JS Script (MAIN-World) Issues

### `chrome.scripting.executeScript` Throws / No Effect

**Symptom**: Running a saved script fails or silently does nothing.

**Causes & Fixes**:

1. **Restricted page** — MAIN-world injection is **blocked on `chrome://` pages and the Chrome Web Store** (and other extension pages). Surface a clear "can't run here" message
2. **No active tab** — `chrome.tabs.query({ active: true, currentWindow: true })` returned nothing
3. **Page CSP** — the injected `new Function(code)()` runs under the **page's** CSP; a strict page CSP can block it (this is expected — it behaves like a `javascript:` bookmarklet)
4. **Errors thrown by user code** — surface them; they originate in the page, not the extension

> The `new Function` in the runner is the **sanctioned exception** — do not remove it. See [security-checklist.md](security-checklist.md).

---

## Debugging Tips

1. **Service worker console**: `chrome://extensions` -> extension details -> "Inspect views: service worker"
2. **Content picker console**: Regular DevTools console on the target page (filter by extension name)
3. **Side Panel DevTools**: Right-click inside the panel -> "Inspect"
4. **Storage viewer**: DevTools -> Application -> Extension Storage (inspect saved scripts)
5. **MAIN-world script output**: appears in the **page's** console, not the extension's
