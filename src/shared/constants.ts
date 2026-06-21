/** chrome.storage.local keys. */
export const STORAGE_KEYS = {
  SCRIPTS: 'senmurv:scripts',
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
  RUN_SCRIPT: 'RUN_SCRIPT',
  GET_SCRIPTS: 'GET_SCRIPTS',
  SAVE_SCRIPT: 'SAVE_SCRIPT',
  DELETE_SCRIPT: 'DELETE_SCRIPT',
  TEST_LOCATOR: 'TEST_LOCATOR',
} as const;

/** Locales offered in the Generate Random Data tool (faker instances are mapped in faker-data.ts). */
export const SUPPORTED_LOCALES = ['en_GB', 'en_US', 'de', 'fr', 'es', 'it'] as const;

export const DEFAULT_LOCALE = 'en_GB';

/** Human labels for the locale switcher. */
export const LOCALE_LABELS: Record<string, string> = {
  en_GB: 'English (UK)',
  en_US: 'English (US)',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
};

/** Attributes treated as automation test ids, in preference order. */
export const TEST_ID_ATTRS = [
  'data-testid',
  'data-test-id',
  'data-test',
  'data-cy',
  'data-qa',
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
  'https://chrome.google.com/webstore',
  'https://chromewebstore.google.com',
] as const;
