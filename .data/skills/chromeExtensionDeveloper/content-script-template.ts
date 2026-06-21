/**
 * Content script template for senmurv (the locator picker).
 * Copy and adapt for new content script features.
 */

// Type imports
import type { RuntimeMessage, MessageResponse } from '@/shared/types';

// Value imports
import { MESSAGE_TYPES, sendMessage } from '@/shared/messages';
import { generateLocatorSet } from '@/shared/locators';

// Constants
const HOST_ELEMENT_TAG = 'senmurv-picker-overlay';

// State (minimal — prefer chrome.storage for persistence)
let hostElement: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;

// --- Initialization ---

function init(): void {
  // Check if already initialized
  if (document.querySelector(HOST_ELEMENT_TAG)) {
    return;
  }

  // Register message listener — stay idle until START_PICK arrives.
  // Do NOT inject the overlay or attach hover/click listeners here.
  chrome.runtime.onMessage.addListener(handleMessage);
}

// --- Message Handling ---

function handleMessage(
  message: RuntimeMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: MessageResponse) => void,
): boolean {
  switch (message.type) {
    case MESSAGE_TYPES.START_PICK:
      startPicking();
      sendResponse({ success: true });
      return false; // Synchronous response

    default:
      return false;
  }
}

function startPicking(): void {
  // Activate hover-highlight + click-capture; show the overlay
  injectUI();
  showHighlight();
}

// --- UI Injection (Shadow DOM) ---

function injectUI(): void {
  // Create host element with custom tag (won't conflict with page)
  hostElement = document.createElement(HOST_ELEMENT_TAG);

  // Closed shadow — page cannot access our DOM
  shadowRoot = hostElement.attachShadow({ mode: 'closed' });

  // Scoped styles — won't leak to page
  const styles = document.createElement('style');
  styles.textContent = `
    :host {
      all: initial;
      position: fixed;
      z-index: 2147483647;
      pointer-events: none;
    }
    .highlight {
      position: fixed;
      border: 2px solid #4CAF50;
      background: rgba(76, 175, 80, 0.15);
      pointer-events: none;
      box-sizing: border-box;
    }
  `;

  shadowRoot.appendChild(styles);
  document.documentElement.appendChild(hostElement);
}

// --- Hover Highlight + Click Capture ---

function showHighlight(): void {
  // Attach listeners only while picking — detach on capture in cleanup()
  document.addEventListener('mouseover', onHover, true);
  document.addEventListener('click', onClick, true);
}

function onHover(event: MouseEvent): void {
  if (!shadowRoot) return;
  const target = event.target as Element | null;
  if (!target) return;

  // Debounce/throttle in real code — mouseover fires rapidly
  const rect = target.getBoundingClientRect();
  let box = shadowRoot.querySelector<HTMLDivElement>('.highlight');
  if (!box) {
    box = document.createElement('div');
    box.className = 'highlight';
    shadowRoot.appendChild(box);
  }
  box.style.cssText += `top:${rect.top}px;left:${rect.left}px;width:${rect.width}px;height:${rect.height}px;`;
}

function onClick(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();

  const target = event.target as Element | null;
  if (!target) return;

  // generateLocatorSet is PURE — defined in @/shared/locators
  void sendMessage({
    type: MESSAGE_TYPES.ELEMENT_PICKED,
    payload: { locators: generateLocatorSet(target) },
  });

  cleanup(); // Stop picking after one capture
}

// --- Cleanup ---

function cleanup(): void {
  document.removeEventListener('mouseover', onHover, true);
  document.removeEventListener('click', onClick, true);

  hostElement?.remove();
  hostElement = null;
  shadowRoot = null;
}

// --- Entry Point ---

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
