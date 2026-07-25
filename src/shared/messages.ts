import { MESSAGE_TYPES } from '@/shared/constants';
import type {
  Checklist,
  ClearTypeId,
  DetectedField,
  BypassOptions,
  BypassReport,
  LocatorKind,
  LocatorSet,
  MeasureMode,
  Note,
  PageMode,
  Prefs,
  RegionConfig,
  SavedScript,
  TimeEntry,
  ToolMode,
  ToolPickData,
  ToolStreamData,
  WcagLevel,
} from '@/shared/types';
import type { RecordedStep } from '@/shared/workflow';

/**
 * All runtime messages, as a discriminated union keyed on `type`.
 * Adding a message: add the string to MESSAGE_TYPES, then a variant here,
 * then handle it in the service worker.
 */
export type RuntimeMessage =
  | { type: typeof MESSAGE_TYPES.START_PICK }
  | { type: typeof MESSAGE_TYPES.START_PICK_FIELDS }
  | { type: typeof MESSAGE_TYPES.CANCEL_PICK }
  | { type: typeof MESSAGE_TYPES.ELEMENT_PICKED; payload: LocatorSet }
  | { type: typeof MESSAGE_TYPES.FIELD_PICKED; payload: { field: DetectedField } }
  | { type: typeof MESSAGE_TYPES.PICK_CANCELLED }
  | { type: typeof MESSAGE_TYPES.START_RECORD }
  | { type: typeof MESSAGE_TYPES.STOP_RECORD }
  | { type: typeof MESSAGE_TYPES.ACTION_RECORDED; payload: { step: RecordedStep } }
  | { type: typeof MESSAGE_TYPES.RUN_SCRIPT; payload: { code: string } }
  | { type: typeof MESSAGE_TYPES.GET_SCRIPTS }
  | { type: typeof MESSAGE_TYPES.SAVE_SCRIPT; payload: { script: SavedScript } }
  | { type: typeof MESSAGE_TYPES.SET_SCRIPTS; payload: { scripts: SavedScript[] } }
  | { type: typeof MESSAGE_TYPES.DELETE_SCRIPT; payload: { id: string } }
  | { type: typeof MESSAGE_TYPES.TEST_LOCATOR; payload: { query: string; kind: LocatorKind } }
  | { type: typeof MESSAGE_TYPES.GET_TASKS }
  | { type: typeof MESSAGE_TYPES.SAVE_TASK; payload: { entry: TimeEntry } }
  | { type: typeof MESSAGE_TYPES.DELETE_TASK; payload: { id: string } }
  | { type: typeof MESSAGE_TYPES.GET_CHECKLISTS }
  | { type: typeof MESSAGE_TYPES.SAVE_CHECKLIST; payload: { checklist: Checklist } }
  | { type: typeof MESSAGE_TYPES.DELETE_CHECKLIST; payload: { id: string } }
  | { type: typeof MESSAGE_TYPES.GET_NOTES }
  | { type: typeof MESSAGE_TYPES.SAVE_NOTE; payload: { note: Note } }
  | { type: typeof MESSAGE_TYPES.DELETE_NOTE; payload: { id: string } }
  | { type: typeof MESSAGE_TYPES.GET_PREFS }
  | { type: typeof MESSAGE_TYPES.SAVE_PREFS; payload: { prefs: Prefs } }
  // Tools tab transport. TOOL_PING forces the lazy in-page tools chunk to load
  // and answers once it has, so the panel can tell "page unreachable" apart
  // from "chunk failed to load" before a tool ever runs.
  | { type: typeof MESSAGE_TYPES.TOOL_PING }
  | {
      type: typeof MESSAGE_TYPES.START_TOOL_MODE;
      // measureMode carries the Measure sub-mode; other tool modes ignore it.
      payload: { mode: ToolMode; measureMode?: MeasureMode };
    }
  | { type: typeof MESSAGE_TYPES.STOP_TOOL_MODE; payload: { mode: PageMode | 'all' } }
  // tab → panel pushes: a live reading while dragging/hovering, and a committed
  // reading on click. Both fall through the SW to the panel, like ELEMENT_PICKED.
  | { type: typeof MESSAGE_TYPES.TOOL_STREAM; payload: ToolStreamData }
  | { type: typeof MESSAGE_TYPES.TOOL_PICKED; payload: ToolPickData }
  // Tab order + Accessibility (all askTab). SCAN/RUN compute + retain elements;
  // the panel fetches a row's locators lazily (source picks which tool owns them).
  | { type: typeof MESSAGE_TYPES.SCAN_TAB_ORDER }
  | { type: typeof MESSAGE_TYPES.RUN_A11Y_SCAN; payload: { levels: WcagLevel[] } }
  | {
      type: typeof MESSAGE_TYPES.GET_STOP_LOCATORS;
      payload: { source: 'taborder' | 'a11y'; index: number };
    }
  // A null selector clears the highlight — without it a highlight can never be
  // removed, which is the trap this signature exists to avoid.
  | { type: typeof MESSAGE_TYPES.HIGHLIGHT_ELEMENT; payload: { selector: string | null } }
  // Locator tab: highlight every match of a CSS/XPath (returns the count), and
  // scroll the Nth match into view. HIGHLIGHT_MATCHES enters PageMode 'match';
  // STOP_TOOL_MODE { mode: 'match' } tears it down.
  | { type: typeof MESSAGE_TYPES.HIGHLIGHT_MATCHES; payload: { query: string; kind: LocatorKind } }
  | { type: typeof MESSAGE_TYPES.SCROLL_TO_MATCH; payload: { index: number } }
  // Selector Hardener: resolve a selector's first match → its ranked locators + count.
  | { type: typeof MESSAGE_TYPES.RESOLVE_SELECTOR; payload: { query: string; kind: LocatorKind } }
  // Bypass. BYPASS_XRM is worker-local — the Xrm client API only
  // exists in the page's own realm, so it needs a MAIN-world injection.
  | {
      type: typeof MESSAGE_TYPES.BYPASS_PAGE;
      payload: { options: BypassOptions; shouldWatch: boolean };
    }
  | { type: typeof MESSAGE_TYPES.RESTORE_PAGE }
  | { type: typeof MESSAGE_TYPES.GET_BYPASS_STATE }
  | { type: typeof MESSAGE_TYPES.BYPASS_XRM }
  | { type: typeof MESSAGE_TYPES.BYPASS_STATE_CHANGED; payload: { report: BypassReport } }
  // Site data. Both are worker-local: the worker injects into the page rather
  // than routing through the content script, so no new permission is needed.
  | { type: typeof MESSAGE_TYPES.PROBE_SITE_STORAGE }
  | {
      type: typeof MESSAGE_TYPES.CLEAR_SITE_DATA;
      payload: { types: ClearTypeId[]; shouldReload: boolean };
    }
  // Region emulator. Worker-local like BYPASS_XRM: the shim is a MAIN-world
  // executeScript that passes a real func (not a code string), so it does not
  // widen the sanctioned runner exception.
  | { type: typeof MESSAGE_TYPES.APPLY_REGION; payload: { config: RegionConfig } }
  | { type: typeof MESSAGE_TYPES.RESTORE_REGION }
  | { type: typeof MESSAGE_TYPES.GET_REGION_STATE };

const MESSAGE_TYPE_VALUES = new Set<string>(Object.values(MESSAGE_TYPES));

/** Type guard: is this an object with a known message `type`? */
export function isRuntimeMessage(value: unknown): value is RuntimeMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return false;
  }
  const type = (value as { type: unknown }).type;
  return typeof type === 'string' && MESSAGE_TYPE_VALUES.has(type);
}

/** Send a typed message to the extension (service worker / other extension pages). */
export async function sendRuntimeMessage<T = unknown>(message: RuntimeMessage): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

/** Send a typed message to a specific tab's content script. */
export async function sendTabMessage<T = unknown>(
  tabId: number,
  message: RuntimeMessage
): Promise<T> {
  return chrome.tabs.sendMessage(tabId, message) as Promise<T>;
}
