import { describe, expect, it } from 'vitest';
import { MESSAGE_TYPES } from '@/shared/constants';
import { isRuntimeMessage } from '@/shared/messages';

describe('isRuntimeMessage', () => {
  it('accepts known message types', () => {
    expect(isRuntimeMessage({ type: MESSAGE_TYPES.START_PICK })).toBe(true);
    expect(isRuntimeMessage({ type: MESSAGE_TYPES.RUN_SCRIPT, payload: { code: 'x' } })).toBe(true);
    expect(isRuntimeMessage({ type: MESSAGE_TYPES.ELEMENT_PICKED, payload: {} })).toBe(true);
  });

  it('accepts the Tools transport types', () => {
    expect(isRuntimeMessage({ type: MESSAGE_TYPES.TOOL_PING })).toBe(true);
    expect(
      isRuntimeMessage({ type: MESSAGE_TYPES.START_TOOL_MODE, payload: { mode: 'measure' } })
    ).toBe(true);
    expect(isRuntimeMessage({ type: MESSAGE_TYPES.STOP_TOOL_MODE, payload: { mode: 'all' } })).toBe(
      true
    );
    expect(
      isRuntimeMessage({ type: MESSAGE_TYPES.HIGHLIGHT_ELEMENT, payload: { selector: null } })
    ).toBe(true);
    expect(
      isRuntimeMessage({
        type: MESSAGE_TYPES.START_TOOL_MODE,
        payload: { mode: 'measure', measureMode: 'region' },
      })
    ).toBe(true);
    expect(isRuntimeMessage({ type: MESSAGE_TYPES.TOOL_STREAM, payload: {} })).toBe(true);
    expect(isRuntimeMessage({ type: MESSAGE_TYPES.TOOL_PICKED, payload: {} })).toBe(true);
    expect(
      isRuntimeMessage({ type: MESSAGE_TYPES.START_TOOL_MODE, payload: { mode: 'color' } })
    ).toBe(true);
  });

  it('accepts the locator-match highlight types', () => {
    expect(
      isRuntimeMessage({
        type: MESSAGE_TYPES.HIGHLIGHT_MATCHES,
        payload: { query: 'div', kind: 'css' },
      })
    ).toBe(true);
    expect(isRuntimeMessage({ type: MESSAGE_TYPES.SCROLL_TO_MATCH, payload: { index: 2 } })).toBe(
      true
    );
    expect(
      isRuntimeMessage({ type: MESSAGE_TYPES.STOP_TOOL_MODE, payload: { mode: 'match' } })
    ).toBe(true);
    expect(
      isRuntimeMessage({
        type: MESSAGE_TYPES.RESOLVE_SELECTOR,
        payload: { query: '#app li:nth-child(3)', kind: 'css' },
      })
    ).toBe(true);
  });

  it('rejects unknown or malformed values', () => {
    expect(isRuntimeMessage(null)).toBe(false);
    expect(isRuntimeMessage(undefined)).toBe(false);
    expect(isRuntimeMessage('START_PICK')).toBe(false);
    expect(isRuntimeMessage({})).toBe(false);
    expect(isRuntimeMessage({ type: 'NOPE' })).toBe(false);
    expect(isRuntimeMessage({ type: 123 })).toBe(false);
  });
});
