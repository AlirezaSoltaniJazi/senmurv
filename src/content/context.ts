import { sendRuntimeMessage } from '@/shared/messages';
import type { RuntimeMessage } from '@/shared/messages';

/**
 * Extension-context helpers shared by every in-page mode.
 *
 * WHY THE TWO SEND VARIANTS DIFFER — this is load-bearing, not style.
 *
 * Messages addressed to the side panel (ELEMENT_PICKED, ACTION_RECORDED, and
 * the Tools streams) are answered by nobody when the panel is closed: the
 * service worker's `default: return false` declines them and no other listener
 * responds. A `chrome.runtime.sendMessage` promise can settle as a rejection in
 * that situation, and today's `notify` treats any rejection as "we have been
 * orphaned — tear down".
 *
 * For a terminal message (one pick, one recorded step) that is the right
 * reading. For a high-frequency stream it is not: a hover mode would tear
 * itself down on its first frame whenever the panel happened to be closed, and
 * it would surface as "font mode randomly stops working" rather than as a
 * message-passing problem. Streams therefore use `notifyQuiet`, which reacts
 * only to a genuinely dead extension context and ignores delivery failures.
 */

/** Is the extension context still valid? (False for an orphaned content script.) */
export function contextAlive(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

/**
 * Fire-and-forget a terminal message. After the extension reloads/updates this
 * content script lingers in the page with an invalidated context and sending
 * throws "Extension context invalidated" — so `onDead` tears the mode down.
 */
export function notify(message: RuntimeMessage, onDead: () => void): void {
  if (!contextAlive()) {
    onDead();
    return;
  }
  void sendRuntimeMessage(message).catch(() => onDead());
}

/**
 * Fire-and-forget a streamed message. Guards on the context being alive, but
 * NEVER tears the mode down on a rejection — a closed side panel is the normal
 * case for a stream, not an error.
 */
export function notifyQuiet(message: RuntimeMessage): void {
  if (!contextAlive()) return;
  void sendRuntimeMessage(message).catch(() => {
    // No listener (panel closed) — expected for a stream. Keep the mode running.
  });
}
