# Message Passing Guide — senmurv

> Typed message schemas, routing patterns, port lifecycle, and error handling.

---

## Message Type System

All messages use a discriminated union pattern (`RuntimeMessage`) with a `type` field:

```typescript
// src/shared/messages.ts

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

// Content picker -> side panel: an element was clicked, here are its locators
export interface ElementPickedMessage {
  type: typeof MESSAGE_TYPES.ELEMENT_PICKED;
  payload: {
    locators: LocatorSet;
  };
}

// Side panel -> service worker: run a saved script in the page's MAIN world
export interface RunScriptMessage {
  type: typeof MESSAGE_TYPES.RUN_SCRIPT;
  payload: {
    scriptId: string;
  };
}

// Side panel -> service worker: script CRUD
export interface GetScriptsMessage {
  type: typeof MESSAGE_TYPES.GET_SCRIPTS;
}

export interface SaveScriptMessage {
  type: typeof MESSAGE_TYPES.SAVE_SCRIPT;
  payload: {
    script: SavedScriptInput;
  };
}

export interface DeleteScriptMessage {
  type: typeof MESSAGE_TYPES.DELETE_SCRIPT;
  payload: {
    scriptId: string;
  };
}

// Response type
export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

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
// src/shared/messages.ts — helper function

export async function sendMessage<T>(message: RuntimeMessage): Promise<MessageResponse<T>> {
  try {
    const response = await chrome.runtime.sendMessage(message);
    if (chrome.runtime.lastError) {
      return { success: false, error: chrome.runtime.lastError.message };
    }
    return response as MessageResponse<T>;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Usage in a Side Panel tab
import { sendMessage, MESSAGE_TYPES } from '@/shared/messages';

const response = await sendMessage<SavedScript[]>({
  type: MESSAGE_TYPES.GET_SCRIPTS,
});

if (response.success) {
  renderScripts(response.data!);
} else {
  showError(response.error!);
}
```

---

## Receiving Messages (Background Service Worker)

```typescript
// src/background/service-worker.ts

import { type RuntimeMessage, MESSAGE_TYPES } from '@/shared/messages';

chrome.runtime.onMessage.addListener(
  (
    message: RuntimeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ) => {
    // Type guard — reject unknown messages
    if (!message || !message.type || !(message.type in MESSAGE_TYPES)) {
      sendResponse({ success: false, error: 'Unknown message type' });
      return false;
    }

    // Async handler — return true to keep sendResponse alive
    handleMessage(message, sender)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : 'Handler failed',
        });
      });

    return true; // Keep message channel open for async response
  }
);

async function handleMessage(
  message: RuntimeMessage,
  sender: chrome.runtime.MessageSender
): Promise<MessageResponse> {
  switch (message.type) {
    case MESSAGE_TYPES.RUN_SCRIPT:
      return handleRunScript(message.payload.scriptId);
    case MESSAGE_TYPES.GET_SCRIPTS:
      return handleGetScripts();
    case MESSAGE_TYPES.SAVE_SCRIPT:
      return handleSaveScript(message.payload.script);
    case MESSAGE_TYPES.DELETE_SCRIPT:
      return handleDeleteScript(message.payload.scriptId);
    default:
      return { success: false, error: `Unhandled message: ${message.type}` };
  }
}
```

---

## Side Panel <-> Content Picker Communication

The locator picker is reached by messaging the **active tab** directly (the picker is the content script). It replies via the `ELEMENT_PICKED` message routed back to the side panel.

```typescript
// src/sidepanel/components/LocatorTab.tsx — start picking on the active tab

import { MESSAGE_TYPES } from '@/shared/messages';

async function startPicking(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  try {
    // Side panel -> content picker (targeted at the active tab)
    await chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.START_PICK });
  } catch {
    // No picker on this tab (e.g. chrome:// page) — surface a hint to the user
  }
}

// Listen for the picked element coming back from the picker
chrome.runtime.onMessage.addListener((message: RuntimeMessage) => {
  if (message.type === MESSAGE_TYPES.ELEMENT_PICKED) {
    renderLocators(message.payload.locators);
  }
});
```

```typescript
// src/content/picker.ts — after the user clicks an element

import { sendMessage, MESSAGE_TYPES } from '@/shared/messages';
import { generateLocatorSet } from '@/shared/locators';

function onElementClicked(target: Element): void {
  const locators = generateLocatorSet(target); // PURE — no chrome/DOM side effects beyond reading
  void sendMessage({
    type: MESSAGE_TYPES.ELEMENT_PICKED,
    payload: { locators },
  });
}
```

---

## Service Worker -> Page (MAIN-World Script Run)

`RUN_SCRIPT` does not go to the content script — the service worker injects the runner into the page's MAIN world via `chrome.scripting`:

```typescript
// src/background/service-worker.ts

async function handleRunScript(scriptId: string): Promise<MessageResponse> {
  const script = (await getScripts()).find((s) => s.id === scriptId);
  if (!script) return { success: false, error: 'Script not found' };

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { success: false, error: 'No active tab' };

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    func: runUserScript,
    args: [script.code],
  });

  return { success: true };
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
