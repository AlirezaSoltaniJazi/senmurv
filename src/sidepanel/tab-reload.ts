/**
 * Reload the tab the panel is acting on. Used by the Cookies / Storage tabs so a
 * changed cookie or storage value is actually picked up by the site (a locale
 * cookie, for instance, does nothing until the page re-renders).
 *
 * Fire-and-forget on purpose: a failed reload (tab closed, blocked page) must
 * never turn a successful write into a visible error.
 */
export function reloadActiveTab(): void {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) return;
    const id = tabs[0]?.id;
    if (typeof id === 'number') void chrome.tabs.reload(id).catch(() => undefined);
  });
}
