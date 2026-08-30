import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MESSAGE_TYPES } from '@/shared/constants';
import { encryptSecret, setUpPin } from '@/shared/crypto';
import type { Account } from '@/shared/types';
import { chromeMock, store } from '../setup';
import '@/background/service-worker';

interface Response {
  ok: boolean;
  value?: unknown;
  error?: string;
}

/** Dispatch a runtime message and resolve with the handler's sendResponse value. */
function send(message: unknown): Promise<Response | undefined> {
  return new Promise((resolve) => {
    const results = chromeMock.runtime.onMessage.dispatch(message, {}, (resp: Response) =>
      resolve(resp)
    );
    if (!results.some((r) => r === true)) resolve(undefined);
  });
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Repeatedly dispatch tabs.onUpdated("complete") until navigateAndWaitForLoad's
 *  listener (registered asynchronously, after real crypto awaits) picks it up. */
async function completeNavigation(tabId = 1, attempts = 20): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    chromeMock.tabs.onUpdated.dispatch(tabId, { status: 'complete' });
    await flush();
  }
}

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acct_1',
    name: 'My Site',
    address: 'https://sub.x.com',
    username: 'sss@ss.com',
    useDefaultPassword: false,
    usernameField: { kind: 'css', query: '#username' },
    passwordField: { kind: 'css', query: '#password' },
    loginButton: { kind: 'css', query: '#login' },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  chromeMock.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com', active: true }]);
  chromeMock.scripting.executeScript.mockResolvedValue([{ result: { ok: true } }]);
});

describe('GET_ACCOUNTS_LOCK_STATE / SET_ACCOUNTS_PIN / UNLOCK_ACCOUNTS / LOCK_ACCOUNTS', () => {
  it('reports locked with no PIN set initially', async () => {
    const res = await send({ type: MESSAGE_TYPES.GET_ACCOUNTS_LOCK_STATE });
    expect(res).toEqual({
      ok: true,
      value: { isPinSet: false, isUnlocked: false, sessionMinutes: 30 },
    });
  });

  it('is unlocked immediately after SET_ACCOUNTS_PIN', async () => {
    const setRes = await send({
      type: MESSAGE_TYPES.SET_ACCOUNTS_PIN,
      payload: { pin: '123456', sessionMinutes: 45 },
    });
    expect(setRes).toEqual({ ok: true, value: undefined });

    const state = await send({ type: MESSAGE_TYPES.GET_ACCOUNTS_LOCK_STATE });
    expect(state).toEqual({
      ok: true,
      value: { isPinSet: true, isUnlocked: true, sessionMinutes: 45 },
    });
  });

  it('LOCK_ACCOUNTS then UNLOCK_ACCOUNTS with the wrong PIN fails, with the right PIN succeeds', async () => {
    await send({
      type: MESSAGE_TYPES.SET_ACCOUNTS_PIN,
      payload: { pin: '123456', sessionMinutes: 30 },
    });
    await send({ type: MESSAGE_TYPES.LOCK_ACCOUNTS });

    const wrong = await send({ type: MESSAGE_TYPES.UNLOCK_ACCOUNTS, payload: { pin: '000000' } });
    expect(wrong).toEqual({ ok: false, error: 'Incorrect PIN.' });

    const right = await send({ type: MESSAGE_TYPES.UNLOCK_ACCOUNTS, payload: { pin: '123456' } });
    expect(right).toEqual({ ok: true, value: undefined });
  });

  it('rejects a PIN shorter than 6 digits or longer than 15, and never sets one up', async () => {
    const tooShort = await send({
      type: MESSAGE_TYPES.SET_ACCOUNTS_PIN,
      payload: { pin: '12345', sessionMinutes: 30 },
    });
    expect(tooShort).toEqual({ ok: false, error: 'PIN must be 6-15 digits.' });

    const tooLong = await send({
      type: MESSAGE_TYPES.SET_ACCOUNTS_PIN,
      payload: { pin: '1234567890123456', sessionMinutes: 30 },
    });
    expect(tooLong).toEqual({ ok: false, error: 'PIN must be 6-15 digits.' });

    const state = await send({ type: MESSAGE_TYPES.GET_ACCOUNTS_LOCK_STATE });
    expect(state).toMatchObject({ ok: true, value: { isPinSet: false } });
  });

  it('accepts PINs at the 6 and 15 digit boundaries', async () => {
    const min = await send({
      type: MESSAGE_TYPES.SET_ACCOUNTS_PIN,
      payload: { pin: '123456', sessionMinutes: 30 },
    });
    expect(min).toEqual({ ok: true, value: undefined });

    await send({ type: MESSAGE_TYPES.LOCK_ACCOUNTS });
    await send({ type: MESSAGE_TYPES.UNLOCK_ACCOUNTS, payload: { pin: '123456' } });

    const max = await send({
      type: MESSAGE_TYPES.CHANGE_ACCOUNTS_PIN,
      payload: { currentPin: '123456', newPin: '123456789012345' },
    });
    expect(max).toEqual({ ok: true, value: undefined });
  });
});

