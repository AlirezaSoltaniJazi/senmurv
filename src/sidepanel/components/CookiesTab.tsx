import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { describeExpiry, matchesQuery, SAME_SITE_OPTIONS } from '@/shared/cookie-url';
import { sendRuntimeMessage } from '@/shared/messages';
import { profileFromEntry } from '@/shared/profiles';
import type { CookieEdit, CookieRow, CookieSameSite, Result, ValueProfile } from '@/shared/types';
import { reloadActiveTab } from '@/sidepanel/tab-reload';
import { CopyButton } from './CopyButton';
import { ProfileList } from './profiles/ProfileList';

interface Props {
  /** Reload the page after any successful cookie change (persisted preference). */
  autoReload: boolean;
  onAutoReloadChange: (next: boolean) => void;
}

/** Current epoch ms — wrapped so clock reads stay outside render-purity analysis. */
function nowMs(): number {
  return Date.now();
}

/** This tab only ever lists cookie profiles. */
const COOKIE_TARGETS = ['cookie'] as const;

/** A draft in the editor: the writable fields plus whether the name is editable. */
interface Draft extends CookieEdit {
  isNew: boolean;
  /** `expirationDate` as a datetime-local string, or '' for a session cookie. */
  expiresAt: string;
}

function toLocalInput(seconds: number | null): string {
  if (seconds === null) return '';
  const d = new Date(seconds * 1000);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function draftFrom(row: CookieRow): Draft {
  return {
    isNew: false,
    name: row.name,
    value: row.value,
    path: row.path,
    secure: row.secure,
    httpOnly: row.httpOnly,
    sameSite: row.sameSite,
    expirationDate: row.expirationDate,
    expiresAt: toLocalInput(row.expirationDate),
  };
}

function emptyDraft(): Draft {
  return {
    isNew: true,
    name: '',
    value: '',
    path: '/',
    secure: false,
    httpOnly: false,
    sameSite: 'unspecified',
    expirationDate: null,
    expiresAt: '',
  };
}

export function CookiesTab({ autoReload, onAutoReloadChange }: Props): ReactElement {
  const [rows, setRows] = useState<CookieRow[]>([]);
  const [origin, setOrigin] = useState('');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [nonce, setNonce] = useState(0);
  // Handed to ProfileList when a row's "+ Profile" button is pressed.
  const [profileSeed, setProfileSeed] = useState<ValueProfile | null>(null);
  // The Profiles segment swaps the cookie list out for the switcher view.
  const [showProfiles, setShowProfiles] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    const res = await sendRuntimeMessage<Result<{ origin: string; rows: CookieRow[] }>>({
      type: MESSAGE_TYPES.LIST_COOKIES,
    });
    if (res.ok) {
      setRows(res.value.rows);
      setOrigin(res.value.origin);
      setError(null);
    } else {
      setRows([]);
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

  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  const shown = rows.filter((r) => matchesQuery(r, query));

  /**
   * Re-read the list, then (when enabled) reload the page so the site actually
   * picks the change up. The reload goes LAST so the panel is already showing
   * the new state before the tab navigates.
   */
  async function afterChange(changed: boolean): Promise<void> {
    await refresh();
    if (changed && autoReload) reloadActiveTab();
  }

  async function writeCookie(cookie: CookieEdit): Promise<string | null> {
    const res = await sendRuntimeMessage<Result<void>>({
      type: MESSAGE_TYPES.SET_COOKIE,
      payload: { cookie },
    });
    await afterChange(res.ok);
    return res.ok ? null : res.error;
  }

  async function saveDraft(): Promise<void> {
    if (!draft) return;
    const expirationDate =
      draft.expiresAt === '' ? null : Math.floor(new Date(draft.expiresAt).getTime() / 1000);
    const failure = await writeCookie({
      name: draft.name,
      value: draft.value,
      path: draft.path,
      secure: draft.secure,
      httpOnly: draft.httpOnly,
      sameSite: draft.sameSite,
      expirationDate,
    });
    if (failure !== null) {
      setError(failure);
      return;
    }
    setDraft(null);
    setStatus(`Saved “${draft.name}”.`);
  }

  async function remove(row: CookieRow): Promise<void> {
    const res = await sendRuntimeMessage<Result<void>>({
      type: MESSAGE_TYPES.REMOVE_COOKIE,
      payload: { name: row.name, path: row.path },
    });
    if (!res.ok) setError(res.error);
    else setStatus(`Deleted “${row.name}”.`);
    await afterChange(res.ok);
  }

  async function clearAll(): Promise<void> {
    const res = await sendRuntimeMessage<Result<number>>({ type: MESSAGE_TYPES.CLEAR_COOKIES });
    setArmed(false);
    if (!res.ok) setError(res.error);
    else setStatus(`Deleted ${res.value} cookie(s).`);
    await afterChange(res.ok);
  }

  /** Profiles drive a cookie by name (path defaults to the profile's own path). */
  const liveValue = (profile: ValueProfile): string | null =>
    rows.find((r) => r.name === profile.key)?.value ?? null;

  const now = nowMs();

  return (
    <div className="tab">
      <div className="row">
        <div className="chips">
          <button
            type="button"
            className={showProfiles ? 'chip' : 'chip active'}
            onClick={() => setShowProfiles(false)}
          >
            Cookies
          </button>
          <button
            type="button"
            className={showProfiles ? 'chip active' : 'chip'}
            onClick={() => {
              setShowProfiles(true);
              setDraft(null);
            }}
          >
            Profiles
          </button>
        </div>
        <button type="button" onClick={() => void refresh()} title="Re-read cookies">
          ↻ Refresh
        </button>
      </div>
      {origin && <p className="hint dim">{origin}</p>}

      {!showProfiles && (
        <div className="row">
          <input
            className="name-input"
            placeholder="Search names and values"
            aria-label="Search cookies"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="primary" onClick={() => setDraft(emptyDraft())}>
            + Add cookie
          </button>
          <button
            type="button"
            className={armed ? 'danger' : ''}
            disabled={rows.length === 0}
            onClick={() => (armed ? void clearAll() : setArmed(true))}
          >
            {armed ? 'Really delete all — click again' : 'Delete all'}
          </button>
        </div>
      )}

      <div className="row">
        <label
          className="checkbox-inline"
          title="Reload the page after every cookie change, so the site picks up the new value"
        >
          <input
            type="checkbox"
            checked={autoReload}
            onChange={(e) => onAutoReloadChange(e.target.checked)}
          />
          Auto-reload page after change
        </label>
        <button type="button" onClick={reloadActiveTab} title="Reload the page now">
          ↻ Reload page
        </button>
      </div>

      {!showProfiles && draft && (
        <div className="profile-editor">
          <div className="step-target">
            <input
              className="name-input"
              placeholder="Cookie name"
              aria-label="Cookie name"
              value={draft.name}
              disabled={!draft.isNew}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <input
              className="name-input"
              placeholder="Path"
              aria-label="Cookie path"
              value={draft.path}
              onChange={(e) => setDraft({ ...draft, path: e.target.value })}
            />
          </div>
          <textarea
            className="code-input"
            rows={3}
            spellCheck={false}
            aria-label="Cookie value"
            placeholder="Value"
            value={draft.value}
            onChange={(e) => setDraft({ ...draft, value: e.target.value })}
          />
          <div className="step-target">
            <label className="field-label" htmlFor="cookie-samesite">
              SameSite
            </label>
            <select
              id="cookie-samesite"
              value={draft.sameSite}
              onChange={(e) => setDraft({ ...draft, sameSite: e.target.value as CookieSameSite })}
            >
              {SAME_SITE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={draft.secure}
                onChange={(e) => setDraft({ ...draft, secure: e.target.checked })}
              />
              Secure
            </label>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={draft.httpOnly}
                onChange={(e) => setDraft({ ...draft, httpOnly: e.target.checked })}
              />
              HttpOnly
            </label>
          </div>
          <div className="step-target">
            <label className="field-label" htmlFor="cookie-expires">
              Expires
            </label>
            <input
              id="cookie-expires"
              className="name-input"
              type="datetime-local"
              value={draft.expiresAt}
              onChange={(e) => setDraft({ ...draft, expiresAt: e.target.value })}
            />
            <button
              type="button"
              title="Make this a session cookie (cleared when the browser closes)"
              onClick={() => setDraft({ ...draft, expiresAt: '' })}
            >
              Session
            </button>
          </div>
          <div className="row">
            <button type="button" className="primary" onClick={() => void saveDraft()}>
              Save
            </button>
            <button type="button" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {!showProfiles && !error && shown.length === 0 && (
        <p className="hint">
          {rows.length === 0 ? 'No cookies for this site.' : 'No cookie matches that search.'}
        </p>
      )}

      {!showProfiles && (
        <ul className="kv-list">
          {shown.map((row) => (
            <li key={`${row.name}@${row.domain}${row.path}`} className="kv-row">
              <div className="kv-head">
                <code className="kv-key" title={`${row.domain}${row.path}`}>
                  {row.name}
                </code>
                <span className="cookie-flags">
                  {row.httpOnly && (
                    <span className="badge dim" title="Not readable by page JavaScript">
                      HttpOnly
                    </span>
                  )}
                  {row.secure && (
                    <span className="badge dim" title="Sent over https only">
                      Secure
                    </span>
                  )}
                  <span className="badge dim" title="Expiry">
                    {describeExpiry(row, now)}
                  </span>
                </span>
                <span className="kv-actions">
                  <CopyButton text={row.value} />
                  <button
                    type="button"
                    title="Create a switcher profile from this cookie (or add its value to the existing one)"
                    onClick={() => {
                      setProfileSeed(
                        profileFromEntry('cookie', row.name, row.value, nowMs(), row.path)
                      );
                      setShowProfiles(true); // jump to where the editor opens
                    }}
                  >
                    + Profile
                  </button>
                  <button type="button" onClick={() => setDraft(draftFrom(row))}>
                    Edit
                  </button>
                  <button type="button" className="danger" onClick={() => void remove(row)}>
                    Delete
                  </button>
                </span>
              </div>
              <code className="kv-value" title={row.value}>
                {row.value || '(empty)'}
              </code>
            </li>
          ))}
        </ul>
      )}

      {showProfiles && (
        <ProfileList
          targets={COOKIE_TARGETS}
          newTarget="cookie"
          valuesNonce={nonce}
          seed={profileSeed}
          onSeedConsumed={() => setProfileSeed(null)}
          currentValue={liveValue}
          onApply={(profile, value) =>
            writeCookie({
              name: profile.key,
              value,
              path: profile.path ?? '/',
              secure: false,
              httpOnly: false,
              sameSite: 'unspecified',
              expirationDate: null,
            })
          }
        />
      )}

      {status && <p className="status">{status}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
