import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { sendRuntimeMessage } from '@/shared/messages';
import { profileFromEntry } from '@/shared/profiles';
import { formatJson } from '@/shared/tools/json-format';
import type {
  Result,
  StorageArea,
  StorageItem,
  ValueProfile,
  WebStorageSnapshot,
} from '@/shared/types';
import { CopyButton } from './CopyButton';
import { ProfileList } from './profiles/ProfileList';

const AREAS: { value: StorageArea; label: string }[] = [
  { value: 'local', label: 'localStorage' },
  { value: 'session', label: 'sessionStorage' },
];

/** Current epoch ms — wrapped so clock reads stay outside render-purity analysis. */
function nowMs(): number {
  return Date.now();
}

/** Draft state for the row being edited (or the new-key form). */
interface Draft {
  key: string;
  value: string;
  /** True for "+ Add key" — the key field is editable only when adding. */
  isNew: boolean;
}

export function StorageTab(): ReactElement {
  const [area, setArea] = useState<StorageArea>('local');
  const [snapshot, setSnapshot] = useState<WebStorageSnapshot | null>(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  // Bumped after every write so the profile chips re-read the live value.
  const [nonce, setNonce] = useState(0);
  // Handed to ProfileList when a row's "+ Profile" button is pressed.
  const [profileSeed, setProfileSeed] = useState<ValueProfile | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    const res = await sendRuntimeMessage<Result<WebStorageSnapshot>>({
      type: MESSAGE_TYPES.READ_WEB_STORAGE,
    });
    // Applied in a microtask (post-await), so this never runs synchronously
    // inside the mount effect below.
    if (res.ok) {
      setSnapshot(res.value);
      setError(null);
    } else {
      setSnapshot(null);
      setError(res.error);
    }
    setNonce((n) => n + 1);
  }, []);

  // Initial read. The async IIFE keeps every setState off the effect's
  // synchronous path (see react-hooks/set-state-in-effect).
  useEffect(() => {
    void (async () => {
      await refresh();
    })();
  }, [refresh]);

  // A destructive "Clear all" disarms itself after 3s, so a stray second click
  // later can't wipe the store (same pattern as the Site data tool).
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  const items: StorageItem[] = snapshot ? snapshot[area] : [];
  const q = query.trim().toLowerCase();
  const shown = q
    ? items.filter((i) => i.key.toLowerCase().includes(q) || i.value.toLowerCase().includes(q))
    : items;

  async function write(key: string, value: string): Promise<string | null> {
    const res = await sendRuntimeMessage<Result<void>>({
      type: MESSAGE_TYPES.WRITE_WEB_STORAGE,
      payload: { area, key, value },
    });
    await refresh();
    return res.ok ? null : res.error;
  }

  async function saveDraft(): Promise<void> {
    if (!draft) return;
    const key = draft.key.trim();
    if (key === '') {
      setError('Enter a key.');
      return;
    }
    const failure = await write(key, draft.value);
    if (failure !== null) {
      setError(failure);
      return;
    }
    setDraft(null);
    setStatus(`Saved “${key}”.`);
  }

  async function remove(key: string): Promise<void> {
    const res = await sendRuntimeMessage<Result<void>>({
      type: MESSAGE_TYPES.REMOVE_WEB_STORAGE,
      payload: { area, key },
    });
    if (!res.ok) setError(res.error);
    else setStatus(`Removed “${key}”.`);
    await refresh();
  }

  async function clearArea(): Promise<void> {
    const res = await sendRuntimeMessage<Result<void>>({
      type: MESSAGE_TYPES.CLEAR_WEB_STORAGE,
      payload: { area },
    });
    setArmed(false);
    if (!res.ok) setError(res.error);
    else setStatus(`Cleared ${AREAS.find((a) => a.value === area)?.label}.`);
    await refresh();
  }

  /** Pretty-print the draft value when it is JSON (values are often stringified JSON). */
  function prettify(): void {
    if (!draft) return;
    const res = formatJson(draft.value);
    if (res.ok) setDraft({ ...draft, value: res.value });
    else setError('That value is not valid JSON.');
  }

  const liveValue = (profile: ValueProfile): string | null =>
    items.find((i) => i.key === profile.key)?.value ?? null;

  return (
    <div className="tab">
      <div className="row">
        <div className="chips">
          {AREAS.map((a) => (
            <button
              key={a.value}
              type="button"
              className={area === a.value ? 'chip active' : 'chip'}
              onClick={() => {
                setArea(a.value);
                setDraft(null);
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void refresh()} title="Re-read from the page">
          ↻ Refresh
        </button>
      </div>

      {snapshot && <p className="hint dim">{snapshot.origin}</p>}

      <div className="row">
        <input
          className="name-input"
          placeholder="Search keys and values"
          aria-label="Search storage"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className="primary"
          onClick={() => setDraft({ key: '', value: '', isNew: true })}
        >
          + Add key
        </button>
        <button
          type="button"
          className={armed ? 'danger' : ''}
          disabled={items.length === 0}
          onClick={() => (armed ? void clearArea() : setArmed(true))}
        >
          {armed ? 'Really clear — click again' : 'Clear all'}
        </button>
      </div>

      {draft && (
        <div className="profile-editor">
          <input
            className="name-input"
            placeholder="Key"
            aria-label="Storage key"
            value={draft.key}
            disabled={!draft.isNew}
            onChange={(e) => setDraft({ ...draft, key: e.target.value })}
          />
          <textarea
            className="code-input"
            rows={5}
            spellCheck={false}
            aria-label="Storage value"
            placeholder="Value"
            value={draft.value}
            onChange={(e) => setDraft({ ...draft, value: e.target.value })}
          />
          <div className="row">
            <button type="button" className="primary" onClick={() => void saveDraft()}>
              Save
            </button>
            <button type="button" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button type="button" onClick={prettify} title="Pretty-print this value as JSON">
              Pretty JSON
            </button>
          </div>
        </div>
      )}

      {snapshot && shown.length === 0 && (
        <p className="hint">
          {items.length === 0
            ? `Nothing in ${AREAS.find((a) => a.value === area)?.label} for this site.`
            : 'No key or value matches that search.'}
        </p>
      )}

      <ul className="kv-list">
        {shown.map((item) => (
          <li key={item.key} className="kv-row">
            <div className="kv-head">
              <code className="kv-key" title={item.key}>
                {item.key}
              </code>
              <span className="kv-actions">
                <CopyButton text={item.value} />
                <button
                  type="button"
                  title="Create a switcher profile from this key (or add its value to the existing one)"
                  onClick={() =>
                    setProfileSeed(profileFromEntry(area, item.key, item.value, nowMs()))
                  }
                >
                  + Profile
                </button>
                <button
                  type="button"
                  onClick={() => setDraft({ key: item.key, value: item.value, isNew: false })}
                >
                  Edit
                </button>
                <button type="button" className="danger" onClick={() => void remove(item.key)}>
                  Delete
                </button>
              </span>
            </div>
            <code className="kv-value" title={item.value}>
              {item.value || '(empty)'}
            </code>
          </li>
        ))}
      </ul>

      <ProfileList
        target={area}
        valuesNonce={nonce}
        seed={profileSeed}
        onSeedConsumed={() => setProfileSeed(null)}
        currentValue={liveValue}
        onApply={(profile, value) => write(profile.key, value)}
      />

      {snapshot?.warnings.map((w) => (
        <p key={w} className="hint">
          {w}
        </p>
      ))}
      {status && <p className="status">{status}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
