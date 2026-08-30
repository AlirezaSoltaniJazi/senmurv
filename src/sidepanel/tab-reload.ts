import { browser } from '@/shared/browser-api';

/**
 * Reload the tab the panel is acting on. Used by the Cookies / Storage tabs so a
 * changed cookie or storage value is actually picked up by the site (a locale
 * cookie, for instance, does nothing until the page re-renders).
 *
 * Fire-and-forget on purpose: a failed reload (tab closed, blocked page) must
 * never turn a successful write into a visible error.
 */
export function reloadActiveTab(): void {
  void browser.tabs
    .query({ active: true, lastFocusedWindow: true })
    .then((tabs) => {
      const id = tabs[0]?.id;
      return typeof id === 'number' ? browser.tabs.reload(id) : undefined;
    })
    .catch(() => undefined);
}
