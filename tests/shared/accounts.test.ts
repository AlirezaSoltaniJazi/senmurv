import { describe, expect, it } from 'vitest';
import { isValidPin, newAccount, upsertAccount, validateAccount } from '@/shared/accounts';
import type { Account } from '@/shared/types';

function mk(over: Partial<Account> = {}): Account {
  return {
    id: 'acct_1',
    name: 'My Site',
    address: 'https://sub.x.com',
    username: 'sss@ss.com',
    useDefaultPassword: false,
    encryptedPassword: { ciphertext: 'abc', iv: 'def' },
    usernameField: { kind: 'css', query: '#username' },
    passwordField: { kind: 'css', query: '#password' },
    loginButton: { kind: 'css', query: '#login' },
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

describe('newAccount', () => {
  it('returns a blank account with css-kind locators and no password', () => {
    const account = newAccount(100);
    expect(account.id).toMatch(/^acct_/);
    expect(account.name).toBe('');
    expect(account.address).toBe('');
    expect(account.useDefaultPassword).toBe(false);
    expect(account.encryptedPassword).toBeUndefined();
    expect(account.usernameField).toEqual({ kind: 'css', query: '' });
    expect(account.createdAt).toBe(100);
    expect(account.updatedAt).toBe(100);
  });
});

describe('validateAccount', () => {
  it('accepts a fully-formed account and normalizes a bare-host address', () => {
    const result = validateAccount(mk({ address: 'sub.x.com' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.address).toBe('https://sub.x.com');
  });

  it('leaves an address that already has a scheme untouched', () => {
    const result = validateAccount(mk({ address: 'http://localhost:3000/login' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.address).toBe('http://localhost:3000/login');
  });

  it('rejects a blank name', () => {
    const result = validateAccount(mk({ name: '  ' }));
    expect(result).toEqual({ ok: false, error: 'Give the account a name.' });
  });

  it('rejects a blank address', () => {
    const result = validateAccount(mk({ address: '  ' }));
    expect(result).toEqual({ ok: false, error: 'Enter the address to log into.' });
  });

  it('rejects an address that cannot be parsed as a URL', () => {
    const result = validateAccount(mk({ address: 'http://' }));
    expect(result.ok).toBe(false);
  });

  it('rejects a blank username', () => {
    const result = validateAccount(mk({ username: ' ' }));
    expect(result).toEqual({ ok: false, error: 'Enter the account/email to log in with.' });
  });

  it('rejects a blank username-field locator', () => {
    const result = validateAccount(mk({ usernameField: { kind: 'css', query: ' ' } }));
    expect(result).toEqual({ ok: false, error: 'Enter a locator for the username field.' });
  });

  it('rejects a blank password-field locator', () => {
    const result = validateAccount(mk({ passwordField: { kind: 'xpath', query: '' } }));
    expect(result).toEqual({ ok: false, error: 'Enter a locator for the password field.' });
  });

  it('rejects a blank login-button locator', () => {
    const result = validateAccount(mk({ loginButton: { kind: 'css', query: '' } }));
    expect(result).toEqual({ ok: false, error: 'Enter a locator for the login button.' });
  });

  it('rejects no password when useDefaultPassword is false and none is set', () => {
    const account = mk({ useDefaultPassword: false });
    delete account.encryptedPassword;
    const result = validateAccount(account);
    expect(result).toEqual({
      ok: false,
      error: 'Enter a password, or check "use default password".',
    });
  });

  it('accepts useDefaultPassword true with no own password, and drops any existing one', () => {
    const result = validateAccount(mk({ useDefaultPassword: true }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.encryptedPassword).toBeUndefined();
  });

  it('trims whitespace from name, username, and every locator query', () => {
    const result = validateAccount(
      mk({
        name: '  My Site  ',
        username: '  sss@ss.com  ',
        usernameField: { kind: 'css', query: '  #username  ' },
      })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('My Site');
      expect(result.value.username).toBe('sss@ss.com');
      expect(result.value.usernameField.query).toBe('#username');
    }
  });
});

describe('upsertAccount', () => {
  it('appends a new account', () => {
    const next = upsertAccount([], mk({ id: 'acct_new' }), 200);
    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe('acct_new');
    expect(next[0]?.updatedAt).toBe(200);
  });

  it('replaces an existing account by id and stamps updatedAt', () => {
    const existing = mk({ id: 'acct_1', name: 'Old Name' });
    const updated = mk({ id: 'acct_1', name: 'New Name' });
    const next = upsertAccount([existing], updated, 300);
    expect(next).toHaveLength(1);
    expect(next[0]?.name).toBe('New Name');
    expect(next[0]?.updatedAt).toBe(300);
  });

  it('leaves other accounts untouched', () => {
    const other = mk({ id: 'acct_other' });
    const next = upsertAccount([other], mk({ id: 'acct_1' }), 300);
    expect(next).toHaveLength(2);
    expect(next.find((a) => a.id === 'acct_other')).toEqual(other);
  });
});

describe('isValidPin', () => {
  it('accepts PINs at both boundaries', () => {
    expect(isValidPin('123456')).toBe(true); // 6 digits
    expect(isValidPin('123456789012345')).toBe(true); // 15 digits
  });

  it('rejects shorter than 6 digits', () => {
    expect(isValidPin('12345')).toBe(false);
    expect(isValidPin('')).toBe(false);
  });

  it('rejects longer than 15 digits', () => {
    expect(isValidPin('1234567890123456')).toBe(false);
  });

  it('rejects non-digit characters', () => {
    expect(isValidPin('12345a')).toBe(false);
    expect(isValidPin('123 456')).toBe(false);
    expect(isValidPin('123456.')).toBe(false);
  });
});
