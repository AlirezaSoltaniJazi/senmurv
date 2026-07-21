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

/** One work interval of a logged task; `end === null` while it is running. */
export interface TimeInterval {
  start: number; // epoch ms
  end: number | null; // epoch ms, or null while the interval is open
}

/**
 * A time-logged task (Tasks tool). Accumulates one or more work intervals via
 * play / pause / resume; `stoppedAt === null` means still active (running or
 * paused). Total duration is always derived from `intervals`, never stored.
 *
 * Re-running a stopped task creates a new run linked to the original via
 * `parentId` (the lineage root's id). Runs sharing a root are shown grouped
 * under an expandable "main task"; a run with no `parentId` is itself a root.
 */
export interface TimeEntry {
  id: string;
  title: string;
  tag: string;
  intervals: TimeInterval[];
  stoppedAt: number | null;
  createdAt: number;
  updatedAt: number;
  parentId?: string;
  /** Set when the entry was started from a "My Tasks" checklist (its id). */
  checklistId?: string;
  /** Set when the entry tracks a specific subtask of that checklist (its id). */
  subtaskId?: string;
}

/** Locator generation strategies (Find Element Locator tool). */
export type LocatorStrategy =
  | 'testId'
  | 'formControl'
  | 'id'
  | 'attr'
  | 'ariaLabel'
  | 'roleName'
  | 'css'
  | 'xpath'
  | 'xpathAbsolute';

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

// ---------------------------------------------------------------------------
// My Tasks (checklists) + user preferences
// ---------------------------------------------------------------------------

/** One checklist item (a subtask checkbox). */
export interface Subtask {
  id: string; // newId('sub_')
  title: string;
  done: boolean;
}

/**
 * A "my task": a 2-level checklist. The parent's completion is derived from its
 * subtasks (all done → complete); `done` is only used when `subtasks` is empty.
 */
export interface Checklist {
  id: string; // newId('chk_')
  title: string;
  subtasks: Subtask[];
  done: boolean;
  deadline: number | null; // exact epoch ms, or null when unset
  createdAt: number;
  updatedAt: number;
}

/** A free-form saved note (Notes tool). */
export interface Note {
  id: string; // newId('note_')
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
}

/** UI scale for the whole panel. */
export type FontSize = 'small' | 'medium' | 'large';

/** Persisted user preferences. */
export interface Prefs {
  fontSize: FontSize;
}

// ---------------------------------------------------------------------------
// Script generator (Fill tool)
// ---------------------------------------------------------------------------

/** The kind of form control a picked element resolves to. */
export type FieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'number'
  | 'date'
  | 'password'
  | 'textarea'
  | 'checkbox'
  | 'radio'
  | 'select'
  | 'combobox';

/** A value/data generator the user can assign to a field. */
export type GeneratorId =
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'email'
  | 'phone'
  | 'phoneNational'
  | 'streetAddress'
  | 'city'
  | 'postalCode'
  | 'country'
  | 'company'
  | 'word'
  | 'sentence'
  | 'number'
  | 'uuid'
  | 'date'
  | 'pastDate'
  | 'check'
  | 'uncheck'
  | 'boolean'
  | 'pickFirst'
  | 'pickRandom'
  | 'custom';

/** What the in-page picker reports for one clicked element. */
export interface DetectedField {
  selector: string;
  fieldType: FieldType;
  label: string;
  /** Lowercased blob of formcontrolname/name/placeholder/label/id for generator guessing. */
  hint: string;
}

/** A field in the Fill tool's list, plus the user's generator choice. */
export interface PickedField {
  id: string;
  selector: string;
  fieldType: FieldType;
  label: string;
  hint: string;
  generator: GeneratorId;
  customValue?: string;
  preview?: string;
}

/** One concrete fill action emitted into the generated script. */
export interface FillInstruction {
  selector: string;
  fieldType: FieldType;
  value?: string;
  action?: 'check' | 'uncheck' | 'pickFirst' | 'pickRandom';
}
