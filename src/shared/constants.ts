/** browser.storage.local keys. */
export const STORAGE_KEYS = {
  SCRIPTS: 'senmurv:scripts',
  TASKS: 'senmurv:tasks',
  CHECKLISTS: 'senmurv:checklists',
  NOTES: 'senmurv:notes',
  PREFS: 'senmurv:prefs',
  PROFILES: 'senmurv:profiles',
  QUERY_PARAM_SETS: 'senmurv:queryParamSets',
  ACCOUNTS: 'senmurv:accounts',
  DEFAULT_PASSWORD: 'senmurv:defaultPassword',
  ACCOUNTS_SECURITY: 'senmurv:accountsSecurity',
  SCORECARDS: 'senmurv:scorecards',
  SCORECARD_TEMPLATES: 'senmurv:scorecardTemplates',
  DEFAULT_OTP: 'senmurv:defaultOtp',
} as const;

/** Runtime message discriminants. Keep in sync with the RuntimeMessage union. */
export const MESSAGE_TYPES = {
  START_PICK: 'START_PICK',
  START_PICK_FIELDS: 'START_PICK_FIELDS',
  CANCEL_PICK: 'CANCEL_PICK',
  ELEMENT_PICKED: 'ELEMENT_PICKED',
  FIELD_PICKED: 'FIELD_PICKED',
  PICK_CANCELLED: 'PICK_CANCELLED',
  START_RECORD: 'START_RECORD',
  STOP_RECORD: 'STOP_RECORD',
  ACTION_RECORDED: 'ACTION_RECORDED',
  RUN_SCRIPT: 'RUN_SCRIPT',
  STOP_SCRIPT: 'STOP_SCRIPT',
  GET_SCRIPTS: 'GET_SCRIPTS',
  SAVE_SCRIPT: 'SAVE_SCRIPT',
  SET_SCRIPTS: 'SET_SCRIPTS',
  DELETE_SCRIPT: 'DELETE_SCRIPT',
  TEST_LOCATOR: 'TEST_LOCATOR',
  GET_TASKS: 'GET_TASKS',
  SAVE_TASK: 'SAVE_TASK',
  DELETE_TASK: 'DELETE_TASK',
  CLEAR_TASKS: 'CLEAR_TASKS',
  RENAME_TAG: 'RENAME_TAG',
  DELETE_TAG: 'DELETE_TAG',
  GET_CHECKLISTS: 'GET_CHECKLISTS',
  SAVE_CHECKLIST: 'SAVE_CHECKLIST',
  SET_CHECKLISTS: 'SET_CHECKLISTS',
  DELETE_CHECKLIST: 'DELETE_CHECKLIST',
  GET_NOTES: 'GET_NOTES',
  SAVE_NOTE: 'SAVE_NOTE',
  SET_NOTES: 'SET_NOTES',
  DELETE_NOTE: 'DELETE_NOTE',
  GET_PREFS: 'GET_PREFS',
  SAVE_PREFS: 'SAVE_PREFS',
  // Tools tab — the generic in-page transport every sub-tool shares. Tool-
  // specific messages (BYPASS_PAGE, CLEAR_SITE_DATA, TOOL_STREAM, …) are added
  // by the phase that implements the tool, so no type ships without a handler.
  TOOL_PING: 'TOOL_PING',
  START_TOOL_MODE: 'START_TOOL_MODE',
  STOP_TOOL_MODE: 'STOP_TOOL_MODE',
  HIGHLIGHT_ELEMENT: 'HIGHLIGHT_ELEMENT',
  // Locator tab — highlight every element matching a CSS/XPath, numbered, and
  // scroll a chosen match into view. A live in-page mode (PageMode 'match').
  HIGHLIGHT_MATCHES: 'HIGHLIGHT_MATCHES',
  SCROLL_TO_MATCH: 'SCROLL_TO_MATCH',
  // Selector Hardener — resolve a fragile selector to its first match and return
  // that element's ranked locators (the hardened replacement) plus the count.
  RESOLVE_SELECTOR: 'RESOLVE_SELECTOR',
  // tab → panel pushes from an in-page tool mode (no service-worker handler)
  TOOL_STREAM: 'TOOL_STREAM',
  TOOL_PICKED: 'TOOL_PICKED',
  // Tab order + Accessibility (both retain elements for lazy locators)
  SCAN_TAB_ORDER: 'SCAN_TAB_ORDER',
  GET_STOP_LOCATORS: 'GET_STOP_LOCATORS',
  RUN_A11Y_SCAN: 'RUN_A11Y_SCAN',
  // Bypass
  BYPASS_PAGE: 'BYPASS_PAGE',
  RESTORE_PAGE: 'RESTORE_PAGE',
  GET_BYPASS_STATE: 'GET_BYPASS_STATE',
  BYPASS_XRM: 'BYPASS_XRM',
  BYPASS_STATE_CHANGED: 'BYPASS_STATE_CHANGED',
  // Web API URL — worker-local MAIN-world read (same shape as BYPASS_XRM) that
  // resolves the current Dynamics record into its Dataverse Web API URL (God
  // Mode's "Open record in Web API").
  GET_XRM_WEB_API_URL: 'GET_XRM_WEB_API_URL',
  // Site data
  PROBE_SITE_STORAGE: 'PROBE_SITE_STORAGE',
  CLEAR_SITE_DATA: 'CLEAR_SITE_DATA',
  // Logical names — worker-local MAIN-world read of the Dynamics Xrm API, then
  // relayed to the content script, which draws the overlay. STOP_TOOL_MODE clears.
  SHOW_LOGICAL_NAMES: 'SHOW_LOGICAL_NAMES',
  DRAW_LOGICAL_NAMES: 'DRAW_LOGICAL_NAMES',
  // Region emulator — worker-local MAIN-world shim (clock/timezone/locale/geo)
  APPLY_REGION: 'APPLY_REGION',
  RESTORE_REGION: 'RESTORE_REGION',
  GET_REGION_STATE: 'GET_REGION_STATE',
  // Storage tab — read/write the page's localStorage + sessionStorage. Injected
  // into the ISOLATED world (a content script's storage IS the page origin's),
  // so these need no permission beyond the existing scripting + host access.
  READ_WEB_STORAGE: 'READ_WEB_STORAGE',
  WRITE_WEB_STORAGE: 'WRITE_WEB_STORAGE',
  REMOVE_WEB_STORAGE: 'REMOVE_WEB_STORAGE',
  CLEAR_WEB_STORAGE: 'CLEAR_WEB_STORAGE',
  // Cookies tab — browser.cookies against the active tab's URL. Requires the
  // "cookies" permission; it is the only way to see or edit HttpOnly cookies.
  LIST_COOKIES: 'LIST_COOKIES',
  SET_COOKIE: 'SET_COOKIE',
  REMOVE_COOKIE: 'REMOVE_COOKIE',
  CLEAR_COOKIES: 'CLEAR_COOKIES',
  // Value profiles (shared by the Cookies + Storage tabs)
  GET_PROFILES: 'GET_PROFILES',
  SAVE_PROFILE: 'SAVE_PROFILE',
  SET_PROFILES: 'SET_PROFILES',
  DELETE_PROFILE: 'DELETE_PROFILE',
  // Query param sets — a named snapshot of the Query params builder (base +
  // every row + hash), recalled as one chip instead of one param at a time.
  GET_QUERY_PARAM_SETS: 'GET_QUERY_PARAM_SETS',
  SAVE_QUERY_PARAM_SET: 'SAVE_QUERY_PARAM_SET',
  SET_QUERY_PARAM_SETS: 'SET_QUERY_PARAM_SETS',
  DELETE_QUERY_PARAM_SET: 'DELETE_QUERY_PARAM_SET',
  // Accounts tab — saved login credentials + one-click login. Encryption is
  // exclusive to the service worker (shared/crypto.ts); the panel never sees
  // plaintext, and never asks for it back.
  GET_ACCOUNTS: 'GET_ACCOUNTS',
  SAVE_ACCOUNT: 'SAVE_ACCOUNT',
  DELETE_ACCOUNT: 'DELETE_ACCOUNT',
  DUPLICATE_ACCOUNT: 'DUPLICATE_ACCOUNT',
  RENAME_GROUP: 'RENAME_GROUP',
  APPLY_LOCATOR_TO_GROUPS: 'APPLY_LOCATOR_TO_GROUPS',
  GET_DEFAULT_PASSWORD_STATE: 'GET_DEFAULT_PASSWORD_STATE',
  SAVE_DEFAULT_PASSWORD: 'SAVE_DEFAULT_PASSWORD',
  CLEAR_DEFAULT_PASSWORD: 'CLEAR_DEFAULT_PASSWORD',
  GET_ACCOUNTS_LOCK_STATE: 'GET_ACCOUNTS_LOCK_STATE',
  SET_ACCOUNTS_PIN: 'SET_ACCOUNTS_PIN',
  UNLOCK_ACCOUNTS: 'UNLOCK_ACCOUNTS',
  CHANGE_ACCOUNTS_PIN: 'CHANGE_ACCOUNTS_PIN',
  SET_ACCOUNTS_SESSION_MINUTES: 'SET_ACCOUNTS_SESSION_MINUTES',
  LOCK_ACCOUNTS: 'LOCK_ACCOUNTS',
  RUN_ACCOUNT_LOGIN: 'RUN_ACCOUNT_LOGIN',
  ACCOUNT_LOGIN_FILL: 'ACCOUNT_LOGIN_FILL',
  EXPORT_ACCOUNTS: 'EXPORT_ACCOUNTS',
  IMPORT_ACCOUNTS: 'IMPORT_ACCOUNTS',
  // Scorecard tool — a named, saved rubric (categories + scores). Same shape
  // as Query param sets: GET the list, SAVE upserts one by id, DELETE by id.
  GET_SCORECARDS: 'GET_SCORECARDS',
  SAVE_SCORECARD: 'SAVE_SCORECARD',
  DELETE_SCORECARD: 'DELETE_SCORECARD',
  // Scorecard templates — reusable named rubrics (categories only, no scores),
  // e.g. "QA Interview". No built-in template ships; the user builds each one.
  GET_SCORECARD_TEMPLATES: 'GET_SCORECARD_TEMPLATES',
  SAVE_SCORECARD_TEMPLATE: 'SAVE_SCORECARD_TEMPLATE',
  DELETE_SCORECARD_TEMPLATE: 'DELETE_SCORECARD_TEMPLATE',
  // Default OTP code — same shape as the Default password messages above.
  GET_DEFAULT_OTP_STATE: 'GET_DEFAULT_OTP_STATE',
  SAVE_DEFAULT_OTP: 'SAVE_DEFAULT_OTP',
  CLEAR_DEFAULT_OTP: 'CLEAR_DEFAULT_OTP',
} as const;

