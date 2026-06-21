import type { FRAMEWORKS, SUPPORTED_LOCALES } from '@/shared/constants';

/** A supported faker locale code. */
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** A test automation framework we emit locator snippets for. */
export type Framework = (typeof FRAMEWORKS)[number];

/** Generated test data for one "person" (Generate Random Data tool). */
export interface GeneratedData {
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  postalCode: string;
  email: string;
  dateOfBirth: string;
}

/** A user-saved JS script (Execute JS Script tool). */
export interface SavedScript {
  id: string;
  name: string;
  code: string;
  createdAt: number;
  updatedAt: number;
}

/** Locator generation strategies (Find Element Locator tool). */
export type LocatorStrategy = 'testId' | 'id' | 'roleName' | 'css' | 'xpath' | 'xpathAbsolute';

export type LocatorQuality = 'high' | 'medium' | 'low';

/** The two locator kinds the "Test a locator" feature understands. */
export type LocatorKind = 'css' | 'xpath';

/** A copy-ready snippet for one framework. */
export interface FrameworkSnippet {
  framework: Framework;
  /** Short method label, e.g. "getByTestId". */
  label: string;
  /** The full snippet, e.g. page.getByTestId('email'). */
  code: string;
}

/** One ranked locator suggestion with per-framework snippets. */
export interface LocatorSuggestion {
  strategy: LocatorStrategy;
  /** Human label for the raw locator, e.g. "data-testid" or "CSS selector". */
  label: string;
  /** The raw selector / value. */
  value: string;
  quality: LocatorQuality;
  /** True for the single highest-priority suggestion present. */
  recommended: boolean;
  /** How many elements this locator matches on the live page (omitted if not computable). */
  matchCount?: number;
  snippets: FrameworkSnippet[];
}

/** A short, display-only description of the picked element. */
export interface ElementInfo {
  tagName: string;
  textPreview: string;
  attributesPreview: string;
}

/** The full result of picking one element. */
export interface LocatorSet {
  element: ElementInfo;
  suggestions: LocatorSuggestion[];
}

/** Standard fallible-operation result. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
