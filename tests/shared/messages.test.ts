import { describe, expect, it } from 'vitest';
import { MESSAGE_TYPES } from '@/shared/constants';
import { isRuntimeMessage } from '@/shared/messages';

describe('isRuntimeMessage', () => {
  it('accepts known message types', () => {
    expect(isRuntimeMessage({ type: MESSAGE_TYPES.START_PICK })).toBe(true);
    expect(isRuntimeMessage({ type: MESSAGE_TYPES.RUN_SCRIPT, payload: { code: 'x' } })).toBe(true);
    expect(isRuntimeMessage({ type: MESSAGE_TYPES.ELEMENT_PICKED, payload: {} })).toBe(true);
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
