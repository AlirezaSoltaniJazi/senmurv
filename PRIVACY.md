# Senmurv — Privacy Policy

_Last updated: 2026-06-21_

## Summary

Senmurv does not collect, transmit, or sell any personal data. The scripts and
settings you create are stored locally inside your browser via
`chrome.storage.local` and never leave your device. The extension only reads or
acts on page content in response to an action you explicitly trigger, and that
information is never sent anywhere.

## Data we handle

| Data                                                   | Where it lives                                                                                         | Sent off-device? |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ---------------- |
| JavaScript snippets you save / import                  | `chrome.storage.local` (your browser profile)                                                          | No               |
| Preferences (e.g. selected locale)                     | `chrome.storage.local` (your browser profile)                                                          | No               |
| Generated test data (names, phone, address, etc.)      | Created on demand in the side panel; copied to your clipboard only when you click **Copy**             | No               |
| Page DOM read by the locator picker / "Test a locator" | Read transiently on the active tab when you start picking or test a selector, to compute locators      | No               |
| Form fields filled by the **Fill** tool                | Written to the active tab only when you click **Generate & Fill**, using data generated on your device | No               |
| Your saved scripts run by **Execute JS Script**        | Executed in the active tab's page context only when you click **Run**; the code is the one you entered | No               |
| Telemetry / analytics                                  | We do not collect any                                                                                  | —                |

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