/** Locales/countries offered in the data + phone tools (faker instances mapped in faker-data.ts). */
export const SUPPORTED_LOCALES = [
  'en_GB',
  'en_US',
  'pt_PT',
  'nl_BE',
  'nl',
  'de_CH',
  'de',
  'it',
  'fr',
  'es',
  'nb_NO',
  'sv',
  'fi',
  'cs_CZ',
  'de_AT',
] as const;

export const DEFAULT_LOCALE = 'en_GB';

/** Human (country) labels for the locale switcher. */
export const LOCALE_LABELS: Record<string, string> = {
  en_GB: 'United Kingdom',
  en_US: 'United States',
  pt_PT: 'Portugal',
  nl_BE: 'Belgium',
  nl: 'Netherlands',
  de_CH: 'Switzerland',
  de: 'Germany',
  it: 'Italy',
  fr: 'France',
  es: 'Spain',
  nb_NO: 'Norway',
  sv: 'Sweden',
  fi: 'Finland',
  cs_CZ: 'Czech Republic',
  de_AT: 'Austria',
};

/** Attributes treated as automation test ids, in preference order. */
export const TEST_ID_ATTRS = [
  'data-testid',
  'data-test-id',
  'data-test',
  'data-cy',
  'data-qa',
  // Dynamics 365 / Power Apps expose a stable `data-id` on every control while
  // their element `id` is regenerated per session (see isStableId). Lowest
  // preference so genuine test-ids still win.
  'data-id',
] as const;

