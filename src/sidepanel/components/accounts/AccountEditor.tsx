import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { groupAccounts } from '@/shared/accounts';
import {
  ACCOUNT_STEP_DELAY_SECONDS_MAX,
  ACCOUNT_STEP_DELAY_SECONDS_MIN,
  MESSAGE_TYPES,
} from '@/shared/constants';
import { sendRuntimeMessage } from '@/shared/messages';
import type {
  Account,
  AccountDraft,
  AccountLocator,
  AccountLocatorSeed,
  AccountLoginStep,
  AccountStepDelay,
  Result,
} from '@/shared/types';
import { newId } from '@/utils/id';
import { AutocompleteInput } from '../AutocompleteInput';
import { LocatorKindToggle } from '../LocatorKindToggle';

const STEP_DELAY_TARGETS: { value: AccountLoginStep; label: string }[] = [
  { value: 'username', label: 'Username field' },
  { value: 'password', label: 'Password field' },
  { value: 'loginButton', label: 'Login button' },
  { value: 'otp', label: 'OTP field' },
  { value: 'confirmOtpButton', label: 'Confirm OTP button' },
];

interface Props {
  initial: Account;
  /** True when creating a brand-new account, so the password placeholder
   *  doesn't claim there's an existing one to "keep". */
  isNew: boolean;
  /** Whether a shared default password currently exists — the "use default
   *  password" checkbox can't be turned on until one does. */
  isDefaultPasswordSet: boolean;
  /** Same gate as `isDefaultPasswordSet`, for the "use default OTP code" checkbox. */
  isDefaultOtpSet: boolean;
  /** Existing group names, offered as autocomplete suggestions. */
  existingGroups: string[];
  /** Told whenever "Apply to group" changes other accounts' stored data, so
   *  the tab's own account list (used elsewhere — the main list, existing
   *  group names) stays in sync without a full reload. */
  onGroupAccountsChanged: (accounts: Account[]) => void;
  /** Seconds an "Apply to group(s)" result banner stays visible. */
  applyResultDisplaySeconds: number;
  onSave: (draft: AccountDraft) => void;
  onCancel: () => void;
}

interface LocatorFieldProps {
  label: string;
  ariaLabel: string;
  value: AccountLocator;
  onChange: (locator: AccountLocator) => void;
  /** Which field this is, for the "Apply to group(s)" seed. */
  field: AccountLocatorSeed['field'];
  /** The groups currently checked in the editor's shared "Apply to" picker —
   *  every one of the three locator fields sends to the same set. */
  groups: string[];
  onGroupAccountsChanged: (accounts: Account[]) => void;
  /** Seconds the "Apply to group(s)" result banner stays visible. */
  applyResultDisplaySeconds: number;
}

/** One locator row: kind toggle + query input, a "Validate" button that
 *  reuses the Locator tab's match-count check (TEST_LOCATOR) against the
 *  active page (so a bad locator surfaces before Login ever tries it), and —
 *  when at least one group is checked in the editor's shared picker — an
 *  "Apply to N group(s)" button that pushes this exact field straight onto
 *  every account in every checked group (e.g. the same login form's
 *  locators, reused across several environment-specific groups). */
function LocatorField({
  label,
  ariaLabel,
  value,
  onChange,
  field,
  groups,
  onGroupAccountsChanged,
  applyResultDisplaySeconds,
}: LocatorFieldProps): ReactElement {
  const [result, setResult] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  // Clears the "Apply to group(s)" outcome after applyResultDisplaySeconds, so
  // it doesn't linger indefinitely once the user has moved on.
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resultTimerRef.current !== null) clearTimeout(resultTimerRef.current);
    };
  }, []);

  function clearResultTimer(): void {
    if (resultTimerRef.current !== null) {
      clearTimeout(resultTimerRef.current);
      resultTimerRef.current = null;
    }
  }

  async function validate(): Promise<void> {
    if (value.query.trim() === '') return;
    clearResultTimer();
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

  function clearValue(): void {
    setResult(null);
    onChange({ ...value, query: '' });
  }

  async function applyToGroups(): Promise<void> {
    if (groups.length === 0) return;
    clearResultTimer();
    setApplying(true);
    const res = await sendRuntimeMessage<Result<Account[]>>({
      type: MESSAGE_TYPES.APPLY_LOCATOR_TO_GROUPS,
      payload: { groups, seed: { field, kind: value.kind, query: value.query } },
    });
    setApplying(false);
    const displayMs = applyResultDisplaySeconds * 1000;
    if (!res.ok) {
      setResult(res.error);
      resultTimerRef.current = setTimeout(() => setResult(null), displayMs);
      return;
    }
    onGroupAccountsChanged(res.value);
    const targets = new Set(groups);
    const count = groupAccounts(res.value)
      .filter((g) => targets.has(g.name))
      .reduce((sum, g) => sum + g.accounts.length, 0);
    setResult(`Applied to ${count} account(s) across ${groups.length} group(s).`);
    resultTimerRef.current = setTimeout(() => setResult(null), displayMs);
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
        <button type="button" disabled={value.query === ''} onClick={clearValue}>
          Clear
        </button>
        <button
          type="button"
          disabled={applying || groups.length === 0}
          title={
            groups.length > 0
              ? `Apply this locator (including a cleared one) to every account in: ${groups.join(', ')}`
              : 'Check at least one group above'
          }
          onClick={() => void applyToGroups()}
        >
          {applying
            ? 'Applying…'
            : groups.length > 0
              ? `Apply to ${groups.length} group(s)`
              : 'Apply to group(s)'}
        </button>
      </div>
      {result && <p className="hint locator-field-result">{result}</p>}
    </div>
  );
}

