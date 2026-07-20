import { MESSAGE_TYPES } from '@/shared/constants';
import type {
  DetectedField,
  LocatorKind,
  LocatorSet,
  SavedScript,
  TimeEntry,
} from '@/shared/types';

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
  | { type: typeof MESSAGE_TYPES.RUN_SCRIPT; payload: { code: string } }
  | { type: typeof MESSAGE_TYPES.GET_SCRIPTS }
  | { type: typeof MESSAGE_TYPES.SAVE_SCRIPT; payload: { script: SavedScript } }
  | { type: typeof MESSAGE_TYPES.SET_SCRIPTS; payload: { scripts: SavedScript[] } }
  | { type: typeof MESSAGE_TYPES.DELETE_SCRIPT; payload: { id: string } }
  | { type: typeof MESSAGE_TYPES.TEST_LOCATOR; payload: { query: string; kind: LocatorKind } }
  | { type: typeof MESSAGE_TYPES.GET_TASKS }
  | { type: typeof MESSAGE_TYPES.SAVE_TASK; payload: { entry: TimeEntry } }
  | { type: typeof MESSAGE_TYPES.DELETE_TASK; payload: { id: string } };

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