describe('SET_ACCOUNTS_SESSION_MINUTES', () => {
  it('updates and clamps the session length', async () => {
    await send({
      type: MESSAGE_TYPES.SET_ACCOUNTS_PIN,
      payload: { pin: '123456', sessionMinutes: 30 },
    });
    const res = await send({
      type: MESSAGE_TYPES.SET_ACCOUNTS_SESSION_MINUTES,
      payload: { minutes: 500 },
    });
    expect(res).toEqual({ ok: true, value: undefined });
    const state = await send({ type: MESSAGE_TYPES.GET_ACCOUNTS_LOCK_STATE });
    expect((state as Response).value).toMatchObject({ sessionMinutes: 360 });
  });
});

describe('GET_ACCOUNTS / SAVE_ACCOUNT / DELETE_ACCOUNT', () => {
  it('returns [] when nothing is stored', async () => {
    const res = await send({ type: MESSAGE_TYPES.GET_ACCOUNTS });
    expect(res).toEqual({ ok: true, value: [] });
  });

  it('rejects saving a password while locked', async () => {
    const draft = {
      id: 'acct_1',
      name: 'My Site',
      address: 'sub.x.com',
      username: 'sss@ss.com',
      useDefaultPassword: false,
      newPassword: 'hunter2',
      usernameField: { kind: 'css', query: '#username' },
      passwordField: { kind: 'css', query: '#password' },
      loginButton: { kind: 'css', query: '#login' },
    };
    const res = await send({ type: MESSAGE_TYPES.SAVE_ACCOUNT, payload: { account: draft } });
    expect(res).toMatchObject({ ok: false });
  });

  it('saves an account with its own password once unlocked, and never stores it in plaintext', async () => {
    await send({
      type: MESSAGE_TYPES.SET_ACCOUNTS_PIN,
      payload: { pin: '123456', sessionMinutes: 30 },
    });
    const draft = {
      id: 'acct_1',
      name: 'My Site',
      address: 'sub.x.com',
      username: 'sss@ss.com',
      useDefaultPassword: false,
      newPassword: 'hunter2',
      usernameField: { kind: 'css', query: '#username' },
      passwordField: { kind: 'css', query: '#password' },
      loginButton: { kind: 'css', query: '#login' },
    };
    const res = await send({ type: MESSAGE_TYPES.SAVE_ACCOUNT, payload: { account: draft } });
    expect(res).toMatchObject({ ok: true });
    const accounts = (res as Response).value as Account[];
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.address).toBe('https://sub.x.com');
    expect(accounts[0]?.encryptedPassword?.ciphertext).toBeDefined();
    expect(JSON.stringify(store)).not.toContain('hunter2');
  });

  it('saves an account with useDefaultPassword and no password of its own', async () => {
    await send({
      type: MESSAGE_TYPES.SET_ACCOUNTS_PIN,
      payload: { pin: '123456', sessionMinutes: 30 },
    });
    const draft = {
      id: 'acct_1',
      name: 'My Site',
      address: 'sub.x.com',
      username: 'sss@ss.com',
      useDefaultPassword: true,
      usernameField: { kind: 'css', query: '#username' },
      passwordField: { kind: 'css', query: '#password' },
      loginButton: { kind: 'css', query: '#login' },
    };
    const res = await send({ type: MESSAGE_TYPES.SAVE_ACCOUNT, payload: { account: draft } });
    expect(res).toMatchObject({ ok: true });
    const accounts = (res as Response).value as Account[];
    expect(accounts[0]?.encryptedPassword).toBeUndefined();
  });

  it('deletes an account by id', async () => {
    await send({
      type: MESSAGE_TYPES.SET_ACCOUNTS_PIN,
      payload: { pin: '123456', sessionMinutes: 30 },
    });
    await send({
      type: MESSAGE_TYPES.SAVE_ACCOUNT,
      payload: {
        account: {
          id: 'acct_1',
          name: 'My Site',
          address: 'sub.x.com',
          username: 'sss@ss.com',
          useDefaultPassword: true,
          usernameField: { kind: 'css', query: '#username' },
          passwordField: { kind: 'css', query: '#password' },
          loginButton: { kind: 'css', query: '#login' },
        },
      },
    });
    const res = await send({ type: MESSAGE_TYPES.DELETE_ACCOUNT, payload: { id: 'acct_1' } });
    expect(res).toEqual({ ok: true, value: [] });
  });
});

