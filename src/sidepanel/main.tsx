import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// Long-lived port so the service worker can detect when this panel closes and
// tear down any in-page mode (Tool / pick / record) still running on the tab it
// was driving. Chrome does NOT run React effect cleanups on panel close, so this
// port — opened at document scope, NOT inside a React effect (which also dodges
// StrictMode's double-invoke) — is the reliable "panel closed" signal.
//
// The heartbeat stays under the 30s service-worker idle threshold so the worker
// never sleeps while the panel is open; that way its onDisconnect means the
// panel actually closed, not that an idle worker was recycled mid-session.
const HEARTBEAT_MS = 25_000;

function connectLifecyclePort(): void {
  let port: chrome.runtime.Port;
  try {
    port = chrome.runtime.connect({ name: 'panel' });
  } catch {
    // Extension context invalidated (reloaded / updated) — nothing to keep alive.
    return;
  }
  const heartbeat = setInterval(() => {
    try {
      port.postMessage({ t: 'hb' });
    } catch {
      // Port is gone; the onDisconnect handler re-establishes it.
    }
  }, HEARTBEAT_MS);
  port.onDisconnect.addListener(() => {
    clearInterval(heartbeat);
    // A genuine panel close destroys this whole document, so this never runs
    // then. It only fires on a rare worker recycle — reconnect so a later close
    // is still detected (and the new port wakes the worker).
    connectLifecyclePort();
  });
}

connectLifecyclePort();

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