/** Locator strategy ranking — earlier is more stable / preferred. */
export const LOCATOR_PRIORITY = [
  'testId',
  'formControl',
  'id',
  'name',
  'attr',
  'ariaLabel',
  'roleName',
  'text',
  'linkText',
  'partialLinkText',
  'css',
  'className',
  'xpath',
  // Selenium-only (no CSS/XPath equivalent) — always the last resort.
  'relative',
] as const;

/** Manual UI-zoom (font-scale) slider bounds + step. */
export const FONT_SCALE_MIN = 0.8;
export const FONT_SCALE_MAX = 1.7;
export const FONT_SCALE_STEP = 0.05;

/** Preset chip → zoom multiplier (mirrors the `.app.font-*` CSS). */
export const FONT_PRESET_ZOOM = {
  small: 0.9,
  medium: 1,
  large: 1.15,
  xlarge: 1.3,
} as const;

/** How many tools can be pinned to the top of the Tools launcher at once — bounds + default. */
export const MAX_PINNED_TOOLS_MIN = 1;
export const MAX_PINNED_TOOLS_MAX = 10;
export const MAX_PINNED_TOOLS_DEFAULT = 5;

/** Flow run-popup (in-page HUD) auto-close delay bounds + default, in seconds. */
export const HUD_SECONDS_MIN = 1;
export const HUD_SECONDS_MAX = 60;
export const HUD_SECONDS_DEFAULT = 3;

