import { describe, expect, it } from 'vitest';
import { MESSAGE_TYPES } from '@/shared/constants';
import { isRuntimeMessage } from '@/shared/messages';

describe('isRuntimeMessage', () => {
  it('accepts known message types', () => {
    expect(isRuntimeMessage({ type: MESSAGE_TYPES.START_PICK })).toBe(true);
    expect(isRuntimeMessage({ type: MESSAGE_TYPES.RUN_SCRIPT, payload: { code: 'x' } })).toBe(true);
    expect(isRuntimeMessage({ type: MESSAGE_TYPES.ELEMENT_PICKED, payload: {} })).toBe(true);
    expect(isRuntimeMessage({ type: MESSAGE_TYPES.CLEAR_TASKS })).toBe(true);
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

  it('accepts the region-emulator types', () => {
    expect(
      isRuntimeMessage({
        type: MESSAGE_TYPES.APPLY_REGION,
        payload: { config: { timezone: 'Europe/Paris', locale: 'fr-FR', coords: null } },
      })
    ).toBe(true);
    expect(isRuntimeMessage({ type: MESSAGE_TYPES.RESTORE_REGION })).toBe(true);
    expect(isRuntimeMessage({ type: MESSAGE_TYPES.GET_REGION_STATE })).toBe(true);
  });

  it('accepts the Accounts tab types', () => {
    expect(isRuntimeMessage({ type: MESSAGE_TYPES.GET_ACCOUNTS })).toBe(true);
    expect(
      isRuntimeMessage({
        type: MESSAGE_TYPES.SAVE_ACCOUNT,
        payload: { account: { id: 'acct_1' } },
      })
    ).toBe(true);
    expect(
      isRuntimeMessage({ type: MESSAGE_TYPES.DELETE_ACCOUNT, payload: { id: 'acct_1' } })
    ).toBe(true);
    expect(
      isRuntimeMessage({ type: MESSAGE_TYPES.DUPLICATE_ACCOUNT, payload: { id: 'acct_1' } })
    ).toBe(true);
    expect(
      isRuntimeMessage({
        type: MESSAGE_TYPES.RENAME_GROUP,
        payload: { from: 'Group A', to: 'Group B' },
      })
    ).toBe(true);
    expect(isRuntimeMessage({ type: MESSAGE_TYPES.GET_DEFAULT_PASSWORD_STATE })).toBe(true);
    expect(
      isRuntimeMessage({ type: MESSAGE_TYPES.SAVE_DEFAULT_PASSWORD, payload: { password: 'x' } })
    ).toBe(true);
    expect(isRuntimeMessage({ type: MESSAGE_TYPES.CLEAR_DEFAULT_PASSWORD })).toBe(true);
    expect(isRuntimeMessage({ type: MESSAGE_TYPES.GET_ACCOUNTS_LOCK_STATE })).toBe(true);
    expect(
      isRuntimeMessage({
        type: MESSAGE_TYPES.SET_ACCOUNTS_PIN,
        payload: { pin: '123456', sessionMinutes: 30 },
      })
    ).toBe(true);
    expect(
      isRuntimeMessage({ type: MESSAGE_TYPES.UNLOCK_ACCOUNTS, payload: { pin: '123456' } })
    ).toBe(true);
    expect(
      isRuntimeMessage({
        type: MESSAGE_TYPES.CHANGE_ACCOUNTS_PIN,
        payload: { currentPin: '111111', newPin: '222222' },
      })
    ).toBe(true);
    expect(
      isRuntimeMessage({
        type: MESSAGE_TYPES.SET_ACCOUNTS_SESSION_MINUTES,
        payload: { minutes: 60 },
      })
    ).toBe(true);
    expect(isRuntimeMessage({ type: MESSAGE_TYPES.LOCK_ACCOUNTS })).toBe(true);
    expect(
      isRuntimeMessage({ type: MESSAGE_TYPES.RUN_ACCOUNT_LOGIN, payload: { id: 'acct_1' } })
    ).toBe(true);
    expect(
      isRuntimeMessage({
        type: MESSAGE_TYPES.ACCOUNT_LOGIN_FILL,
        payload: {
          username: 'user',
          password: 'pass',
          usernameField: { kind: 'css', query: '#u' },
          passwordField: { kind: 'css', query: '#p' },
          loginButton: { kind: 'css', query: '#go' },
          timeoutMs: 5000,
        },
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
