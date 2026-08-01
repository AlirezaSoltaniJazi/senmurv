import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { sendRuntimeMessage } from '@/shared/messages';
import {
  activeValue,
  findProfileFor,
  newProfile,
  profilesFor,
  withCandidate,
  wrapValue,
} from '@/shared/profiles';
import type { ProfileTarget, Result, ValueProfile } from '@/shared/types';
import { ProfileEditor } from './ProfileEditor';

interface Props {
  /** Which store these profiles drive (this tab's area). */
  target: ProfileTarget;
  /** Current live value for a profile's key, or null when unset. */
  currentValue: (profile: ValueProfile) => string | null;
  /** Write a (already wrapped) value; resolves to an error string or null. */
  onApply: (profile: ValueProfile, value: string) => Promise<string | null>;
  /** Bumped by the tab whenever the underlying store changed, to re-render chips. */
  valuesNonce: number;
  /**
   * A profile handed over from a row's "+ Profile" button — opens the editor
   * pre-filled. When a profile already drives that key, its candidate list is
   * extended instead, so the same key never gets two profiles.
   */
  seed: ValueProfile | null;
  onSeedConsumed: () => void;
}

/** Current epoch ms — wrapped so clock reads stay outside render-purity analysis. */
function nowMs(): number {
  return Date.now();
}

/**
 * The saved value-switchers for one store: each profile shows its live value and
 * its candidate values as chips; clicking a chip writes it. Ported from
 * phantom-mock's cookie/storage profiles, rendered inline instead of in a
 * separate tab.
 */
export function ProfileList({
  target,
  currentValue,
  onApply,
  valuesNonce,
  seed,
  onSeedConsumed,
}: Props): ReactElement {
  const [profiles, setProfiles] = useState<ValueProfile[]>([]);
  const [editing, setEditing] = useState<ValueProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await sendRuntimeMessage<Result<ValueProfile[]>>({
        type: MESSAGE_TYPES.GET_PROFILES,
      });
      if (!cancelled && res.ok) setProfiles(res.value);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // One-shot seed from a row's "+ Profile" button: open the editor pre-filled,
  // extending the profile that already drives this key rather than duplicating it.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!seed) return;
    const existing = findProfileFor(profiles, target, seed.key);
    setEditing(existing ? withCandidate(existing, seed.values[0] ?? '') : seed);
    setOpen(true);
    setError(null);
    onSeedConsumed();
  }, [seed, profiles, target, onSeedConsumed]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const mine = profilesFor(profiles, target);

  async function save(profile: ValueProfile): Promise<void> {
    const res = await sendRuntimeMessage<Result<ValueProfile[]>>({
      type: MESSAGE_TYPES.SAVE_PROFILE,
      payload: { profile: { ...profile, updatedAt: nowMs() } },
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setProfiles(res.value);
    setEditing(null);
  }

  async function remove(profile: ValueProfile): Promise<void> {
    if (!window.confirm(`Delete the profile “${profile.name}”? Your data is not changed.`)) return;
    const res = await sendRuntimeMessage<Result<ValueProfile[]>>({
      type: MESSAGE_TYPES.DELETE_PROFILE,
      payload: { id: profile.id },
    });
    if (res.ok) setProfiles(res.value);
    else setError(res.error);
  }

  async function apply(profile: ValueProfile, raw: string): Promise<void> {
    setError(null);
    const failure = await onApply(profile, wrapValue(profile, raw));
    if (failure !== null) setError(failure);
  }

  return (
    <div className="profiles-panel">
      <div className="row">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          Profiles ({mine.length}) {open ? '▾' : '▸'}
        </button>
        {open && editing === null && (
          <button type="button" onClick={() => setEditing(newProfile(target, nowMs()))}>
            + New profile
          </button>
        )}
      </div>

      {open && (
        <>
          {editing !== null ? (
            <ProfileEditor
              key={editing.id}
              initial={editing}
              onSave={(p) => void save(p)}
              onCancel={() => setEditing(null)}
            />
          ) : mine.length === 0 ? (
            <p className="hint">
              A profile saves one key plus the values you switch between while testing (locales,
              feature flags, auth states) — then it is one click to apply each.
            </p>
          ) : (
            <ul className="profile-list">
              {mine.map((p) => {
                const current = currentValue(p);
                const live = activeValue(p, current);
                return (
                  <li key={p.id} className={p.enabled ? 'profile-row' : 'profile-row disabled'}>
                    <div className="profile-head">
                      <span className="profile-name">{p.name}</span>
                      <code className="profile-key">{p.key}</code>
                      <span className="profile-actions">
                        <button
                          type="button"
                          title={p.enabled ? 'Disable profile' : 'Enable profile'}
                          aria-label={p.enabled ? 'Disable profile' : 'Enable profile'}
                          aria-pressed={p.enabled}
                          className={p.enabled ? 'toggle-step on' : 'toggle-step'}
                          onClick={() => void save({ ...p, enabled: !p.enabled })}
                        >
                          ⏻
                        </button>
                        <button type="button" onClick={() => setEditing(p)}>
                          Edit
                        </button>
                        <button type="button" className="danger" onClick={() => void remove(p)}>
                          Delete
                        </button>
                      </span>
                    </div>
                    <div className="profile-current">
                      <span className="field-label">now</span>
                      <code>{current === null ? '(not set)' : current || '(empty)'}</code>
                    </div>
                    <div className="chips" data-nonce={valuesNonce}>
                      {p.values.map((v) => (
                        <button
                          key={v}
                          type="button"
                          className={live === v ? 'chip active' : 'chip'}
                          disabled={!p.enabled}
                          title={`Set ${p.key} = ${wrapValue(p, v)}`}
                          onClick={() => void apply(p, v)}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {error && <p className="error">{error}</p>}
        </>
      )}
    </div>
  );
}
