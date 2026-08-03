# Message Passing Guide — senmurv

> Typed message schemas, routing patterns, port lifecycle, and error handling.

---

## Message Type System

All messages use a discriminated union pattern (`RuntimeMessage`) with a `type` field:

```typescript
// MESSAGE_TYPES lives in src/shared/constants.ts; the RuntimeMessage union +
// sendRuntimeMessage/sendTabMessage helpers live in src/shared/messages.ts.
// Shown together here for one illustrative view of the whole pattern.

export const MESSAGE_TYPES = {
  START_PICK: 'START_PICK',
  ELEMENT_PICKED: 'ELEMENT_PICKED',
  RUN_SCRIPT: 'RUN_SCRIPT',
  GET_SCRIPTS: 'GET_SCRIPTS',
  SAVE_SCRIPT: 'SAVE_SCRIPT',
  DELETE_SCRIPT: 'DELETE_SCRIPT',
} as const;

export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES];

// Side panel -> content picker: begin picking on the active tab
export interface StartPickMessage {
  type: typeof MESSAGE_TYPES.START_PICK;
}

// Content picker -> side panel: an element was clicked, here are its locators.
// The payload IS the LocatorSet directly — it is not wrapped in a `{ locators }` object.
export interface ElementPickedMessage {
  type: typeof MESSAGE_TYPES.ELEMENT_PICKED;
  payload: LocatorSet;
}

// Side panel -> service worker: run script code in the page's MAIN world.
// The panel resolves the saved script and sends its CODE — the service worker
// never looks a script up by id.
export interface RunScriptMessage {
  type: typeof MESSAGE_TYPES.RUN_SCRIPT;
  payload: {
    code: string;
  };
}

// Side panel -> service worker: script CRUD
export interface GetScriptsMessage {
  type: typeof MESSAGE_TYPES.GET_SCRIPTS;
}

export interface SaveScriptMessage {
  type: typeof MESSAGE_TYPES.SAVE_SCRIPT;
  payload: {
    script: SavedScript;
  };
}

export interface DeleteScriptMessage {
  type: typeof MESSAGE_TYPES.DELETE_SCRIPT;
  payload: {
    id: string;
  };
}

// Response type — the project's actual fallible-op shape (src/shared/types.ts)
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

// Union of all messages
export type RuntimeMessage =
  | StartPickMessage
  | ElementPickedMessage
  | RunScriptMessage
  | GetScriptsMessage
  | SaveScriptMessage
  | DeleteScriptMessage;
```

---

## Sending Messages (Side Panel -> Service Worker)

```typescript
// src/shared/messages.ts — the actual helper (a thin pass-through, no
// try/catch and no lastError check — callers type T as a Result<...> and
// check `.ok` themselves; see the usage below)

export async function sendRuntimeMessage<T = unknown>(message: RuntimeMessage): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

// Usage in a Side Panel tab — T is the RESPONSE shape, typically a Result<...>
import { sendRuntimeMessage } from '@/shared/messages';
import { MESSAGE_TYPES } from '@/shared/constants';

const response = await sendRuntimeMessage<Result<SavedScript[]>>({
  type: MESSAGE_TYPES.GET_SCRIPTS,
});

if (response.ok) {
  renderScripts(response.value);
} else {
  showError(response.error);
}
```

---

## Receiving Messages (Background Service Worker)

```typescript
// src/background/service-worker.ts

import { type RuntimeMessage } from '@/shared/messages';
import { MESSAGE_TYPES } from '@/shared/constants';

chrome.runtime.onMessage.addListener(
  (
    message: RuntimeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: Result<unknown>) => void
  ) => {
    // Type guard — reject unknown messages
    if (!message || !message.type || !(message.type in MESSAGE_TYPES)) {
      sendResponse({ ok: false, error: 'Unknown message type' });
      return false;
    }

    // Async handler — return true to keep sendResponse alive
    handleMessage(message, sender)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Handler failed',
        });
      });

    return true; // Keep message channel open for async response
  }
);

async function handleMessage(
  message: RuntimeMessage,
  sender: chrome.runtime.MessageSender
): Promise<Result<unknown>> {
  switch (message.type) {
    case MESSAGE_TYPES.RUN_SCRIPT:
      return handleRunScript(message.payload.code);
    case MESSAGE_TYPES.GET_SCRIPTS:
      return handleGetScripts();
    case MESSAGE_TYPES.SAVE_SCRIPT:
      return handleSaveScript(message.payload.script);
    case MESSAGE_TYPES.DELETE_SCRIPT:
      return handleDeleteScript(message.payload.id);
    default:
      return { ok: false, error: `Unhandled message: ${message.type}` };
  }
}
```

---

## Side Panel <-> Content Picker Communication

The side panel never messages the tab directly — it always sends `sendRuntimeMessage` to
the service worker, which resolves the active tab and relays to the content script
(`reachTab`/`sendTabMessage`, injecting the picker first if a pre-existing tab doesn't
have it yet). The picker's reply falls back through the service worker to the panel via
the `ELEMENT_PICKED` message.

```typescript
// src/sidepanel/components/LocatorTab.tsx — start picking

import { MESSAGE_TYPES } from '@/shared/constants';
import { isRuntimeMessage, sendRuntimeMessage } from '@/shared/messages';
import type { Result } from '@/shared/types';

async function startPicking(): Promise<void> {
  // Side panel -> service worker (which resolves the active tab and relays to the picker)
  const res = await sendRuntimeMessage<Result<void>>({ type: MESSAGE_TYPES.START_PICK });
  if (!res.ok) {
    // e.g. a chrome:// page, or the tab could not be reached — surface res.error
  }
}

// Listen for the picked element coming back from the picker (payload IS the LocatorSet)
chrome.runtime.onMessage.addListener((message: unknown) => {
  if (!isRuntimeMessage(message)) return;
  if (message.type === MESSAGE_TYPES.ELEMENT_PICKED) {
    renderLocators(message.payload);
  }
});
```

```typescript
// src/content/picker.ts — after the user clicks an element

import { MESSAGE_TYPES } from '@/shared/constants';
import { sendRuntimeMessage } from '@/shared/messages';
import { buildLocatorSet } from '@/shared/locators';

function onElementClicked(target: Element): void {
  // buildLocatorSet is PURE — no chrome/DOM side effects beyond reading.
  // The payload IS the LocatorSet directly, not wrapped in a `{ locators }` object.
  void sendRuntimeMessage({
    type: MESSAGE_TYPES.ELEMENT_PICKED,
    payload: buildLocatorSet(target),
  });
}
```

---

## Service Worker -> Page (MAIN-World Script Run)

`RUN_SCRIPT` does not go to the content script — the service worker injects the runner into the page's MAIN world via `chrome.scripting`. The panel already resolved the script and sends its **code** directly; the service worker never looks a script up by id:

```typescript
// src/background/service-worker.ts (simplified from the real withActiveRunnableTab flow)

async function runScriptInPage(tabId: number, code: string): Promise<Result<void>> {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: runUserScript,
    args: [code],
  });

  return { ok: true, value: undefined };
}
```

---

## Rules

1. **Always type messages** — never send untyped objects
2. **Always handle errors** — check `chrome.runtime.lastError` and catch exceptions
3. **Return `true` from `onMessage`** — when handler is async (keeps channel open)
4. **Validate incoming messages** — type guard before processing
5. **Never assume sender** — verify `sender.tab` or `sender.id` for security
6. **Picker may be absent** — `chrome.tabs.sendMessage` to a chrome:// or Web Store tab will reject; catch it
