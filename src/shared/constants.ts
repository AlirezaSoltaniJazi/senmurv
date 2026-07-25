/** chrome.storage.local keys. */
export const STORAGE_KEYS = {
  SCRIPTS: 'senmurv:scripts',
  TASKS: 'senmurv:tasks',
  CHECKLISTS: 'senmurv:checklists',
  NOTES: 'senmurv:notes',
  PREFS: 'senmurv:prefs',
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
  GET_SCRIPTS: 'GET_SCRIPTS',
  SAVE_SCRIPT: 'SAVE_SCRIPT',
  SET_SCRIPTS: 'SET_SCRIPTS',
  DELETE_SCRIPT: 'DELETE_SCRIPT',
  TEST_LOCATOR: 'TEST_LOCATOR',
  GET_TASKS: 'GET_TASKS',
  SAVE_TASK: 'SAVE_TASK',
  DELETE_TASK: 'DELETE_TASK',
  GET_CHECKLISTS: 'GET_CHECKLISTS',
  SAVE_CHECKLIST: 'SAVE_CHECKLIST',
  DELETE_CHECKLIST: 'DELETE_CHECKLIST',
  GET_NOTES: 'GET_NOTES',
  SAVE_NOTE: 'SAVE_NOTE',
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
  // tab → panel pushes from an in-page tool mode (no service-worker handler)
  TOOL_STREAM: 'TOOL_STREAM',
  TOOL_PICKED: 'TOOL_PICKED',
  // Bypass
  BYPASS_PAGE: 'BYPASS_PAGE',
  RESTORE_PAGE: 'RESTORE_PAGE',
  GET_BYPASS_STATE: 'GET_BYPASS_STATE',
  BYPASS_XRM: 'BYPASS_XRM',
  BYPASS_STATE_CHANGED: 'BYPASS_STATE_CHANGED',
  // Site data
  PROBE_SITE_STORAGE: 'PROBE_SITE_STORAGE',
  CLEAR_SITE_DATA: 'CLEAR_SITE_DATA',
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
  'attr',
  'ariaLabel',
  'roleName',
  'css',
  'xpath',
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
  'about:',
  // The declared content script matches http/https only, so these never have a
  // picker to talk to; naming them turns a confusing injection failure into a
  // clear "this page does not allow extensions" message.
  'file://',
  'view-source:',
  'https://chrome.google.com/webstore',
  'https://chromewebstore.google.com',
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
 * The Bypass override sheet, injected with `chrome.scripting.insertCSS` and
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

/** Cap on tab-order stops, so a pathological page can't stall the scan. */
export const TAB_ORDER_MAX_STOPS = 500;

/** Snap-to-element-edge threshold for the Measure tool, in CSS px. */
export const MEASURE_SNAP_PX = 6;

/** Max in-page stream rate (Hz) for hover/drag tools; see notifyQuiet. */
export const TOOL_STREAM_HZ = 10;
