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
    useDefaultOtp: false,
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
 * Validate a fully-formed candidate account (with `encryptedPassword`/
 * `encryptedOtp` already resolved by the caller). Returns the cleaned account
 * (trimmed fields, normalized address) or the first problem found, so the
 * editor can block Save and say why.
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

  // OTP is entirely optional — but if ANY piece of it is set, the whole set
  // (both locators + a code) must be, so login never half-configures OTP.
  const otpFieldQuery = draft.otpField?.query.trim() ?? '';
  const confirmOtpButtonQuery = draft.confirmOtpButton?.query.trim() ?? '';
  const usesOtp =
    otpFieldQuery !== '' ||
    confirmOtpButtonQuery !== '' ||
    Boolean(draft.useDefaultOtp) ||
    Boolean(draft.encryptedOtp);
  if (usesOtp) {
    if (otpFieldQuery === '') {
      return {
        ok: false,
        error: 'Enter a locator for the OTP field, or clear the other OTP fields.',
      };
    }
    if (confirmOtpButtonQuery === '') {
      return {
        ok: false,
        error: 'Enter a locator for the confirm-OTP button, or clear the other OTP fields.',
      };
    }
    if (!draft.useDefaultOtp && !draft.encryptedOtp) {
      return { ok: false, error: 'Enter an OTP code, or check "use default OTP code".' };
    }
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
  if (usesOtp) {
    clean.otpField = { kind: draft.otpField?.kind ?? 'css', query: otpFieldQuery };
    clean.confirmOtpButton = {
      kind: draft.confirmOtpButton?.kind ?? 'css',
      query: confirmOtpButtonQuery,
    };
    clean.useDefaultOtp = Boolean(draft.useDefaultOtp);
    if (draft.useDefaultOtp) delete clean.encryptedOtp;
  } else {
    delete clean.otpField;
    delete clean.confirmOtpButton;
    delete clean.encryptedOtp;
    delete clean.useDefaultOtp;
  }
  const group = draft.group?.trim();
  if (group) clean.group = group;
  else delete clean.group;
  const description = draft.description?.trim();
  if (description) clean.description = description;
  else delete clean.description;
  return { ok: true, value: clean };
}

/** `account` with the seeded locator merged into whichever field it targets
 *  (the Locator tab's "Add to account" buttons), plus its group when the
 *  seed carries one. */
export function applyLocatorSeed(account: Account, seed: AccountLocatorSeed): Account {
  const locator = { kind: seed.kind, query: seed.query };
  let next: Account;
  switch (seed.field) {
    case 'username':
      next = { ...account, usernameField: locator };
      break;
    case 'password':
      next = { ...account, passwordField: locator };
      break;
    case 'loginButton':
      next = { ...account, loginButton: locator };
      break;
    case 'otp':
      next = { ...account, otpField: locator };
      break;
    case 'confirmOtpButton':
      next = { ...account, confirmOtpButton: locator };
      break;
  }
  const group = seed.group?.trim();
  if (group) next = { ...next, group };
  return next;
}

/** One group's worth of accounts (or account-shaped items), in their
 *  existing relative order. */
export interface AccountGroup<T> {
  name: string;
  accounts: T[];
}

/**
 * Bucket account-shaped items by their `group` (blank/absent falls into
 * {@link DEFAULT_GROUP_NAME}), each bucket keeping the items' existing
 * relative order. Buckets are sorted with Default first, then alphabetically
 * (case-insensitive); a bucket only appears if it has at least one item.
 * Generic so it also groups the Accounts import's staged `ImportedAccount[]`
 * (which has a `group` field but no `id`) — not just stored `Account[]`.
 */
