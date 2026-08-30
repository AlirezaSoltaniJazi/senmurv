import { useState } from 'react';
import type { ReactElement } from 'react';
import type { Account, AccountDraft, AccountLocator } from '@/shared/types';
import { LocatorKindToggle } from '../LocatorKindToggle';

interface Props {
  initial: Account;
  /** True when creating a brand-new account, so the password placeholder
   *  doesn't claim there's an existing one to "keep". */
  isNew: boolean;
  onSave: (draft: AccountDraft) => void;
  onCancel: () => void;
}

/** Create/edit one saved account. Mirrors ScriptsTab's list-replaced-by-editor
 *  pattern rather than a modal. The password field renders only when "use
 *  default password" is unchecked, per the spec: not even shown otherwise. */
export function AccountEditor({ initial, isNew, onSave, onCancel }: Props): ReactElement {
  const [name, setName] = useState(initial.name);
  const [address, setAddress] = useState(initial.address);
  const [username, setUsername] = useState(initial.username);
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
      <input
        className="name-input"
        placeholder="Address, e.g. sub.x.com"
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
          onChange={(e) => setUseDefaultPassword(e.target.checked)}
        />
        Use default password
      </label>
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

      <p className="hint">Username field locator</p>
      <div className="step-target">
        <LocatorKindToggle
          value={usernameField.kind}
          onChange={(kind) => setUsernameField({ ...usernameField, kind })}
        />
        <input
          className="name-input"
          placeholder="CSS selector or XPath"
          aria-label="Username field locator"
          value={usernameField.query}
          onChange={(e) => setUsernameField({ ...usernameField, query: e.target.value })}
        />
      </div>

      <p className="hint">Password field locator</p>
      <div className="step-target">
        <LocatorKindToggle
          value={passwordField.kind}
          onChange={(kind) => setPasswordField({ ...passwordField, kind })}
        />
        <input
          className="name-input"
          placeholder="CSS selector or XPath"
          aria-label="Password field locator"
          value={passwordField.query}
          onChange={(e) => setPasswordField({ ...passwordField, query: e.target.value })}
        />
      </div>

      <p className="hint">Login button locator</p>
      <div className="step-target">
        <LocatorKindToggle
          value={loginButton.kind}
          onChange={(kind) => setLoginButton({ ...loginButton, kind })}
        />
        <input
          className="name-input"
          placeholder="CSS selector or XPath"
          aria-label="Login button locator"
          value={loginButton.query}
          onChange={(e) => setLoginButton({ ...loginButton, query: e.target.value })}
        />
      </div>

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
