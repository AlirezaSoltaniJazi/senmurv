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

/** A script handed to the Scripts tab from another tool, to load into its editor once. */
export interface ScriptSeed {
  name: string;
  code: string;
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
// In-page modes (picker, recorder, Tools tab)
// ---------------------------------------------------------------------------

/**
 * The single exclusive in-page mode. The content script runs at most one of
 * these at a time — `enterMode` in picker.ts stops the current one before
 * starting the next, which is also what restores the page cursor exactly once.
 *
 * This is the only mode type; it is what crosses the wire in START/STOP_TOOL_MODE.
 */
export type PageMode =
  | 'idle'
  | 'pick-locator'
  | 'pick-fields'
  | 'record'
  | 'measure'
  | 'color'
  | 'font'
  | 'taborder';

/** Modes the Tools tab starts. A subset of PageMode, excluding the pre-existing ones. */
export type ToolMode = Extract<PageMode, 'measure' | 'color' | 'font' | 'taborder'>;

// ---------------------------------------------------------------------------
// Measure
// ---------------------------------------------------------------------------

/** The three ways to measure: drag a box, inspect an element, or span two elements. */
export type MeasureMode = 'region' | 'element' | 'distance';

/** The four edges of a box, e.g. padding or margin. */
export interface BoxSides {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** DevTools-style box model of one element. All numbers are CSS px. */
export interface BoxModel {
  readonly content: { readonly width: number; readonly height: number };
  readonly padding: BoxSides;
  readonly border: BoxSides;
  readonly margin: BoxSides;
  /** The border box — exactly what getBoundingClientRect reports. */
  readonly borderBox: { readonly width: number; readonly height: number };
  /** Border box plus margins. */
  readonly marginBox: { readonly width: number; readonly height: number };
  /** Human description of an ancestor/self transform, or null when there is none. */
  readonly transform: string | null;
}

/** A dragged rectangle, in both viewport and page-absolute coordinates. */
export interface MeasureRegion {
  readonly width: number;
  readonly height: number;
  /** Top-left in viewport (fixed) coordinates — where the overlay box sits. */
  readonly viewport: { readonly left: number; readonly top: number };
  /** Top-left in page-absolute coordinates (viewport + scroll offset). */
  readonly page: { readonly left: number; readonly top: number };
}

/** The gap and centre-to-centre distance between two elements. */
export interface DistanceReading {
  /** Nearest-edge horizontal gap (0 when the boxes overlap on the x-axis). */
  readonly horizontal: number;
  /** Nearest-edge vertical gap (0 when they overlap on the y-axis). */
  readonly vertical: number;
  /** Centre-delta components. */
  readonly dx: number;
  readonly dy: number;
  /** Straight-line centre-to-centre distance. */
  readonly centerToCenter: number;
}

/** One measurement result, discriminated by the mode that produced it. */
export type MeasureData =
  | { readonly mode: 'region'; readonly region: MeasureRegion }
  | { readonly mode: 'element'; readonly box: BoxModel; readonly tag: string }
  | { readonly mode: 'distance'; readonly distance: DistanceReading };

/**
 * Live, high-frequency reading pushed while the user drags or hovers
 * (TOOL_STREAM). Discriminated by `tool` so each Tools mode adds its own arm.
 */
export type ToolStreamData =
  | { readonly tool: 'measure'; readonly data: MeasureData }
  | { readonly tool: 'color'; readonly data: ColorReport };

/** A committed reading pushed on click (TOOL_PICKED), with copy-ready locators. */
export type ToolPickData =
  | { readonly tool: 'measure'; readonly data: MeasureData; readonly locators?: LocatorSet }
  | { readonly tool: 'color'; readonly data: ColorReport; readonly locators?: LocatorSet };

/** One framework's copy-ready size assertion for a measured element. */
export interface SizeAssertion {
  readonly framework: Framework;
  readonly label: string;
  readonly code: string;
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

/** An sRGB colour with straight (non-premultiplied) alpha, channels 0-255, alpha 0-1. */
export interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

/** A colour rendered in every format the panel shows, ready to copy. */
export interface ColorFormats {
  readonly hex: string;
  readonly hex8: string;
  readonly rgb: string;
  readonly hsl: string;
  readonly hwb: string;
}

/** The WCAG contrast verdict of a foreground colour over its effective background. */
export interface ContrastVerdict {
  readonly ratio: number;
  readonly aaNormal: boolean;
  readonly aaLarge: boolean;
  readonly aaaNormal: boolean;
  readonly aaaLarge: boolean;
  /** Whether the measured text counts as "large" (≥24px, or ≥18.66px bold). */
  readonly isLargeText: boolean;
}

/** One colour read off an element, with its role (text, background, border…). */
export interface ColorSwatch {
  readonly role: string;
  /** The colour as authored/computed. `null` when it is not sRGB-convertible (oklch/lab/…). */
  readonly rgba: Rgba | null;
  /** The raw computed string, always shown (covers the non-sRGB pass-through case). */
  readonly raw: string;
  readonly formats: ColorFormats | null;
}

/** Everything the Colour tool reports for one inspected element. */
export interface ColorReport {
  readonly tag: string;
  readonly swatches: ColorSwatch[];
  /** Text-vs-effective-background contrast, when both are known sRGB colours. */
  readonly contrast: ContrastVerdict | null;
  /** Honest caveats: background images, ::before overlays, non-sRGB colours, etc. */
  readonly warnings: string[];
}

// ---------------------------------------------------------------------------
// Bypass
// ---------------------------------------------------------------------------

/** Which locks Bypass strips. The three destructive ones default to OFF. */
export interface BypassOptions {
  readonly shouldEnableInputs: boolean;
  readonly shouldDropValidation: boolean;
  readonly shouldUnlockOptions: boolean;
  readonly shouldRevealHidden: boolean;
  readonly shouldRevealPasswords: boolean;
  readonly shouldCloseDialogs: boolean;
  readonly shouldPierceShadowDom: boolean;
}

/** What kind of lock a change removed — one counter per category in the report. */
export type BypassCategory =
  | 'enabled'
  | 'validation'
  | 'options'
  | 'revealed'
  | 'passwords'
  | 'dialogs';

/**
 * The ONLY thing that crosses the wire. Counts and strings only — it is
 * structurally incapable of leaking a DOM node into a message.
 */
export interface BypassReport {
  readonly total: number;
  readonly counts: Record<BypassCategory, number>;
  /** How many open shadow roots the walk descended into. */
  readonly shadowRoots: number;
  /** Honest caveats for this specific run (closed roots, cross-origin frames…). */
  readonly warnings: string[];
}

/** What the content script knows about the current bypass. */
export interface PageBypassState {
  readonly isActive: boolean;
  readonly isWatching: boolean;
  readonly report: BypassReport | null;
}

/**
 * The page state plus whether this is a Dynamics form. `hasXrm` cannot come
 * from the content script — `window.Xrm` lives in the page's own realm — so the
 * service worker probes for it and merges it in.
 */
export interface BypassState extends PageBypassState {
  readonly hasXrm: boolean;
}

// ---------------------------------------------------------------------------
// Site data
// ---------------------------------------------------------------------------

/** Kinds of site data clearable from the page itself, for the current origin. */
export type ClearTypeId =
  | 'cacheStorage'
  | 'serviceWorkers'
  | 'localStorage'
  | 'sessionStorage'
  | 'indexedDB'
  | 'cookies';

/** One row of the per-origin storage breakdown. */
export interface StorageDetail {
  readonly key: string;
  readonly bytes: number;
}

/**
 * What the page reports about its own storage. Every field is nullable because
 * each read is separately guarded — `navigator.storage`, `caches` and
 * `navigator.serviceWorker` are all `[SecureContext]`, and `localStorage` /
 * `document.cookie` throw outright when site data is blocked.
 */
export interface StorageProbe {
  readonly origin: string;
  readonly isSecureContext: boolean;
  /** Quota-managed bytes for this origin. NOT the HTTP cache — that is unreadable. */
  readonly usage: number | null;
  readonly quota: number | null;
  readonly details: StorageDetail[];
  readonly localStorageBytes: number | null;
  readonly sessionStorageBytes: number | null;
  readonly cookieCount: number | null;
  readonly cacheCount: number | null;
  readonly serviceWorkerCount: number | null;
  readonly indexedDbCount: number | null;
  readonly warnings: string[];
}

/**
 * What a clear actually managed to do.
 *
 * There is deliberately no "bytes freed": Chrome's `navigator.storage.estimate`
 * is padded, lazy, and does not count localStorage or cookies, so a before/after
 * delta is not a trustworthy number. The UI re-probes instead, showing the real
 * new state — see the note in the Site data tool.
 */
export interface ClearOutcome {
  readonly cleared: ClearTypeId[];
  readonly skipped: { type: ClearTypeId; reason: string }[];
  readonly didReload: boolean;
}

/** Result of the Dynamics 365 / Power Apps bypass, which runs through the Xrm API. */
export interface XrmReport {
  readonly attributes: number;
  readonly controls: number;
  readonly tabs: number;
  readonly sections: number;
}

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

/** UI scale preset for the whole panel. */
export type FontSize = 'small' | 'medium' | 'large' | 'xlarge';

/** Persisted user preferences. */
export interface Prefs {
  /** The active preset chip. */
  fontSize: FontSize;
  /**
   * Manual fine-tune zoom multiplier (e.g. 1.25). When set it overrides the
   * preset; omitted when the user is on a plain preset.
   */
  fontScale?: number;
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
  | 'phoneIntl'
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
