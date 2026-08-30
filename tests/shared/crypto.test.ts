import { describe, expect, it } from 'vitest';
import {
  changePin,
  decryptSecret,
  decryptSecretsWithPin,
  encryptSecret,
  getLockState,
  lockAccounts,
  setSessionMinutes,
  setUpPin,
  unlockWithPin,
} from '@/shared/crypto';
import { sessionStore, store } from '../setup';

describe('shared/crypto', () => {
  describe('setUpPin / getLockState', () => {
    it('reports no PIN set and locked before any setup', async () => {
      expect(await getLockState()).toEqual({
        isPinSet: false,
        isUnlocked: false,
        sessionMinutes: 30,
      });
    });

    it('is unlocked immediately after first-time setup, with no re-entry needed', async () => {
      await setUpPin('123456', 30);
      expect(await getLockState()).toEqual({
        isPinSet: true,
        isUnlocked: true,
        sessionMinutes: 30,
      });
    });

    it('clamps an out-of-range session length', async () => {
      await setUpPin('123456', 10_000);
      expect((await getLockState()).sessionMinutes).toBe(360);
      await setUpPin('123456', -5);
      expect((await getLockState()).sessionMinutes).toBe(1);
    });

    it('never stores the PIN itself in browser.storage.local', async () => {
      await setUpPin('123456', 30);
      const raw = JSON.stringify(store);
      expect(raw).not.toContain('123456');
    });
  });

  describe('encryptSecret / decryptSecret', () => {
    it('round-trips a plaintext password', async () => {
      await setUpPin('123456', 30);
      const secret = await encryptSecret('hunter2');
      expect(secret.ciphertext).not.toContain('hunter2');
      expect(await decryptSecret(secret)).toBe('hunter2');
    });

    it('produces different ciphertext and iv for the same plaintext each time', async () => {
      await setUpPin('123456', 30);
      const a = await encryptSecret('hunter2');
      const b = await encryptSecret('hunter2');
      expect(a.iv).not.toBe(b.iv);
      expect(a.ciphertext).not.toBe(b.ciphertext);
    });

    it('rejects a tampered ciphertext instead of silently returning garbage', async () => {
      await setUpPin('123456', 30);
      const secret = await encryptSecret('hunter2');
      const tampered = { ...secret, ciphertext: `${secret.ciphertext.slice(0, -4)}AAAA` };
      await expect(decryptSecret(tampered)).rejects.toThrow();
    });

    it('throws when nothing is unlocked', async () => {
      await expect(encryptSecret('hunter2')).rejects.toThrow('Accounts are locked');
    });

    it('throws once the session has expired', async () => {
      await setUpPin('123456', 30);
      const cached = sessionStore['senmurv:accountsUnlock'] as { expiresAt: number };
      cached.expiresAt = Date.now() - 1;
      await expect(encryptSecret('hunter2')).rejects.toThrow('Accounts are locked');
    });
  });

  describe('unlockWithPin', () => {
    it('rejects an incorrect PIN without caching anything', async () => {
      await setUpPin('123456', 30);
      await lockAccounts();
      const result = await unlockWithPin('000000');
      expect(result).toEqual({ ok: false, error: 'Incorrect PIN.' });
      expect(await getLockState()).toMatchObject({ isUnlocked: false });
    });

    it('accepts the correct PIN and unlocks a subsequent decrypt', async () => {
      await setUpPin('123456', 30);
      const secret = await encryptSecret('hunter2');
      await lockAccounts();
      await expect(encryptSecret('x')).rejects.toThrow('Accounts are locked'); // sanity: actually locked
      const result = await unlockWithPin('123456');
      expect(result.ok).toBe(true);
      expect(await decryptSecret(secret)).toBe('hunter2');
    });

    it('errors clearly when no PIN has ever been set up', async () => {
      const result = await unlockWithPin('123456');
      expect(result).toEqual({ ok: false, error: 'No PIN has been set up yet.' });
    });
  });

  describe('lockAccounts', () => {
    it('clears the cached session so the next action is locked', async () => {
      await setUpPin('123456', 30);
      await lockAccounts();
      expect(await getLockState()).toMatchObject({ isUnlocked: false });
      await expect(encryptSecret('x')).rejects.toThrow('Accounts are locked');
    });
  });

  describe('setSessionMinutes', () => {
    it('updates the stored session length', async () => {
      await setUpPin('123456', 30);
      const result = await setSessionMinutes(120);
      expect(result.ok).toBe(true);
      expect((await getLockState()).sessionMinutes).toBe(120);
    });

    it('clamps to the 1-360 range', async () => {
      await setUpPin('123456', 30);
      await setSessionMinutes(9999);
      expect((await getLockState()).sessionMinutes).toBe(360);
    });
  });

  describe('changePin', () => {
    it('re-encrypts every secret so the old PIN stops working and the new one recovers the original values', async () => {
      await setUpPin('111111', 30);
      const passwordA = await encryptSecret('secret-a');
      const passwordB = await encryptSecret('secret-b');

      const result = await changePin('111111', '222222', [passwordA, passwordB]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.reencrypted).toHaveLength(2);

      // The new PIN unlocks and decrypts the re-encrypted blobs back to the originals.
      await lockAccounts();
      const unlocked = await unlockWithPin('222222');
      expect(unlocked.ok).toBe(true);
      expect(await decryptSecret(result.value.reencrypted[0]!)).toBe('secret-a');
      expect(await decryptSecret(result.value.reencrypted[1]!)).toBe('secret-b');

      // The old PIN no longer works.
      await lockAccounts();
      const oldPinResult = await unlockWithPin('111111');
      expect(oldPinResult).toEqual({ ok: false, error: 'Incorrect PIN.' });
    });

    it('rejects an incorrect current PIN and re-encrypts nothing', async () => {
      await setUpPin('111111', 30);
      const secret = await encryptSecret('secret-a');
      const result = await changePin('000000', '222222', [secret]);
      expect(result).toEqual({ ok: false, error: 'Incorrect PIN.' });
      // Original PIN still works — nothing was changed.
      await lockAccounts();
      expect((await unlockWithPin('111111')).ok).toBe(true);
    });
  });

  describe('decryptSecretsWithPin', () => {
    it('decrypts every secret when the PIN is correct', async () => {
      await setUpPin('123456', 30);
      const a = await encryptSecret('secret-a');
      const b = await encryptSecret('secret-b');
      const result = await decryptSecretsWithPin('123456', [a, b]);
      expect(result).toEqual({ ok: true, value: ['secret-a', 'secret-b'] });
    });

    it('rejects an incorrect PIN', async () => {
      await setUpPin('123456', 30);
      const secret = await encryptSecret('secret-a');
      const result = await decryptSecretsWithPin('000000', [secret]);
      expect(result).toEqual({ ok: false, error: 'Incorrect PIN.' });
    });

    it('errors clearly when no PIN has ever been set up', async () => {
      const result = await decryptSecretsWithPin('123456', []);
      expect(result).toEqual({ ok: false, error: 'No PIN has been set up yet.' });
    });

    it('works regardless of the current lock state, and never changes it', async () => {
      await setUpPin('123456', 30);
      const secret = await encryptSecret('secret-a');
      await lockAccounts();

      expect((await getLockState()).isUnlocked).toBe(false);
      const result = await decryptSecretsWithPin('123456', [secret]);
      expect(result).toEqual({ ok: true, value: ['secret-a'] });
      // Still locked afterward — export is a one-off, not an unlock.
      expect((await getLockState()).isUnlocked).toBe(false);
    });
  });
});