export function groupAccounts<T extends { group?: string | undefined }>(
  items: T[]
): AccountGroup<T>[] {
  const byName = new Map<string, T[]>();
  for (const item of items) {
    const name = item.group?.trim() || DEFAULT_GROUP_NAME;
    const bucket = byName.get(name);
    if (bucket) bucket.push(item);
    else byName.set(name, [item]);
  }
  return [...byName.entries()]
    .sort(([a], [b]) => {
      if (a === DEFAULT_GROUP_NAME) return b === DEFAULT_GROUP_NAME ? 0 : -1;
      if (b === DEFAULT_GROUP_NAME) return 1;
      return a.localeCompare(b);
    })
    .map(([name, groupItems]) => ({ name, accounts: groupItems }));
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

/**
 * Rename group `from` → `to` on every account currently bucketed under it
 * (trimmed, exact match — including via {@link DEFAULT_GROUP_NAME}'s
 * blank/absent fallback). A no-op if `from` is blank/Default (Default isn't a
 * real group — nothing to rename), or if `to` is blank, unchanged, or itself
 * resolves to Default (reserved for the fallback bucket, never a real
 * account's `group` value). Pure — leaves `updatedAt` untouched.
 */
export function renameGroup(accounts: Account[], from: string, to: string): Account[] {
  const source = from.trim();
  const target = to.trim();
  if (source === '' || source.toLowerCase() === DEFAULT_GROUP_NAME.toLowerCase()) return accounts;
  if (
    target === '' ||
    target === source ||
    target.toLowerCase() === DEFAULT_GROUP_NAME.toLowerCase()
  ) {
    return accounts;
  }
  return accounts.map((a) =>
    (a.group?.trim() || DEFAULT_GROUP_NAME) === source ? { ...a, group: target } : a
  );
}

/**
 * Move account `id` into `group` (trimmed; blank or {@link DEFAULT_GROUP_NAME}
 * clears the field, same fallback every other group operation uses). A no-op
 * if the account isn't found or is already in that group. The moved account
 * is repositioned to just after the last existing member of its new group —
 * it becomes that group's last item, mirroring `nestScript`'s "becomes the
 * folder's last child" contract for Scripts. Pure — leaves `updatedAt`
 * untouched, matching `renameGroup` (a structural move, not a content edit).
 */
export function moveAccountToGroup(accounts: Account[], id: string, group: string): Account[] {
  const trimmed = group.trim();
  const isDefault = trimmed === '' || trimmed.toLowerCase() === DEFAULT_GROUP_NAME.toLowerCase();
  const targetGroupName = isDefault ? DEFAULT_GROUP_NAME : trimmed;
  const moving = accounts.find((a) => a.id === id);
  if (!moving) return accounts;
  if ((moving.group?.trim() || DEFAULT_GROUP_NAME) === targetGroupName) return accounts;

  let updated: Account;
  if (isDefault) {
    const { group: _drop, ...rest } = moving;
    updated = rest;
  } else {
    updated = { ...moving, group: trimmed };
  }

  const others = accounts.filter((a) => a.id !== id);
  let insertAt = others.length;
  for (let i = others.length - 1; i >= 0; i -= 1) {
    const candidate = others[i];
    if (candidate && (candidate.group?.trim() || DEFAULT_GROUP_NAME) === targetGroupName) {
      insertAt = i + 1;
      break;
    }
  }
  others.splice(insertAt, 0, updated);
  return others;
}

/**
 * Reorder `movingId` to just before `targetId` — only when both are
 * currently in the SAME group (by the same blank/Default-fallback
 * comparison every group operation uses). A cross-group drop is a no-op;
 * use {@link moveAccountToGroup} for that instead. Pure — leaves `updatedAt`
 * untouched, matching `moveAccountToGroup`/Scripts' `moveScriptBefore`.
 */
export function moveAccountBefore(
  accounts: Account[],
  movingId: string,
  targetId: string
): Account[] {
  if (movingId === targetId) return accounts;
  const moving = accounts.find((a) => a.id === movingId);
  const target = accounts.find((a) => a.id === targetId);
  if (!moving || !target) return accounts;
  if (
    (moving.group?.trim() || DEFAULT_GROUP_NAME) !== (target.group?.trim() || DEFAULT_GROUP_NAME)
  ) {
    return accounts;
  }
  const rest = accounts.filter((a) => a.id !== movingId);
  const at = rest.findIndex((a) => a.id === targetId);
  rest.splice(at, 0, moving);
  return rest;
}

/**
 * Apply one locator field (`seed`) to every account bucketed under any of
 * `groups` (each trimmed, via {@link DEFAULT_GROUP_NAME}'s blank/absent
 * fallback like every other group operation) — the editor's "Apply to
 * group(s)" buttons, for setting up several near-identical accounts (e.g.
 * the same login form across environments/groups) without re-locating the
 * same field on each one by hand. Blank and Default entries in `groups` are
 * dropped before matching: bulk-editing every ungrouped account is a much
 * bigger, less intentional blast radius than a deliberately named group. A
 * no-op if that leaves no real target groups. Reuses {@link applyLocatorSeed}
 * per account, so it's applied uniformly including to the account the seed
 * came from (a no-op there — it already has this value).
 */
export function applyLocatorToGroups(
  accounts: Account[],
  groups: string[],
  seed: AccountLocatorSeed,
  now: number
): Account[] {
  const targets = new Set(
    groups
      .map((g) => g.trim())
      .filter((g) => g !== '' && g.toLowerCase() !== DEFAULT_GROUP_NAME.toLowerCase())
  );
  if (targets.size === 0) return accounts;
  return accounts.map((a) =>
    targets.has(a.group?.trim() || DEFAULT_GROUP_NAME)
      ? { ...applyLocatorSeed(a, seed), updatedAt: now }
      : a
  );
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