describe('GET_DEFAULT_PASSWORD_STATE / SAVE_DEFAULT_PASSWORD / CLEAR_DEFAULT_PASSWORD', () => {
  it('reports not set initially', async () => {
    const res = await send({ type: MESSAGE_TYPES.GET_DEFAULT_PASSWORD_STATE });
    expect(res).toEqual({ ok: true, value: { isSet: false, updatedAt: null } });
  });

  it('sets, reports, and clears the default password', async () => {
    await send({
      type: MESSAGE_TYPES.SET_ACCOUNTS_PIN,
      payload: { pin: '123456', sessionMinutes: 30 },
    });
    const saveRes = await send({
      type: MESSAGE_TYPES.SAVE_DEFAULT_PASSWORD,
      payload: { password: 'defaultpw' },
    });
    expect(saveRes).toEqual({ ok: true, value: undefined });
    expect(JSON.stringify(store)).not.toContain('defaultpw');

    const state = await send({ type: MESSAGE_TYPES.GET_DEFAULT_PASSWORD_STATE });
    expect(state).toMatchObject({ ok: true, value: { isSet: true } });

    const clearRes = await send({ type: MESSAGE_TYPES.CLEAR_DEFAULT_PASSWORD });
    expect(clearRes).toEqual({ ok: true, value: undefined });
    const stateAfter = await send({ type: MESSAGE_TYPES.GET_DEFAULT_PASSWORD_STATE });
    expect(stateAfter).toEqual({ ok: true, value: { isSet: false, updatedAt: null } });
  });
});

describe('CHANGE_ACCOUNTS_PIN', () => {
  it('re-encrypts every account password and the default password under the new PIN', async () => {
    await setUpPin('111111', 30);
    const passwordA = await encryptSecret('secret-a');
    store['senmurv:accounts'] = [makeAccount({ id: 'acct_1', encryptedPassword: passwordA })];
    const passwordDefault = await encryptSecret('default-secret');
    store['senmurv:defaultPassword'] = { encryptedPassword: passwordDefault, updatedAt: 1 };

    const res = await send({
      type: MESSAGE_TYPES.CHANGE_ACCOUNTS_PIN,
      payload: { currentPin: '111111', newPin: '222222' },
    });
    expect(res).toEqual({ ok: true, value: undefined });

    // Old PIN no longer works.
    await send({ type: MESSAGE_TYPES.LOCK_ACCOUNTS });
    const oldPinResult = await send({
      type: MESSAGE_TYPES.UNLOCK_ACCOUNTS,
      payload: { pin: '111111' },
    });
    expect(oldPinResult).toEqual({ ok: false, error: 'Incorrect PIN.' });

    // New PIN unlocks and decrypts the saved account's password correctly.
    const newPinResult = await send({
      type: MESSAGE_TYPES.UNLOCK_ACCOUNTS,
      payload: { pin: '222222' },
    });
    expect(newPinResult).toEqual({ ok: true, value: undefined });

    const accounts = await send({ type: MESSAGE_TYPES.GET_ACCOUNTS });
    const reencrypted = ((accounts as Response).value as Account[])[0]?.encryptedPassword;
    expect(reencrypted?.ciphertext).not.toBe(passwordA.ciphertext);
  });

  it('rejects an incorrect current PIN without changing anything', async () => {
    await setUpPin('111111', 30);
    const res = await send({
      type: MESSAGE_TYPES.CHANGE_ACCOUNTS_PIN,
      payload: { currentPin: '000000', newPin: '222222' },
    });
    expect(res).toEqual({ ok: false, error: 'Incorrect PIN.' });
  });

  it('rejects a new PIN outside the 6-15 digit range, even with the correct current PIN', async () => {
    await setUpPin('111111', 30);
    const tooShort = await send({
      type: MESSAGE_TYPES.CHANGE_ACCOUNTS_PIN,
      payload: { currentPin: '111111', newPin: '12345' },
    });
    expect(tooShort).toEqual({ ok: false, error: 'PIN must be 6-15 digits.' });

    const tooLong = await send({
      type: MESSAGE_TYPES.CHANGE_ACCOUNTS_PIN,
      payload: { currentPin: '111111', newPin: '1234567890123456' },
    });
    expect(tooLong).toEqual({ ok: false, error: 'PIN must be 6-15 digits.' });

    // The original PIN still works -- neither rejected attempt changed anything.
    await send({ type: MESSAGE_TYPES.LOCK_ACCOUNTS });
    const stillWorks = await send({
      type: MESSAGE_TYPES.UNLOCK_ACCOUNTS,
      payload: { pin: '111111' },
    });
    expect(stillWorks).toEqual({ ok: true, value: undefined });
  });
});

