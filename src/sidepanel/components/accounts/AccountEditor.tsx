import { useState } from 'react';
import type { ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { sendRuntimeMessage } from '@/shared/messages';
import type { Account, AccountDraft, AccountLocator, Result } from '@/shared/types';
import { AutocompleteInput } from '../AutocompleteInput';
import { LocatorKindToggle } from '../LocatorKindToggle';

interface Props {
  initial: Account;
  /** True when creating a brand-new account, so the password placeholder
   *  doesn't claim there's an existing one to "keep". */
  isNew: boolean;
  /** Whether a shared default password currently exists — the "use default
   *  password" checkbox can't be turned on until one does. */
  isDefaultPasswordSet: boolean;
  /** Existing group names, offered as autocomplete suggestions. */
  existingGroups: string[];
  onSave: (draft: AccountDraft) => void;
  onCancel: () => void;
}

interface LocatorFieldProps {
  label: string;
  ariaLabel: string;
  value: AccountLocator;
  onChange: (locator: AccountLocator) => void;
}

/** One locator row: kind toggle + query input, plus a "Validate" button that
 *  reuses the Locator tab's match-count check (TEST_LOCATOR) against the
 *  active page, so a bad locator surfaces before Login ever tries it. */
function LocatorField({ label, ariaLabel, value, onChange }: LocatorFieldProps): ReactElement {
  const [result, setResult] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function validate(): Promise<void> {
    if (value.query.trim() === '') return;
    setChecking(true);
    const res = await sendRuntimeMessage<Result<{ count: number }>>({
      type: MESSAGE_TYPES.TEST_LOCATOR,
      payload: { query: value.query, kind: value.kind },
    });
    setChecking(false);
    if (!res.ok) {
      setResult(res.error);
      return;
    }
    setResult(
      res.value.count === 0
        ? 'No elements match.'
        : res.value.count === 1
          ? '1 element — unique ✓'
          : `${res.value.count} elements match — not unique`
    );
  }

  return (
    <div className="locator-field">
      <p className="hint">{label}</p>
      <div className="step-target">
        <LocatorKindToggle value={value.kind} onChange={(kind) => onChange({ ...value, kind })} />
        <input
          className="name-input"
          placeholder="CSS selector or XPath"
          aria-label={ariaLabel}
          value={value.query}
          onChange={(e) => onChange({ ...value, query: e.target.value })}
        />
        <button
          type="button"
          disabled={checking || value.query.trim() === ''}
          onClick={() => void validate()}
        >
          {checking ? 'Validating…' : 'Validate'}
        </button>
      </div>
      {result && <p className="hint locator-field-result">{result}</p>}
    </div>
  );
}

/** Create/edit one saved account. Mirrors ScriptsTab's list-replaced-by-editor
 *  pattern rather than a modal. The password field renders only when "use
 *  default password" is unchecked, per the spec: not even shown otherwise. */
export function AccountEditor({
  initial,
  isNew,
  isDefaultPasswordSet,
  existingGroups,
  onSave,
  onCancel,
}: Props): ReactElement {
  const [name, setName] = useState(initial.name);
  const [address, setAddress] = useState(initial.address);
  const [username, setUsername] = useState(initial.username);
  const [group, setGroup] = useState(initial.group ?? '');
  const [useDefaultPassword, setUseDefaultPassword] = useState(initial.useDefaultPassword);
  // Blank means "leave the existing password unchanged" on edit — the editor
  // never receives the old plaintext to prefill.
  const [password, setPassword] = useState('');
  const [usernameField, setUsernameField] = useState<AccountLocator>(initial.usernameField);
  const [passwordField, setPasswordField] = useState<AccountLocator>(initial.passwordField);
  const [loginButton, setLoginButton] = useState<AccountLocator>(initial.loginButton);

  function save(): void {
    const draft: AccountDraft = {
      id: initial.id,
      name: name.trim(),
      address: address.trim(),
      username: username.trim(),
      useDefaultPassword,
      usernameField,
      passwordField,
      loginButton,
    };
    if (!useDefaultPassword && password.trim() !== '') draft.newPassword = password;
    if (group.trim() !== '') draft.group = group.trim();
    onSave(draft);
  }

  return (
    <div className="account-editor">
      <input
        className="name-input"
        placeholder="Name, e.g. My Site"
        aria-label="Account name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <AutocompleteInput
        className="name-input"
        placeholder="Group (optional), e.g. Group A"
        ariaLabel="Group"
        value={group}
        onChange={setGroup}
        options={existingGroups}
      />
      <input
        className="name-input"
        placeholder="Address, e.g. app.example.com/login"
        aria-label="Address"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
      />
      <input
        className="name-input"
        placeholder="Account / email"
        aria-label="Account or email"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />

      <label className="checkbox-inline">
        <input
          type="checkbox"
          checked={useDefaultPassword}
          disabled={!isDefaultPasswordSet && !useDefaultPassword}
          onChange={(e) => setUseDefaultPassword(e.target.checked)}
        />
        Use default password
      </label>
      {!isDefaultPasswordSet && !useDefaultPassword && (
        <p className="hint">Set a default password below to enable this.</p>
      )}
      {!useDefaultPassword && (
        <input
          className="name-input"
          type="password"
          placeholder={isNew ? 'Password' : 'Leave blank to keep the current password'}
          aria-label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      )}

      <LocatorField
        label="Username field locator"
        ariaLabel="Username field locator"
        value={usernameField}
        onChange={setUsernameField}
      />
      <LocatorField
        label="Password field locator"
        ariaLabel="Password field locator"
        value={passwordField}
        onChange={setPasswordField}
      />
      <LocatorField
        label="Login button locator"
        ariaLabel="Login button locator"
        value={loginButton}
        onChange={setLoginButton}
      />

      <div className="row">
        <button type="button" className="primary" onClick={save}>
          Save account
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
