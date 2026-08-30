import { browser } from '@/shared/browser-api';
import { getAccountsSecurityConfig, setAccountsSecurityConfig } from '@/shared/storage';
import type {
  AccountsLockState,
  AccountsSecurityConfig,
  EncryptedSecret,
  Result,
} from '@/shared/types';

/**
 * PIN-derived encryption for the Accounts tab. Only ever called from
 * src/background/service-worker.ts — a single-threaded owner is what makes
 * "verify the PIN, then cache the derived key" safe without a separate lock,
 * the same reason shared/storage.ts is never imported from the side panel.
 *
 * There is no non-extractable key stored anywhere: the actual secret is the
 * PIN itself, which lives only in the user's head and, transiently, in the
 * derived key cached in `browser.storage.session` (memory-only, cleared when
 * the browser closes, never written to disk) for a configurable window. A
 * full dump of this extension's storage.local AND storage.session is useless
 * without the PIN.
 */

const PBKDF2_ITERATIONS = 600_000;
const PIN_CHECK_PLAINTEXT = 'senmurv-accounts-unlock-check-v1';
const SESSION_STORAGE_KEY = 'senmurv:accountsUnlock';
const DEFAULT_SESSION_MINUTES = 30;
const MIN_SESSION_MINUTES = 1;
const MAX_SESSION_MINUTES = 360;

const LOCKED_ERROR = 'Accounts are locked. Enter your PIN to continue.';
const INCORRECT_PIN_ERROR = 'Incorrect PIN.';

interface CachedSession {
  rawKeyBase64: string;
  expiresAt: number;
}

function toBase64(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function clampSessionMinutes(minutes: number): number {
  return Math.min(MAX_SESSION_MINUTES, Math.max(MIN_SESSION_MINUTES, Math.round(minutes)));
}

async function deriveKey(
  pin: string,
  salt: Uint8Array<ArrayBuffer>,
  extractable: boolean
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt']
  );
}

async function encryptWithKey(key: CryptoKey, plaintext: string): Promise<EncryptedSecret> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return { ciphertext: toBase64(new Uint8Array(ciphertext)), iv: toBase64(iv) };
}

async function decryptWithKey(key: CryptoKey, secret: EncryptedSecret): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(secret.iv) },
    key,
    fromBase64(secret.ciphertext)
  );
  return new TextDecoder().decode(plain);
}

async function getCachedSession(): Promise<CachedSession | undefined> {
  const result = await browser.storage.session.get(SESSION_STORAGE_KEY);
  const cached = result[SESSION_STORAGE_KEY] as CachedSession | undefined;
  if (!cached || typeof cached.rawKeyBase64 !== 'string' || typeof cached.expiresAt !== 'number') {
    return undefined;
  }
  if (Date.now() > cached.expiresAt) return undefined;
  return cached;
}

async function cacheSession(rawKey: ArrayBuffer, sessionMinutes: number): Promise<void> {
  const cached: CachedSession = {
    rawKeyBase64: toBase64(new Uint8Array(rawKey)),
    expiresAt: Date.now() + sessionMinutes * 60_000,
  };
  await browser.storage.session.set({ [SESSION_STORAGE_KEY]: cached });
}

/** Re-import the cached raw key bytes into a usable CryptoKey. */
async function importCachedKey(rawKeyBase64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', fromBase64(rawKeyBase64), { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/**
 * The active AES-GCM key for this unlocked session, refreshing the sliding
 * expiry window on every successful use. Throws LOCKED_ERROR if there is no
 * valid cached session — callers let this propagate as a `{ ok: false }`
 * Result via their existing `.catch` handling.
 */
async function getActiveKey(): Promise<CryptoKey> {
  const cached = await getCachedSession();
  if (!cached) throw new Error(LOCKED_ERROR);
  const config = await getAccountsSecurityConfig();
  const sessionMinutes = config?.sessionMinutes ?? DEFAULT_SESSION_MINUTES;
  // Sliding window: every real use pushes expiry out again.
  await browser.storage.session.set({
    [SESSION_STORAGE_KEY]: { ...cached, expiresAt: Date.now() + sessionMinutes * 60_000 },
  });
  return importCachedKey(cached.rawKeyBase64);
}

/** Encrypt `plaintext` with the current unlocked session's key. */
export async function encryptSecret(plaintext: string): Promise<EncryptedSecret> {
  const key = await getActiveKey();
  return encryptWithKey(key, plaintext);
}

/** Decrypt a secret produced by {@link encryptSecret}. */
export async function decryptSecret(secret: EncryptedSecret): Promise<string> {
  const key = await getActiveKey();
  return decryptWithKey(key, secret);
}

/**
 * First-time PIN setup. Generates a fresh salt, derives a key, encrypts the
 * canary, persists the security config, and immediately caches the derived
 * key so the user is not asked to re-enter the PIN they just set.
 */
export async function setUpPin(
  pin: string,
  sessionMinutes: number
): Promise<AccountsSecurityConfig> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(pin, salt, true);
  const pinCheck = await encryptWithKey(key, PIN_CHECK_PLAINTEXT);
  const clampedMinutes = clampSessionMinutes(sessionMinutes);
  const config: AccountsSecurityConfig = {
    salt: toBase64(salt),
    pinCheck,
    sessionMinutes: clampedMinutes,
    updatedAt: Date.now(),
  };
  await setAccountsSecurityConfig(config);
  const rawKey = await crypto.subtle.exportKey('raw', key);
  await cacheSession(rawKey, clampedMinutes);
  return config;
}

