import { useState } from 'react';
import type { ReactElement } from 'react';
import { parseValues, validateProfile, valuesToText, wrapValue } from '@/shared/profiles';
import type { ValueProfile } from '@/shared/types';

interface Props {
  initial: ValueProfile;
  onSave: (profile: ValueProfile) => void;
  onCancel: () => void;
}

/**
 * Create/edit one value profile. Prefix/suffix stay hidden behind "+ Add …"
 * (progressive disclosure) and show a live preview of what will actually be
 * written — the wrapping is otherwise invisible until you use it.
 */
export function ProfileEditor({ initial, onSave, onCancel }: Props): ReactElement {
  const [draft, setDraft] = useState<ValueProfile>(initial);
  const [valuesText, setValuesText] = useState(valuesToText(initial.values));
  const [showPrefix, setShowPrefix] = useState(typeof initial.prefix === 'string');
  const [showSuffix, setShowSuffix] = useState(typeof initial.suffix === 'string');
  const [error, setError] = useState<string | null>(null);

  const isCookie = draft.target === 'cookie';
  const values = parseValues(valuesText);
  const sample = values[0] ?? '<value>';
  const preview = wrapValue(
    {
      ...(showPrefix ? { prefix: draft.prefix ?? '' } : {}),
      ...(showSuffix ? { suffix: draft.suffix ?? '' } : {}),
    },
    sample
  );

  function save(): void {
    const next: ValueProfile = { ...draft, values };
    if (showPrefix) next.prefix = draft.prefix ?? '';
    else delete next.prefix;
    if (showSuffix) next.suffix = draft.suffix ?? '';
    else delete next.suffix;
    const checked = validateProfile(next);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    onSave(checked.value);
  }

  return (
    <div className="profile-editor">
      <input
        className="name-input"
        placeholder="Profile name, e.g. Locale"
        aria-label="Profile name"
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
      />
      <div className="step-target">
        <input
          className="name-input"
          placeholder={isCookie ? 'Cookie name' : 'Storage key'}
          aria-label={isCookie ? 'Cookie name' : 'Storage key'}
          value={draft.key}
          onChange={(e) => setDraft({ ...draft, key: e.target.value })}
        />
        {isCookie && (
          <input
            className="name-input"
            placeholder="Path (default /)"
            aria-label="Cookie path"
            value={draft.path ?? ''}
            onChange={(e) => setDraft({ ...draft, path: e.target.value })}
          />
        )}
      </div>
      <textarea
        className="code-input"
        rows={4}
        spellCheck={false}
        aria-label="Candidate values, one per line"
        placeholder={'One value per line, e.g.\nen_GB\nde_DE\nfr_FR'}
        value={valuesText}
        onChange={(e) => setValuesText(e.target.value)}
      />

      <div className="row">
        {!showPrefix && (
          <button type="button" onClick={() => setShowPrefix(true)}>
            + Add prefix
          </button>
        )}
        {!showSuffix && (
          <button type="button" onClick={() => setShowSuffix(true)}>
            + Add suffix
          </button>
        )}
        {!showPrefix && !showSuffix && (
          <span className="hint">Wrap each value before it is written — e.g. JSON quoting.</span>
        )}
      </div>
      {(showPrefix || showSuffix) && (
        <div className="step-target">
          {showPrefix && (
            <input
              className="name-input"
              placeholder="Prefix"
              aria-label="Value prefix"
              value={draft.prefix ?? ''}
              onChange={(e) => setDraft({ ...draft, prefix: e.target.value })}
            />
          )}
          {showSuffix && (
            <input
              className="name-input"
              placeholder="Suffix"
              aria-label="Value suffix"
              value={draft.suffix ?? ''}
              onChange={(e) => setDraft({ ...draft, suffix: e.target.value })}
            />
          )}
          <button
            type="button"
            title="Remove wrapping"
            aria-label="Remove wrapping"
            onClick={() => {
              setShowPrefix(false);
              setShowSuffix(false);
            }}
          >
            ✕
          </button>
        </div>
      )}
      {(showPrefix || showSuffix) && (
        <p className="hint dim">
          Written as <code>{preview}</code>
        </p>
      )}

      <div className="row">
        <button type="button" className="primary" onClick={save}>
          Save profile
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
          />
          Enabled
        </label>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