describe('RUN_ACCOUNT_LOGIN', () => {
  it('navigates, waits for load, and asks the content script to fill + click', async () => {
    await setUpPin('123456', 30);
    const encryptedPassword = await encryptSecret('hunter2');
    store['senmurv:accounts'] = [makeAccount({ encryptedPassword })];
    chromeMock.tabs.sendMessage.mockResolvedValueOnce({ ok: true, value: undefined });

    const resultPromise = send({
      type: MESSAGE_TYPES.RUN_ACCOUNT_LOGIN,
      payload: { id: 'acct_1' },
    });
    await completeNavigation();
    const res = await resultPromise;

    expect(res).toEqual({ ok: true, value: undefined });
    expect(chromeMock.tabs.update).toHaveBeenCalledWith(1, { url: 'https://sub.x.com' });
    const [, sentMessage] = chromeMock.tabs.sendMessage.mock.calls[0] as unknown as [
      number,
      { type: string; payload: { username: string; password: string } },
    ];
    expect(sentMessage.type).toBe(MESSAGE_TYPES.ACCOUNT_LOGIN_FILL);
    expect(sentMessage.payload.username).toBe('sss@ss.com');
    expect(sentMessage.payload.password).toBe('hunter2');
  });

  it('refuses to navigate to a blocked address', async () => {
    await setUpPin('123456', 30);
    const encryptedPassword = await encryptSecret('hunter2');
    store['senmurv:accounts'] = [
      makeAccount({ address: 'chrome://extensions', encryptedPassword }),
    ];

    const res = await send({ type: MESSAGE_TYPES.RUN_ACCOUNT_LOGIN, payload: { id: 'acct_1' } });
    expect(res).toEqual({
      ok: false,
      error: 'This address is not allowed (chrome://, Web Store, or similar).',
    });
    expect(chromeMock.tabs.update).not.toHaveBeenCalled();
  });

  it('reports a locked error instead of hanging when Accounts are locked', async () => {
    store['senmurv:accounts'] = [makeAccount({ useDefaultPassword: false })];
    const res = await send({ type: MESSAGE_TYPES.RUN_ACCOUNT_LOGIN, payload: { id: 'acct_1' } });
    expect(res).toMatchObject({ ok: false });
  });

  it('uses the shared default password when the account has none of its own', async () => {
    await setUpPin('123456', 30);
    const encryptedPassword = await encryptSecret('shared-default');
    store['senmurv:defaultPassword'] = { encryptedPassword, updatedAt: 1 };
    store['senmurv:accounts'] = [makeAccount({ useDefaultPassword: true })];
    chromeMock.tabs.sendMessage.mockResolvedValueOnce({ ok: true, value: undefined });

    const resultPromise = send({
      type: MESSAGE_TYPES.RUN_ACCOUNT_LOGIN,
      payload: { id: 'acct_1' },
    });
    await completeNavigation();
    await resultPromise;

    const [, sentMessage] = chromeMock.tabs.sendMessage.mock.calls[0] as unknown as [
      number,
      { payload: { password: string } },
    ];
    expect(sentMessage.payload.password).toBe('shared-default');
  });
});