interface StepDelayRowProps {
  delay: AccountStepDelay;
  onChange: (delay: AccountStepDelay) => void;
  onRemove: () => void;
}

/** One "wait N seconds before/after this step" row — a pause the one-click
 *  login fill sequence inserts at a specific point, in addition to the
 *  Settings-level "Login pre-fill delay" (a single delay before the whole
 *  sequence starts, set once for every account). */
function StepDelayRow({ delay, onChange, onRemove }: StepDelayRowProps): ReactElement {
  return (
    <div className="step-target">
      <select
        aria-label="Delay position"
        value={delay.position}
        onChange={(e) =>
          onChange({ ...delay, position: e.target.value as AccountStepDelay['position'] })
        }
      >
        <option value="before">Before</option>
        <option value="after">After</option>
      </select>
      <select
        aria-label="Delay step"
        value={delay.step}
        onChange={(e) => onChange({ ...delay, step: e.target.value as AccountLoginStep })}
      >
        {STEP_DELAY_TARGETS.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <input
        className="name-input"
        type="number"
        min={ACCOUNT_STEP_DELAY_SECONDS_MIN}
        max={ACCOUNT_STEP_DELAY_SECONDS_MAX}
        step={0.1}
        aria-label="Delay seconds"
        value={delay.seconds}
        onChange={(e) => onChange({ ...delay, seconds: Number(e.target.value) })}
      />
      <span className="hint">seconds</span>
      <button type="button" className="danger" onClick={onRemove}>
        Remove
      </button>
    </div>
  );
}

/** Create/edit one saved account. Mirrors ScriptsTab's list-replaced-by-editor
 *  pattern rather than a modal. The password field renders only when "use
 *  default password" is unchecked, per the spec: not even shown otherwise. */
const BLANK_LOCATOR: AccountLocator = { kind: 'css', query: '' };

export function AccountEditor({
  initial,
  isNew,
  isDefaultPasswordSet,
  isDefaultOtpSet,
  existingGroups,
  onGroupAccountsChanged,
  applyResultDisplaySeconds,
  onSave,
  onCancel,
}: Props): ReactElement {
  const [name, setName] = useState(initial.name);
  const [address, setAddress] = useState(initial.address);
  const [username, setUsername] = useState(initial.username);
  const [group, setGroup] = useState(initial.group ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [useDefaultPassword, setUseDefaultPassword] = useState(initial.useDefaultPassword);
  // Blank means "leave the existing password unchanged" on edit — the editor
  // never receives the old plaintext to prefill.
  const [password, setPassword] = useState('');
  const [usernameField, setUsernameField] = useState<AccountLocator>(initial.usernameField);
  const [passwordField, setPasswordField] = useState<AccountLocator>(initial.passwordField);
  const [loginButton, setLoginButton] = useState<AccountLocator>(initial.loginButton);
  // OTP is fully optional — every field below may stay blank.
  const [useDefaultOtp, setUseDefaultOtp] = useState(initial.useDefaultOtp ?? false);
  const [otp, setOtp] = useState('');
  const [otpField, setOtpField] = useState<AccountLocator>(initial.otpField ?? BLANK_LOCATOR);
  const [confirmOtpButton, setConfirmOtpButton] = useState<AccountLocator>(
    initial.confirmOtpButton ?? BLANK_LOCATOR
  );
  // Per-step pauses in the one-click login fill sequence — in addition to
  // the Settings-level "Login pre-fill delay" (a single delay before the
  // whole sequence starts, set once for every account).
  const [delays, setDelays] = useState<AccountStepDelay[]>(initial.stepDelays ?? []);
  // Which groups "Apply to group(s)" targets, shared by all three locator
  // fields — defaults to just this account's own group, if it has one.
  const [applyTargets, setApplyTargets] = useState<Set<string>>(() => {
    const own = initial.group?.trim();
    return own ? new Set([own]) : new Set();
  });

  // Every group "Apply to group(s)" could target: every other group already
  // in use, plus whatever's currently typed in the Group field above (so a
  // brand-new group being created right now is selectable too).
  const groupChoices = useMemo(() => {
    const choices = new Set(existingGroups);
    const own = group.trim();
    if (own) choices.add(own);
    return [...choices].sort((a, b) => a.localeCompare(b));
  }, [existingGroups, group]);

  function toggleApplyTarget(name: string): void {
    setApplyTargets((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function addDelay(): void {
    setDelays((prev) => [
      ...prev,
      { id: newId('delay_'), step: 'username', position: 'before', seconds: 1 },
    ]);
  }
  function updateDelay(id: string, next: AccountStepDelay): void {
    setDelays((prev) => prev.map((d) => (d.id === id ? next : d)));
  }
  function removeDelay(id: string): void {
    setDelays((prev) => prev.filter((d) => d.id !== id));
  }

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
      useDefaultOtp,
      otpField,
      confirmOtpButton,
      stepDelays: delays,
    };
    if (!useDefaultPassword && password.trim() !== '') draft.newPassword = password;
    if (!useDefaultOtp && otp.trim() !== '') draft.newOtp = otp;
    if (group.trim() !== '') draft.group = group.trim();
    if (description.trim() !== '') draft.description = description.trim();
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
      {groupChoices.length > 0 && (
        <div className="locator-field">
          <p className="hint">Apply locator changes below to:</p>
          <div className="chips">
            {groupChoices.map((name) => (
              <label key={name} className="checkbox-inline">
                <input
                  type="checkbox"
                  checked={applyTargets.has(name)}
                  onChange={() => toggleApplyTarget(name)}
                />
                {name}
              </label>
            ))}
          </div>
        </div>
      )}
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
      <textarea
        className="description-input"
        placeholder="Description (optional) — shown as a tooltip on hover"
        aria-label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
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
        field="username"
        groups={[...applyTargets]}
        onGroupAccountsChanged={onGroupAccountsChanged}
        applyResultDisplaySeconds={applyResultDisplaySeconds}
      />
      <LocatorField
        label="Password field locator"
        ariaLabel="Password field locator"
        value={passwordField}
        onChange={setPasswordField}
        field="password"
        groups={[...applyTargets]}
        onGroupAccountsChanged={onGroupAccountsChanged}
        applyResultDisplaySeconds={applyResultDisplaySeconds}
      />
      <LocatorField
        label="Login button locator"
        ariaLabel="Login button locator"
        value={loginButton}
        onChange={setLoginButton}
        field="loginButton"
        groups={[...applyTargets]}
        onGroupAccountsChanged={onGroupAccountsChanged}
        applyResultDisplaySeconds={applyResultDisplaySeconds}
      />

      <p className="hint">
        OTP (optional) — leave every field below blank if this login has no 2FA step.
      </p>

      <label className="checkbox-inline">
        <input
          type="checkbox"
          checked={useDefaultOtp}
          disabled={!isDefaultOtpSet && !useDefaultOtp}
          onChange={(e) => setUseDefaultOtp(e.target.checked)}
        />
        Use default OTP code
      </label>
      {!isDefaultOtpSet && !useDefaultOtp && (
        <p className="hint">Set a default OTP code below to enable this.</p>
      )}
      {!useDefaultOtp && (
        <input
          className="name-input"
          type="password"
          placeholder={isNew ? 'OTP code' : 'Leave blank to keep the current OTP code'}
          aria-label="OTP code"
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
        />
      )}

      <LocatorField
        label="OTP field locator"
        ariaLabel="OTP field locator"
        value={otpField}
        onChange={setOtpField}
        field="otp"
        groups={[...applyTargets]}
        onGroupAccountsChanged={onGroupAccountsChanged}
        applyResultDisplaySeconds={applyResultDisplaySeconds}
      />
      <LocatorField
        label="Confirm OTP button locator"
        ariaLabel="Confirm OTP button locator"
        value={confirmOtpButton}
        onChange={setConfirmOtpButton}
        field="confirmOtpButton"
        groups={[...applyTargets]}
        onGroupAccountsChanged={onGroupAccountsChanged}
        applyResultDisplaySeconds={applyResultDisplaySeconds}
      />

      <p className="hint">
        Delays — pause the one-click login at a specific step (e.g. wait 1.5s after the Login button
        click before the OTP field is expected to exist).
      </p>
      {delays.map((d) => (
        <StepDelayRow
          key={d.id}
          delay={d}
          onChange={(next) => updateDelay(d.id, next)}
          onRemove={() => removeDelay(d.id)}
        />
      ))}
      <div className="row">
        <button type="button" onClick={addDelay}>
          + Add delay
        </button>
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
