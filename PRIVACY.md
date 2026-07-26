# Senmurv — Privacy Policy

_Last updated: 2026-07-25_

## Summary

Senmurv does not collect, transmit, or sell any personal data. The scripts and
settings you create are stored locally inside your browser via
`chrome.storage.local` and never leave your device. The extension only reads or
acts on page content in response to an action you explicitly trigger, and that
information is never sent anywhere.

## Data we handle

| Data                                                                         | Where it lives                                                                                                                                                                                                                                                                                                                    | Sent off-device? |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| JavaScript snippets you save / import                                        | `chrome.storage.local` (your browser profile)                                                                                                                                                                                                                                                                                     | No               |
| Preferences (e.g. selected locale)                                           | `chrome.storage.local` (your browser profile)                                                                                                                                                                                                                                                                                     | No               |
| Generated test data (names, phone, address, etc.)                            | Created on demand in the side panel; copied to your clipboard only when you click **Copy**                                                                                                                                                                                                                                        | No               |
| Page DOM read by the locator picker / "Test a locator" / "Harden selector"   | Read transiently on the active tab when you start picking, test a selector, highlight its matches, or harden a selector, to compute locators                                                                                                                                                                                      | No               |
| Form fields filled by the **Fill** tool                                      | Written to the active tab only when you click **Generate & Fill**, using data generated on your device                                                                                                                                                                                                                            | No               |
| Your saved scripts run by **Execute JS Script**                              | Executed in the active tab's page context only when you click **Run**; the code is the one you entered                                                                                                                                                                                                                            | No               |
| Page changes made by **Tools → Bypass**                                      | Attributes on the active tab are modified only when you click **Bypass**, and the original values are kept in memory so **Restore** can put them back. Nothing is stored or transmitted; the counts shown are numbers only, never page content. Revealing password fields is off by default.                                      | No               |
| Site data cleared by **Tools → Site data**                                   | Only when you click **Clear**, the extension deletes the active site's own storage (Cache Storage, IndexedDB, local/session storage, non-HttpOnly cookies, service workers) for that origin. It reads the site's storage sizes to show you a breakdown. Nothing is stored or transmitted; the deletion is local and irreversible. | No               |
| Page geometry / colours / fonts read by **Tools → Measure / Colour / Fonts** | Read transiently on the active tab while you hover or click, to compute sizes, box models, colours and typography. Fonts also shows a short preview (≤60 chars) of the hovered text so you can see what it applies to. The eyedropper samples a screen pixel only when you invoke it. Nothing is stored or transmitted.           | No               |
| Page structure read by **Tools → Tab order / Accessibility**                 | Read transiently on the active tab when you scan, to compute the tab sequence or check WCAG rules. Element names/text appear only in findings shown to you (and in a report you choose to download). Nothing is stored or transmitted.                                                                                            | No               |
| Element state read by **Tools → Assertions**                                 | Read transiently on the active tab when you click an element, to build test assertions: its text, form value, checked/enabled/visible state and selected attributes. Shown to you only; nothing is stored or transmitted.                                                                                                         | No               |
| Element stack read by **Tools → Stacking**                                   | Read transiently on the active tab when you click a point, to list the elements under it and their computed style (z-index, opacity, pointer-events) so you can find a click interceptor. Shown to you only; nothing is stored or transmitted.                                                                                    | No               |
| Field constraints read by **Tools → Validation**                             | Read transiently on the active tab when you click a form field, to show its validation attributes and current validity. Shown to you only; nothing is stored or transmitted.                                                                                                                                                      | No               |
| Region emulation by **Tools → Region**                                       | When you click **Apply**, the extension overrides the active tab's own JavaScript clock/timezone/locale/geolocation APIs so page code reads the region you chose. Nothing is read from the page, stored, or transmitted; **Restore** or a reload undoes it. It does not change your IP or any network request.                    | No               |
| Token pasted into **Tools → JWT decoder**                                    | Decoded entirely in the side panel from text you paste; the token and its claims never leave your device and are not stored. The signature is displayed but never verified.                                                                                                                                                       | No               |
| Telemetry / analytics                                                        | We do not collect any                                                                                                                                                                                                                                                                                                             | —                |

## Permissions and why we need them

| Permission                   | Justification                                                                                                                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sidePanel`                  | Renders the extension's user interface in Chrome's side panel.                                                                                                                                                 |
| `scripting`                  | Injects the element picker and runs your saved scripts in the active tab — only in response to a button you click.                                                                                             |
| `storage`                    | Persists your saved scripts and preferences between browser sessions (`chrome.storage.local`).                                                                                                                 |
| `tabs`                       | Identifies the active tab so actions run on the page you are currently viewing.                                                                                                                                |
| `<all_urls>` host permission | QA engineers test arbitrary web apps, so the locator, fill, and run-script tools must work on whichever http/https page you choose. Nothing runs until you explicitly trigger it; Senmurv does not phone home. |

## Remotely-hosted code

Senmurv does **not** download or execute remotely-hosted code. The
**Execute JS Script** tool runs only the JavaScript that **you** type, paste, or
import, locally on the page you are viewing — the same as running a
`javascript:` bookmarklet.

## Third parties

Senmurv has no third-party SDKs, no analytics, and no advertising integrations.
The extension makes no outbound network requests of its own.

## Contact

Open an issue at <https://github.com/AlirezaSoltaniJazi/senmurv/issues>.
