import { describe, expect, it } from 'vitest';
import {
  applyLocatorSeed,
  applyLocatorToGroups,
  DEFAULT_GROUP_NAME,
  duplicateAccount,
  existingGroupNames,
  groupAccounts,
  isValidPin,
  moveAccountBefore,
  moveAccountToGroup,
  newAccount,
  renameGroup,
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

  it('has no OTP configured by default', () => {
    const account = newAccount(100);
    expect(account.useDefaultOtp).toBe(false);
    expect(account.otpField).toBeUndefined();
    expect(account.confirmOtpButton).toBeUndefined();
    expect(account.encryptedOtp).toBeUndefined();
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

  it('trims a description and keeps it', () => {
    const result = validateAccount(mk({ description: '  Staging login  ' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.description).toBe('Staging login');
  });

  it('drops a blank/whitespace-only description entirely', () => {
    const result = validateAccount(mk({ description: '   ' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.description).toBeUndefined();
  });

  it('accepts an account with no OTP configured at all', () => {
    const result = validateAccount(mk());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.otpField).toBeUndefined();
      expect(result.value.confirmOtpButton).toBeUndefined();
      expect(result.value.encryptedOtp).toBeUndefined();
      expect(result.value.useDefaultOtp).toBeUndefined();
    }
  });

  it('requires the confirm-OTP button once the OTP field is set', () => {
    const result = validateAccount(
      mk({ otpField: { kind: 'css', query: '#otp' }, useDefaultOtp: true })
    );
    expect(result).toEqual({
      ok: false,
      error: 'Enter a locator for the confirm-OTP button, or clear the other OTP fields.',
    });
  });

  it('requires the OTP field once the confirm-OTP button is set', () => {
    const result = validateAccount(
      mk({ confirmOtpButton: { kind: 'css', query: '#confirm' }, useDefaultOtp: true })
    );
    expect(result).toEqual({
      ok: false,
      error: 'Enter a locator for the OTP field, or clear the other OTP fields.',
    });
  });

  it('requires an OTP code (own or default) once both OTP locators are set', () => {
    const result = validateAccount(
      mk({
        otpField: { kind: 'css', query: '#otp' },
        confirmOtpButton: { kind: 'css', query: '#confirm' },
        useDefaultOtp: false,
      })
    );
    expect(result).toEqual({
      ok: false,
      error: 'Enter an OTP code, or check "use default OTP code".',
    });
  });

  it('accepts a fully-configured OTP setup and keeps all three fields', () => {
    const result = validateAccount(
      mk({
        otpField: { kind: 'css', query: '#otp' },
        confirmOtpButton: { kind: 'css', query: '#confirm' },
        useDefaultOtp: true,
      })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.otpField).toEqual({ kind: 'css', query: '#otp' });
      expect(result.value.confirmOtpButton).toEqual({ kind: 'css', query: '#confirm' });
      expect(result.value.useDefaultOtp).toBe(true);
    }
  });

  it('accepts an own OTP code (not the default) and keeps encryptedOtp', () => {
    const result = validateAccount(
      mk({
        otpField: { kind: 'css', query: '#otp' },
        confirmOtpButton: { kind: 'css', query: '#confirm' },
        useDefaultOtp: false,
        encryptedOtp: { ciphertext: 'xyz', iv: 'abc' },
      })
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.encryptedOtp).toEqual({ ciphertext: 'xyz', iv: 'abc' });
  });

  it('drops encryptedOtp when useDefaultOtp is true', () => {
    const result = validateAccount(
      mk({
        otpField: { kind: 'css', query: '#otp' },
        confirmOtpButton: { kind: 'css', query: '#confirm' },
        useDefaultOtp: true,
        encryptedOtp: { ciphertext: 'xyz', iv: 'abc' },
      })
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.encryptedOtp).toBeUndefined();
  });

  it('trims OTP locator queries', () => {
    const result = validateAccount(
      mk({
        otpField: { kind: 'css', query: '  #otp  ' },
        confirmOtpButton: { kind: 'css', query: '  #confirm  ' },
        useDefaultOtp: true,
      })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.otpField?.query).toBe('#otp');
      expect(result.value.confirmOtpButton?.query).toBe('#confirm');
    }
  });

  it('keeps well-formed stepDelays', () => {
    const result = validateAccount(
      mk({
        stepDelays: [{ id: 'd1', step: 'username', position: 'before', seconds: 1.5 }],
      })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stepDelays).toEqual([
        { id: 'd1', step: 'username', position: 'before', seconds: 1.5 },
      ]);
    }
  });

  it('clamps out-of-range seconds and rounds to 0.1', () => {
    const result = validateAccount(
      mk({
        stepDelays: [
          { id: 'd1', step: 'username', position: 'before', seconds: -5 },
          { id: 'd2', step: 'password', position: 'after', seconds: 999 },
          { id: 'd3', step: 'loginButton', position: 'before', seconds: 1.23 },
        ],
      })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stepDelays).toEqual([
        { id: 'd1', step: 'username', position: 'before', seconds: 0 },
        { id: 'd2', step: 'password', position: 'after', seconds: 30 },
        { id: 'd3', step: 'loginButton', position: 'before', seconds: 1.2 },
      ]);
    }
  });

  it('drops entries with an unrecognized step or position', () => {
    const result = validateAccount(
      mk({
        stepDelays: [
          { id: 'd1', step: 'bogus' as never, position: 'before', seconds: 1 },
          { id: 'd2', step: 'username', position: 'sideways' as never, seconds: 1 },
          { id: 'd3', step: 'username', position: 'before', seconds: 1 },
        ],
      })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stepDelays).toEqual([
        { id: 'd3', step: 'username', position: 'before', seconds: 1 },
      ]);
    }
  });

  it('omits stepDelays entirely when empty or absent', () => {
    const result = validateAccount(mk({ stepDelays: [] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.stepDelays).toBeUndefined();

    const result2 = validateAccount(mk());
    expect(result2.ok).toBe(true);
    if (result2.ok) expect(result2.value.stepDelays).toBeUndefined();
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

  it('merges an OTP-field seed', () => {
    const account = mk();
    const next = applyLocatorSeed(account, { field: 'otp', kind: 'css', query: '#otp' });
    expect(next.otpField).toEqual({ kind: 'css', query: '#otp' });
  });

  it('merges a confirm-OTP-button seed', () => {
    const account = mk();
    const next = applyLocatorSeed(account, {
      field: 'confirmOtpButton',
      kind: 'css',
      query: '#confirm',
    });
    expect(next.confirmOtpButton).toEqual({ kind: 'css', query: '#confirm' });
  });

  it('also assigns the group when the seed carries one', () => {
    const account = mk();
    const next = applyLocatorSeed(account, {
      field: 'username',
      kind: 'css',
      query: '#u',
      group: 'Group A',
    });
    expect(next.group).toBe('Group A');
    expect(next.usernameField).toEqual({ kind: 'css', query: '#u' });
  });

  it('leaves the group untouched when the seed has none', () => {
    const account = mk({ group: 'Existing Group' });
    const next = applyLocatorSeed(account, { field: 'username', kind: 'css', query: '#u' });
    expect(next.group).toBe('Existing Group');
  });

  it('trims a blank/whitespace-only seed group into a no-op', () => {
    const account = mk({ group: 'Existing Group' });
    const next = applyLocatorSeed(account, {
      field: 'username',
      kind: 'css',
      query: '#u',
      group: '   ',
    });
    expect(next.group).toBe('Existing Group');
  });

  it('strips OTP entirely when clearing the OTP field leaves no other trace of OTP usage', () => {
    const account = mk({
      otpField: { kind: 'css', query: '#otp' },
      confirmOtpButton: { kind: 'css', query: '' },
    });
    const next = applyLocatorSeed(account, { field: 'otp', kind: 'css', query: '' });
    expect(next.otpField).toBeUndefined();
    expect(next.confirmOtpButton).toBeUndefined();
  });

  it('strips useDefaultOtp/encryptedOtp too when OTP is no longer used', () => {
    const account = mk({
      otpField: { kind: 'css', query: '' },
      confirmOtpButton: { kind: 'css', query: '' },
      useDefaultOtp: false,
    });
    const next = applyLocatorSeed(account, { field: 'confirmOtpButton', kind: 'css', query: '' });
    expect(next.useDefaultOtp).toBeUndefined();
    expect(next.encryptedOtp).toBeUndefined();
  });

  it('does NOT strip OTP when the other OTP locator still has a real query', () => {
    const account = mk({
      otpField: { kind: 'css', query: '#otp' },
      confirmOtpButton: { kind: 'css', query: '#confirm' },
    });
    const next = applyLocatorSeed(account, { field: 'otp', kind: 'css', query: '' });
    expect(next.otpField).toEqual({ kind: 'css', query: '' });
    expect(next.confirmOtpButton).toEqual({ kind: 'css', query: '#confirm' });
  });

  it('does NOT strip OTP when useDefaultOtp is on, even with both locators blank', () => {
    const account = mk({
      otpField: { kind: 'css', query: '' },
      confirmOtpButton: { kind: 'css', query: '' },
      useDefaultOtp: true,
    });
    const next = applyLocatorSeed(account, { field: 'otp', kind: 'css', query: '' });
    expect(next.useDefaultOtp).toBe(true);
  });

  it('leaves an unrelated account with real OTP config untouched when applying username/password/loginButton', () => {
    const account = mk({
      otpField: { kind: 'css', query: '#otp' },
      confirmOtpButton: { kind: 'css', query: '#confirm' },
      useDefaultOtp: true,
    });
    const next = applyLocatorSeed(account, { field: 'username', kind: 'css', query: '#u' });
    expect(next.otpField).toEqual({ kind: 'css', query: '#otp' });
    expect(next.confirmOtpButton).toEqual({ kind: 'css', query: '#confirm' });
    expect(next.useDefaultOtp).toBe(true);
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

  it('copies the source description unchanged', () => {
    const source = mk({ description: 'Staging login' });
    const result = duplicateAccount([source], source.id, 600);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.description).toBe('Staging login');
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

  it('is generic over any group-shaped item, not just Account — e.g. the Accounts import staging panel groups plain {group, index} entries', () => {
    const groups = groupAccounts([
      { group: 'Group A', index: 0 },
      { index: 1 }, // no group -> Default
      { group: 'Group A', index: 2 },
    ]);
    expect(groups).toEqual([
      { name: 'Default', accounts: [{ index: 1 }] },
      {
        name: 'Group A',
        accounts: [
          { group: 'Group A', index: 0 },
          { group: 'Group A', index: 2 },
        ],
      },
    ]);
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

describe('renameGroup', () => {
  it('renames every account currently bucketed under the group', () => {
    const accounts = [
      mk({ id: 'a', group: 'Group A' }),
      mk({ id: 'b', group: 'Group A' }),
      mk({ id: 'c', group: 'Group B' }),
    ];
    const next = renameGroup(accounts, 'Group A', 'Renamed');
    expect(next.find((a) => a.id === 'a')?.group).toBe('Renamed');
    expect(next.find((a) => a.id === 'b')?.group).toBe('Renamed');
    expect(next.find((a) => a.id === 'c')?.group).toBe('Group B');
  });

  it('trims the new name', () => {
    const next = renameGroup([mk({ id: 'a', group: 'Group A' })], 'Group A', '  Renamed  ');
    expect(next[0]?.group).toBe('Renamed');
  });

  it('is a no-op when the new name is blank, unchanged, or already the group', () => {
    const accounts = [mk({ id: 'a', group: 'Group A' })];
    expect(renameGroup(accounts, 'Group A', '   ')).toEqual(accounts);
    expect(renameGroup(accounts, 'Group A', 'Group A')).toEqual(accounts);
    expect(renameGroup(accounts, 'Group A', '  Group A  ')).toEqual(accounts);
  });

  it('refuses to rename the Default bucket, since it is not a real group', () => {
    const accounts = [mk({ id: 'a' })]; // no group -> Default
    expect(renameGroup(accounts, DEFAULT_GROUP_NAME, 'Renamed')).toEqual(accounts);
    expect(renameGroup(accounts, '  ', 'Renamed')).toEqual(accounts);
  });

  it('refuses to rename into the reserved Default name', () => {
    const accounts = [mk({ id: 'a', group: 'Group A' })];
    expect(renameGroup(accounts, 'Group A', 'Default')).toEqual(accounts);
    expect(renameGroup(accounts, 'Group A', 'default')).toEqual(accounts);
  });

  it('leaves accounts in other groups untouched', () => {
    const other = mk({ id: 'b', group: 'Group B' });
    const next = renameGroup([mk({ id: 'a', group: 'Group A' }), other], 'Group A', 'Renamed');
    expect(next.find((a) => a.id === 'b')).toEqual(other);
  });
});

describe('moveAccountToGroup', () => {
  it('moves an account into a different group, appended after its last member', () => {
    const accounts = [
      mk({ id: 'a', group: 'Group A' }),
      mk({ id: 'b', group: 'Group B' }),
      mk({ id: 'c', group: 'Group B' }),
    ];
    const next = moveAccountToGroup(accounts, 'a', 'Group B');
    expect(next.map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(next.find((x) => x.id === 'a')?.group).toBe('Group B');
  });

  it('trims the target group name', () => {
    const next = moveAccountToGroup([mk({ id: 'a' })], 'a', '  Group B  ');
    expect(next.find((x) => x.id === 'a')?.group).toBe('Group B');
  });

  it('clears the group field when moved to Default (blank or the reserved name)', () => {
    const accounts = [mk({ id: 'a', group: 'Group A' }), mk({ id: 'b' })];
    const next = moveAccountToGroup(accounts, 'a', '');
    expect(next.find((x) => x.id === 'a')?.group).toBeUndefined();

    const next2 = moveAccountToGroup(accounts, 'a', 'default');
    expect(next2.find((x) => x.id === 'a')?.group).toBeUndefined();
  });

  it('is a no-op when the account is already in that group, or not found', () => {
    const accounts = [mk({ id: 'a', group: 'Group A' })];
    expect(moveAccountToGroup(accounts, 'a', 'Group A')).toEqual(accounts);
    expect(moveAccountToGroup(accounts, 'a', '  Group A  ')).toEqual(accounts);
    expect(moveAccountToGroup(accounts, 'missing', 'Group B')).toEqual(accounts);
  });

  it('does not stamp updatedAt', () => {
    const accounts = [mk({ id: 'a', group: 'Group A', updatedAt: 5 })];
    const next = moveAccountToGroup(accounts, 'a', 'Group B');
    expect(next[0]?.updatedAt).toBe(5);
  });
});

describe('moveAccountBefore', () => {
  it('reorders within the same group', () => {
    const accounts = [
      mk({ id: 'a', group: 'Group A' }),
      mk({ id: 'b', group: 'Group A' }),
      mk({ id: 'c', group: 'Group A' }),
    ];
    const next = moveAccountBefore(accounts, 'c', 'a');
    expect(next.map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });

  it('is a no-op across different groups', () => {
    const accounts = [mk({ id: 'a', group: 'Group A' }), mk({ id: 'b', group: 'Group B' })];
    expect(moveAccountBefore(accounts, 'a', 'b')).toEqual(accounts);
  });

  it('is a no-op when moving an item before itself, or either id is missing', () => {
    const accounts = [mk({ id: 'a' }), mk({ id: 'b' })];
    expect(moveAccountBefore(accounts, 'a', 'a')).toEqual(accounts);
    expect(moveAccountBefore(accounts, 'missing', 'a')).toEqual(accounts);
    expect(moveAccountBefore(accounts, 'a', 'missing')).toEqual(accounts);
  });

  it('treats blank/absent group the same as Default when comparing', () => {
    const accounts = [mk({ id: 'a' }), mk({ id: 'b', group: '  ' }), mk({ id: 'c' })];
    const next = moveAccountBefore(accounts, 'c', 'a');
    expect(next.map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('applyLocatorToGroups', () => {
  const seed = { field: 'username' as const, kind: 'xpath' as const, query: '//input[@id="u"]' };

  it('applies the locator to every account in the group, stamping updatedAt', () => {
    const accounts = [
      mk({ id: 'a', group: 'Group A', updatedAt: 1 }),
      mk({ id: 'b', group: 'Group A', updatedAt: 1 }),
      mk({ id: 'c', group: 'Group B', updatedAt: 1 }),
    ];
    const next = applyLocatorToGroups(accounts, ['Group A'], seed, 999);
    expect(next.find((a) => a.id === 'a')?.usernameField).toEqual({
      kind: 'xpath',
      query: '//input[@id="u"]',
    });
    expect(next.find((a) => a.id === 'a')?.updatedAt).toBe(999);
    expect(next.find((a) => a.id === 'b')?.usernameField).toEqual({
      kind: 'xpath',
      query: '//input[@id="u"]',
    });
    expect(next.find((a) => a.id === 'c')?.usernameField).toEqual(mk().usernameField);
    expect(next.find((a) => a.id === 'c')?.updatedAt).toBe(1);
  });

  it('applies to every account across several groups at once', () => {
    const accounts = [
      mk({ id: 'a', group: 'Group A' }),
      mk({ id: 'b', group: 'Group B' }),
      mk({ id: 'c', group: 'Group C' }),
    ];
    const next = applyLocatorToGroups(accounts, ['Group A', 'Group B'], seed, 2);
    const expected = { kind: seed.kind, query: seed.query };
    expect(next.find((a) => a.id === 'a')?.usernameField).toEqual(expected);
    expect(next.find((a) => a.id === 'b')?.usernameField).toEqual(expected);
    expect(next.find((a) => a.id === 'c')?.usernameField).toEqual(mk().usernameField);
  });

  it('applies to the password field and the login button field too', () => {
    const accounts = [mk({ id: 'a', group: 'Group A' })];
    const password = applyLocatorToGroups(
      accounts,
      ['Group A'],
      { field: 'password', kind: 'css', query: '#pw' },
      2
    );
    expect(password[0]?.passwordField).toEqual({ kind: 'css', query: '#pw' });

    const button = applyLocatorToGroups(
      accounts,
      ['Group A'],
      { field: 'loginButton', kind: 'css', query: '#go' },
      2
    );
    expect(button[0]?.loginButton).toEqual({ kind: 'css', query: '#go' });
  });

  it('leaves every other field on an updated account untouched', () => {
    const account = mk({ id: 'a', group: 'Group A', name: 'My Site' });
    const next = applyLocatorToGroups([account], ['Group A'], seed, 2);
    expect(next[0]?.name).toBe('My Site');
    expect(next[0]?.address).toBe(account.address);
    expect(next[0]?.passwordField).toEqual(account.passwordField);
  });

  it('is a no-op for an empty list, or one with only blank/Default entries', () => {
    const accounts = [mk({ id: 'a' })]; // no group -> Default
    expect(applyLocatorToGroups(accounts, [], seed, 2)).toEqual(accounts);
    expect(applyLocatorToGroups(accounts, [''], seed, 2)).toEqual(accounts);
    expect(applyLocatorToGroups(accounts, ['   '], seed, 2)).toEqual(accounts);
    expect(applyLocatorToGroups(accounts, [DEFAULT_GROUP_NAME], seed, 2)).toEqual(accounts);
    expect(applyLocatorToGroups(accounts, ['default'], seed, 2)).toEqual(accounts);
    expect(applyLocatorToGroups(accounts, ['', DEFAULT_GROUP_NAME], seed, 2)).toEqual(accounts);
  });

  it('leaves accounts in other groups untouched', () => {
    const other = mk({ id: 'b', group: 'Group B' });
    const next = applyLocatorToGroups(
      [mk({ id: 'a', group: 'Group A' }), other],
      ['Group A'],
      seed,
      2
    );
    expect(next.find((a) => a.id === 'b')).toEqual(other);
  });
});
