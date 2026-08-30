import { ACCOUNTS_PIN_MAX_LENGTH, ACCOUNTS_PIN_MIN_LENGTH } from '@/shared/constants';
import { uniqueName } from '@/shared/script-io';
import type { Account, AccountLocatorSeed, Result } from '@/shared/types';
import { newId } from '@/utils/id';

/**
 * Pure logic for saved login accounts (Accounts tab). Chrome-free, crypto-free
 * and DOM-free so it unit-tests cleanly; this module never sees a plaintext
 * password — only the already-encrypted-or-absent `encryptedPassword` field
 * on a fully-formed Account. Actual reads/writes live in shared/storage.ts;
 * encryption/decryption lives in shared/crypto.ts (service-worker only).
 */

/** A PIN of 6-15 digits (no other characters). Shared by the side panel
 *  (immediate feedback) and the service worker (authoritative check). */
export function isValidPin(pin: string): boolean {
  return (
    pin.length >= ACCOUNTS_PIN_MIN_LENGTH &&
    pin.length <= ACCOUNTS_PIN_MAX_LENGTH &&
    /^\d+$/.test(pin)
  );
}

/** The bucket an account without its own group falls into. */
export const DEFAULT_GROUP_NAME = 'Default';

/** A blank account, ready for the editor. */
export function newAccount(now: number): Account {
  return {
    id: newId('acct_'),
    name: '',
    address: '',
    username: '',
    useDefaultPassword: false,
    usernameField: { kind: 'css', query: '' },
    passwordField: { kind: 'css', query: '' },
    loginButton: { kind: 'css', query: '' },
    createdAt: now,
    updatedAt: now,
  };
}

/** Prepend https:// if the user typed a bare host (e.g. "sub.x.com") — a
 *  scheme is required to navigate a tab to it. */
function normalizeAddress(input: string): Result<string> {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, error: 'Enter the address to log into.' };
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    new URL(withScheme);
  } catch {
    return { ok: false, error: 'That does not look like a valid address.' };
  }
  return { ok: true, value: withScheme };
}

/**
 * Validate a fully-formed candidate account (with `encryptedPassword` already
 * resolved by the caller). Returns the cleaned account (trimmed fields,
 * normalized address) or the first problem found, so the editor can block
 * Save and say why.
 */
export function validateAccount(draft: Account): Result<Account> {
  const name = draft.name.trim();
  if (name === '') return { ok: false, error: 'Give the account a name.' };

  const address = normalizeAddress(draft.address);
  if (!address.ok) return address;

  const username = draft.username.trim();
  if (username === '') return { ok: false, error: 'Enter the account/email to log in with.' };

  const usernameQuery = draft.usernameField.query.trim();
  if (usernameQuery === '') return { ok: false, error: 'Enter a locator for the username field.' };

  const passwordQuery = draft.passwordField.query.trim();
  if (passwordQuery === '') return { ok: false, error: 'Enter a locator for the password field.' };

  const loginButtonQuery = draft.loginButton.query.trim();
  if (loginButtonQuery === '') return { ok: false, error: 'Enter a locator for the login button.' };

  if (!draft.useDefaultPassword && !draft.encryptedPassword) {
    return { ok: false, error: 'Enter a password, or check "use default password".' };
  }

  const clean: Account = {
    ...draft,
    name,
    address: address.value,
    username,
    usernameField: { ...draft.usernameField, query: usernameQuery },
    passwordField: { ...draft.passwordField, query: passwordQuery },
    loginButton: { ...draft.loginButton, query: loginButtonQuery },
  };
  if (draft.useDefaultPassword) delete clean.encryptedPassword;
  const group = draft.group?.trim();
  if (group) clean.group = group;
  else delete clean.group;
  return { ok: true, value: clean };
}

/** `account` with the seeded locator merged into whichever field it targets
 *  (the Locator tab's "Add to account" buttons). */
export function applyLocatorSeed(account: Account, seed: AccountLocatorSeed): Account {
  const locator = { kind: seed.kind, query: seed.query };
  if (seed.field === 'username') return { ...account, usernameField: locator };
  if (seed.field === 'password') return { ...account, passwordField: locator };
  return { ...account, loginButton: locator };
}

/** One group's worth of accounts, in their existing relative order. */
export interface AccountGroup {
  name: string;
  accounts: Account[];
}

/**
 * Bucket accounts by their `group` (blank/absent falls into
 * {@link DEFAULT_GROUP_NAME}), each bucket keeping the accounts' existing
 * relative order. Buckets are sorted with Default first, then alphabetically
 * (case-insensitive); a bucket only appears if it has at least one account.
 */
export function groupAccounts(accounts: Account[]): AccountGroup[] {
  const byName = new Map<string, Account[]>();
  for (const account of accounts) {
    const name = account.group?.trim() || DEFAULT_GROUP_NAME;
    const bucket = byName.get(name);
    if (bucket) bucket.push(account);
    else byName.set(name, [account]);
  }
  return [...byName.entries()]
    .sort(([a], [b]) => {
      if (a === DEFAULT_GROUP_NAME) return b === DEFAULT_GROUP_NAME ? 0 : -1;
      if (b === DEFAULT_GROUP_NAME) return 1;
      return a.localeCompare(b);
    })
    .map(([name, groupAccountsList]) => ({ name, accounts: groupAccountsList }));
}

/** Distinct, real (non-Default) group names already in use — offered as
 *  autocomplete suggestions in the editor's Group field. */
export function existingGroupNames(accounts: Account[]): string[] {
  const names = new Set<string>();
  for (const account of accounts) {
    const trimmed = account.group?.trim();
    if (trimmed) names.add(trimmed);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** Insert or replace `account` by id, stamping `updatedAt`; returns the new list. */
export function upsertAccount(accounts: Account[], account: Account, now: number): Account[] {
  const next = { ...account, updatedAt: now };
  const at = accounts.findIndex((a) => a.id === account.id);
  if (at === -1) return [...accounts, next];
  return accounts.map((a) => (a.id === account.id ? next : a));
}

/**
 * Clone the account with `id`: a fresh id and a de-duplicated name (via the
 * same `uniqueName` helper the Scripts/Notes import-conflict resolution
 * uses), everything else — including `encryptedPassword` — copied as-is.
 * Crypto-free: the ciphertext is valid under any id, so this never needs to
 * decrypt/re-encrypt, and works even while Accounts is locked.
 */
export function duplicateAccount(accounts: Account[], id: string, now: number): Result<Account> {
  const source = accounts.find((a) => a.id === id);
  if (!source) return { ok: false, error: 'Account not found — it may have been deleted.' };
  const name = uniqueName(source.name, new Set(accounts.map((a) => a.name)));
  return {
    ok: true,
    value: { ...source, id: newId('acct_'), name, createdAt: now, updatedAt: now },
  };
}