/** Flow element-find timeout bounds + default, in seconds (waitFor's per-step wait). */
export const FIND_TIMEOUT_SECONDS_MIN = 1;
export const FIND_TIMEOUT_SECONDS_MAX = 120;
export const FIND_TIMEOUT_SECONDS_DEFAULT = 10;

/** Accounts tab PIN length bounds (digits only). */
export const ACCOUNTS_PIN_MIN_LENGTH = 6;
export const ACCOUNTS_PIN_MAX_LENGTH = 15;

/** Account description tooltip hover-delay bounds + default, in seconds. */
export const ACCOUNT_TOOLTIP_DELAY_SECONDS_MIN = 1;
export const ACCOUNT_TOOLTIP_DELAY_SECONDS_MAX = 10;
export const ACCOUNT_TOOLTIP_DELAY_SECONDS_DEFAULT = 2;

/** One-click account login's page-navigate timeout bounds + default, in seconds. */
export const NAVIGATE_TIMEOUT_SECONDS_MIN = 5;
export const NAVIGATE_TIMEOUT_SECONDS_MAX = 120;
export const NAVIGATE_TIMEOUT_SECONDS_DEFAULT = 20;

/** Accounts login-error banner auto-dismiss bounds + default, in seconds. */
export const ACCOUNT_LOGIN_ERROR_DISPLAY_SECONDS_MIN = 2;
export const ACCOUNT_LOGIN_ERROR_DISPLAY_SECONDS_MAX = 30;
export const ACCOUNT_LOGIN_ERROR_DISPLAY_SECONDS_DEFAULT = 5;

/** Accounts "Apply to group(s)" result banner auto-dismiss bounds + default, in seconds. */
export const ACCOUNT_APPLY_RESULT_DISPLAY_SECONDS_MIN = 2;
export const ACCOUNT_APPLY_RESULT_DISPLAY_SECONDS_MAX = 30;
export const ACCOUNT_APPLY_RESULT_DISPLAY_SECONDS_DEFAULT = 5;

/** Site data tool's "click again to confirm" arm window bounds + default, in seconds. */
export const SITE_DATA_CONFIRM_SECONDS_MIN = 1;
export const SITE_DATA_CONFIRM_SECONDS_MAX = 10;
export const SITE_DATA_CONFIRM_SECONDS_DEFAULT = 3;

/** Notes draft-autosave debounce bounds + default, in milliseconds. */
export const NOTES_AUTOSAVE_MS_MIN = 300;
export const NOTES_AUTOSAVE_MS_MAX = 5000;
export const NOTES_AUTOSAVE_MS_DEFAULT = 1200;

/**
 * One-click Accounts login's post-navigate, pre-fill delay bounds + default,
 * in seconds. Default is 0 — most sites don't need it; some SPAs render the
 * login form before it's actually interactive (e.g. hydration).
 */
export const LOGIN_PREFILL_DELAY_SECONDS_MIN = 0;
export const LOGIN_PREFILL_DELAY_SECONDS_MAX = 30;
export const LOGIN_PREFILL_DELAY_SECONDS_DEFAULT = 0;

/** Locator tab's "Added!" confirmation display bounds + default, in seconds. */
export const LOCATOR_ADDED_CONFIRM_SECONDS_MIN = 1;
export const LOCATOR_ADDED_CONFIRM_SECONDS_MAX = 10;
export const LOCATOR_ADDED_CONFIRM_SECONDS_DEFAULT = 2;

/** Test automation frameworks we emit snippets for. */
export const FRAMEWORKS = ['playwright', 'wdio', 'cypress', 'selenium', 'robot'] as const;

