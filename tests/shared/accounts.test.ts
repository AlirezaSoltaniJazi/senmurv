import { describe, expect, it } from 'vitest';
import {
  applyLocatorSeed,
  duplicateAccount,
  existingGroupNames,
  groupAccounts,
  isValidPin,
  newAccount,
  upsertAccount,
  validateAccount,
} from '@/shared/accounts';
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

  it('trims a group and keeps it', () => {
    const result = validateAccount(mk({ group: '  Group A  ' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.group).toBe('Group A');
  });

  it('drops a blank/whitespace-only group entirely', () => {
    const result = validateAccount(mk({ group: '   ' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.group).toBeUndefined();
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

describe('applyLocatorSeed', () => {
  it('merges a username-field seed without touching the other locators', () => {
    const account = mk();
    const next = applyLocatorSeed(account, { field: 'username', kind: 'xpath', query: '//input' });
    expect(next.usernameField).toEqual({ kind: 'xpath', query: '//input' });
    expect(next.passwordField).toEqual(account.passwordField);
    expect(next.loginButton).toEqual(account.loginButton);
  });

  it('merges a password-field seed', () => {
    const account = mk();
    const next = applyLocatorSeed(account, { field: 'password', kind: 'css', query: '#pw' });
    expect(next.passwordField).toEqual({ kind: 'css', query: '#pw' });
  });

  it('merges a login-button seed', () => {
    const account = mk();
    const next = applyLocatorSeed(account, { field: 'loginButton', kind: 'css', query: '#go' });
    expect(next.loginButton).toEqual({ kind: 'css', query: '#go' });
  });

  it('leaves every other field on the account untouched', () => {
    const account = mk();
    const next = applyLocatorSeed(account, { field: 'username', kind: 'css', query: '#u' });
    expect(next.name).toBe(account.name);
    expect(next.address).toBe(account.address);
    expect(next.id).toBe(account.id);
  });
});

describe('duplicateAccount', () => {
  it('errors when the source account no longer exists', () => {
    const result = duplicateAccount([], 'acct_missing', 100);
    expect(result).toEqual({
      ok: false,
      error: 'Account not found — it may have been deleted.',
    });
  });

  it('clones with a fresh id and a de-duplicated name, copying everything else as-is', () => {
    const source = mk({ id: 'acct_1', name: 'My Site' });
    const result = duplicateAccount([source], 'acct_1', 200);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).not.toBe(source.id);
    expect(result.value.name).toBe('My Site (2)');
    expect(result.value.address).toBe(source.address);
    expect(result.value.username).toBe(source.username);
    expect(result.value.encryptedPassword).toEqual(source.encryptedPassword);
    expect(result.value.usernameField).toEqual(source.usernameField);
    expect(result.value.createdAt).toBe(200);
    expect(result.value.updatedAt).toBe(200);
  });

  it('keeps incrementing the suffix across repeated duplicates', () => {
    const source = mk({ id: 'acct_1', name: 'My Site' });
    const firstCopy = mk({ id: 'acct_2', name: 'My Site (2)' });
    const result = duplicateAccount([source, firstCopy], 'acct_1', 300);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).toBe('My Site (3)');
  });

  it('does not need Accounts to be unlocked, since it never touches plaintext', () => {
    // No encryptSecret/decryptSecret call is even possible here — duplicateAccount
    // takes plain Account objects and never imports shared/crypto.
    const source = mk({ useDefaultPassword: true });
    delete source.encryptedPassword;
    const result = duplicateAccount([source], source.id, 400);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.useDefaultPassword).toBe(true);
  });

  it('copies the source group unchanged', () => {
    const source = mk({ group: 'Group A' });
    const result = duplicateAccount([source], source.id, 500);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.group).toBe('Group A');
  });
});

describe('groupAccounts', () => {
  it('buckets accounts without a group under Default', () => {
    const groups = groupAccounts([mk({ id: 'a' }), mk({ id: 'b' })]);
    expect(groups).toEqual([{ name: 'Default', accounts: [mk({ id: 'a' }), mk({ id: 'b' })] }]);
  });

  it('treats a blank/whitespace-only group the same as no group', () => {
    const groups = groupAccounts([mk({ id: 'a', group: '   ' })]);
    expect(groups.map((g) => g.name)).toEqual(['Default']);
  });

  it('sorts Default first, then real groups alphabetically', () => {
    const groups = groupAccounts([
      mk({ id: 'a', group: 'Group B' }),
      mk({ id: 'b' }),
      mk({ id: 'c', group: 'Group A' }),
    ]);
    expect(groups.map((g) => g.name)).toEqual(['Default', 'Group A', 'Group B']);
  });

  it('keeps each group internally in the accounts array order', () => {
    const groups = groupAccounts([
      mk({ id: 'a', group: 'X', name: 'First' }),
      mk({ id: 'b', group: 'X', name: 'Second' }),
    ]);
    expect(groups[0]?.accounts.map((a) => a.name)).toEqual(['First', 'Second']);
  });

  it('omits groups with no members and returns [] for an empty list', () => {
    expect(groupAccounts([])).toEqual([]);
  });
});

describe('existingGroupNames', () => {
  it('returns distinct, sorted, real group names, excluding Default/blank', () => {
    const names = existingGroupNames([
      mk({ id: 'a', group: 'Group B' }),
      mk({ id: 'b' }),
      mk({ id: 'c', group: 'Group A' }),
      mk({ id: 'd', group: 'Group A' }),
      mk({ id: 'e', group: '  ' }),
    ]);
    expect(names).toEqual(['Group A', 'Group B']);
  });

  it('returns [] when nothing is grouped', () => {
    expect(existingGroupNames([mk()])).toEqual([]);
  });
});