/** Verify `pin` against the stored canary; on success, cache the derived key. */
export async function unlockWithPin(pin: string): Promise<Result<void>> {
  const config = await getAccountsSecurityConfig();
  if (!config) return { ok: false, error: 'No PIN has been set up yet.' };
  try {
    const key = await deriveKey(pin, fromBase64(config.salt), true);
    const checked = await decryptWithKey(key, config.pinCheck);
    if (checked !== PIN_CHECK_PLAINTEXT) return { ok: false, error: INCORRECT_PIN_ERROR };
    const rawKey = await crypto.subtle.exportKey('raw', key);
    await cacheSession(rawKey, config.sessionMinutes);
    return { ok: true, value: undefined };
  } catch {
    // AES-GCM's auth tag makes a wrong key throw during decrypt.
    return { ok: false, error: INCORRECT_PIN_ERROR };
  }
}

/**
 * Verify `pin`, then decrypt every secret in `secrets` under the derived key
 * — for the Accounts export, which re-requires the PIN as a one-off,
 * ceremonial confirmation before revealing plaintext passwords. Deliberately
 * does NOT touch the cached session (unlike unlockWithPin/changePin): export
 * neither requires nor grants an unlocked session, so it works — and leaves
 * the lock state exactly as it found it — whether Accounts was already
 * unlocked or not.
 */
export async function decryptSecretsWithPin(
  pin: string,
  secrets: EncryptedSecret[]
): Promise<Result<string[]>> {
  const config = await getAccountsSecurityConfig();
  if (!config) return { ok: false, error: 'No PIN has been set up yet.' };
  try {
    const key = await deriveKey(pin, fromBase64(config.salt), true);
    const checked = await decryptWithKey(key, config.pinCheck);
    if (checked !== PIN_CHECK_PLAINTEXT) return { ok: false, error: INCORRECT_PIN_ERROR };
    const plaintexts = await Promise.all(secrets.map((s) => decryptWithKey(key, s)));
    return { ok: true, value: plaintexts };
  } catch {
    return { ok: false, error: INCORRECT_PIN_ERROR };
  }
}

/**
 * Change the PIN: verify `currentPin`, decrypt every secret handed in
 * `reencrypt` under the OLD key, re-encrypt each under a NEW key + NEW salt +
 * NEW canary, and return everything so the caller can persist it in one
 * batch. Nothing is written by this function itself, so a failure partway
 * through never leaves mixed old-key/new-key ciphertext on disk.
 */
export async function changePin(
  currentPin: string,
  newPin: string,
  secretsToReencrypt: EncryptedSecret[]
): Promise<Result<{ config: AccountsSecurityConfig; reencrypted: EncryptedSecret[] }>> {
  const config = await getAccountsSecurityConfig();
  if (!config) return { ok: false, error: 'No PIN has been set up yet.' };
  let oldKey: CryptoKey;
  try {
    oldKey = await deriveKey(currentPin, fromBase64(config.salt), true);
    const checked = await decryptWithKey(oldKey, config.pinCheck);
    if (checked !== PIN_CHECK_PLAINTEXT) return { ok: false, error: INCORRECT_PIN_ERROR };
  } catch {
    return { ok: false, error: INCORRECT_PIN_ERROR };
  }

  const plaintexts = await Promise.all(secretsToReencrypt.map((s) => decryptWithKey(oldKey, s)));

  const newSalt = crypto.getRandomValues(new Uint8Array(16));
  const newKey = await deriveKey(newPin, newSalt, true);
  const newPinCheck = await encryptWithKey(newKey, PIN_CHECK_PLAINTEXT);
  const reencrypted = await Promise.all(plaintexts.map((p) => encryptWithKey(newKey, p)));
  const newConfig: AccountsSecurityConfig = {
    salt: toBase64(newSalt),
    pinCheck: newPinCheck,
    sessionMinutes: config.sessionMinutes,
    updatedAt: Date.now(),
  };

  await setAccountsSecurityConfig(newConfig);
  const rawKey = await crypto.subtle.exportKey('raw', newKey);
  await cacheSession(rawKey, newConfig.sessionMinutes);

  return { ok: true, value: { config: newConfig, reencrypted } };
}

/** Change how long an unlocked session lasts before the PIN is required again. */
export async function setSessionMinutes(minutes: number): Promise<Result<void>> {
  const config = await getAccountsSecurityConfig();
  if (!config) return { ok: false, error: 'No PIN has been set up yet.' };
  await setAccountsSecurityConfig({
    ...config,
    sessionMinutes: clampSessionMinutes(minutes),
    updatedAt: Date.now(),
  });
  return { ok: true, value: undefined };
}

/** Clear the cached session — "lock now". */
export async function lockAccounts(): Promise<void> {
  await browser.storage.session.remove(SESSION_STORAGE_KEY);
}

export async function getLockState(): Promise<AccountsLockState> {
  const config = await getAccountsSecurityConfig();
  const cached = await getCachedSession();
  return {
    isPinSet: config !== undefined,
    isUnlocked: cached !== undefined,
    sessionMinutes: config?.sessionMinutes ?? DEFAULT_SESSION_MINUTES,
  };
}

export { DEFAULT_SESSION_MINUTES, LOCKED_ERROR };