export const FRAMEWORK_LABELS: Record<string, string> = {
  playwright: 'Playwright',
  wdio: 'WebdriverIO',
  cypress: 'Cypress',
  selenium: 'Selenium',
  robot: 'Robot Framework',
};

/** URL schemes where content scripts / script injection are not allowed. */
export const BLOCKED_URL_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'moz-extension://',
  'about:',
  // The declared content script matches http/https only, so these never have a
  // picker to talk to; naming them turns a confusing injection failure into a
  // clear "this page does not allow extensions" message.
  'file://',
  'view-source:',
  'https://chrome.google.com/webstore',
  'https://chromewebstore.google.com',
  'https://addons.mozilla.org',
] as const;

// ---------------------------------------------------------------------------
// Tools tab
// ---------------------------------------------------------------------------

/** Custom-element tags Senmurv injects. Anything walking the page must skip these. */
export const SENMURV_HOST_TAGS = ['senmurv-picker-overlay', 'senmurv-recorder-indicator'] as const;

/**
 * Attribute stamped on elements Bypass reveals. The injected override sheet
 * keys off it, so revert only has to drop the attribute and remove the sheet.
 * Its value is a space-separated token list (`show`, `interact`, `text`).
 */
export const BYPASS_MARKER_ATTR = 'data-senmurv-bypass';

/**
 * Attributes Bypass rewrites. Doubles as the MutationObserver's
 * `attributeFilter` in sticky mode.
 *
 * `class` and `style` are DELIBERATELY absent: they are the highest-churn
 * attributes on React/Angular and would produce an observer storm no debounce
 * could contain. The cost is that a framework re-applying `style="display:none"`
 * is invisible to sticky mode — which the UI says out loud.
 */
export const BYPASS_LOCK_ATTRS = [
  'disabled',
  'readonly',
  'required',
  'hidden',
  'inert',
  'contenteditable',
  'aria-disabled',
  'aria-readonly',
  'aria-required',
  'aria-hidden',
  'pattern',
  'min',
  'max',
  'minlength',
  'maxlength',
  'step',
  'novalidate',
  'type',
] as const;

/**
 * The Bypass override sheet, injected with `browser.scripting.insertCSS` and
 * removed with `removeCSS`.
 *
 * Injected CSS is immune to the page's `style-src` CSP, which an appended
 * `<style>` element is not — and `removeCSS` is a first-class revert primitive.
 * BOTH calls must receive this exact string, or removal silently no-ops.
 */
export const BYPASS_CSS = `
[${BYPASS_MARKER_ATTR}~="show"] {
  display: revert !important;
  visibility: visible !important;
  opacity: 1 !important;
  clip: auto !important;
  clip-path: none !important;
}
[${BYPASS_MARKER_ATTR}~="interact"] {
  pointer-events: auto !important;
  user-select: text !important;
  -webkit-user-select: text !important;
}
[${BYPASS_MARKER_ATTR}~="text"] {
  -webkit-text-security: none !important;
}
`;

/** Cap on tab-order stops, so a pathological page can't stall the scan — bounds + default. */
export const TAB_ORDER_MAX_STOPS_MIN = 50;
export const TAB_ORDER_MAX_STOPS_MAX = 2000;
export const TAB_ORDER_MAX_STOPS_DEFAULT = 500;

/** Cap on drawn locator-match badges, so a broad selector (e.g. `div`) can't
 *  paint thousands of boxes. The true match count is still reported. Bounds + default. */
export const MATCH_HIGHLIGHT_MAX_MIN = 10;
export const MATCH_HIGHLIGHT_MAX_MAX = 1000;
export const MATCH_HIGHLIGHT_MAX_DEFAULT = 200;

/** Cap on drawn logical-name labels, so a huge Dynamics form can't stall the
 *  overlay. The true control count is still reported. Bounds + default. */
export const LOGICAL_NAMES_MAX_MIN = 50;
export const LOGICAL_NAMES_MAX_MAX = 2000;
export const LOGICAL_NAMES_MAX_DEFAULT = 500;

/** Snap-to-element-edge threshold for the Measure tool, in CSS px. */
export const MEASURE_SNAP_PX = 6;

/** Max in-page stream rate (Hz) for hover/drag tools; see notifyQuiet. */
export const TOOL_STREAM_HZ = 10;
