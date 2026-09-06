import { resolveFirstMatch } from '@/shared/locators';
import type {
  AccountLocator,
  AccountLoginStep,
  AccountStepDelay,
  LocatorKind,
  Result,
} from '@/shared/types';

/**
 * The Accounts tab's one-shot login-fill action: resolve the username field,
 * password field, and login button via their saved locators, fill the first
 * two with the native-setter-plus-real-events technique (the same technique
 * `shared/workflow.ts`'s PREAMBLE uses for the Recorder/Flow exporter, written
 * here as real compiled TS instead of an injected code string), then click the
 * button. When the account has OTP configured, a second fill-and-click step
 * (OTP field, then confirm button) runs immediately after, waiting for the
 * OTP field to appear the same way the earlier fields do — the field usually
 * doesn't exist until after the login click transitions the page. Runs in
 * the content script's ISOLATED world — a plain login form needs no
 * MAIN-world access, so this does not touch the sanctioned `new Function`
 * runner reserved for the Execute JS Script tool.
 */

export interface AccountLoginFillInput {
  username: string;
  /** Decrypted moments earlier by the service worker; used once, never stored. */
  password: string;
  usernameField: AccountLocator;
  passwordField: AccountLocator;
  loginButton: AccountLocator;
  timeoutMs: number;
  /** Present only when the account has OTP configured. */
  otpField?: AccountLocator;
  otp?: string;
  confirmOtpButton?: AccountLocator;
  /** Per-step pauses in the fill sequence — e.g. a slow-rendering SPA needs
   *  a moment after the login button click before the OTP field exists at
   *  all. In addition to the caller's own pre-fill delay, already applied
   *  before this whole fill sequence starts. */
  stepDelays?: AccountStepDelay[];
}

const POLL_INTERVAL_MS = 200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Pause for every `stepDelays` entry matching this exact step + position,
 *  summing their seconds (normally at most one, but nothing stops the
 *  editor from adding more than one for the same point). */
async function waitStep(
  stepDelays: AccountStepDelay[] | undefined,
  step: AccountLoginStep,
  position: 'before' | 'after'
): Promise<void> {
  if (!stepDelays) return;
  const seconds = stepDelays
    .filter((d) => d.step === step && d.position === position)
    .reduce((sum, d) => sum + d.seconds, 0);
  if (seconds > 0) await delay(seconds * 1000);
}

/** Poll `resolveFirstMatch` until it finds something or `timeoutMs` elapses. */
function waitForMatch(
  query: string,
  kind: LocatorKind,
  timeoutMs: number
): Promise<Element | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    const poll = (): void => {
      const el = resolveFirstMatch(query, kind);
      if (el) {
        resolve(el);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve(null);
        return;
      }
      setTimeout(poll, POLL_INTERVAL_MS);
    };
    poll();
  });
}

/** Set an input's value via the native property setter and dispatch real events,
 *  so a page's own framework (React, Vue, ...) observes the change. */
function setNativeValue(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(el, value);
  for (const type of ['input', 'change', 'blur']) {
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }
}

export async function runAccountLoginFill(input: AccountLoginFillInput): Promise<Result<void>> {
  try {
    await waitStep(input.stepDelays, 'username', 'before');
    const userEl = await waitForMatch(
      input.usernameField.query,
      input.usernameField.kind,
      input.timeoutMs
    );
    if (!(userEl instanceof HTMLInputElement)) {
      return {
        ok: false,
        error: `Could not find the username field ("${input.usernameField.query}").`,
      };
    }
    setNativeValue(userEl, input.username);
    await waitStep(input.stepDelays, 'username', 'after');

    await waitStep(input.stepDelays, 'password', 'before');
    const passEl = await waitForMatch(
      input.passwordField.query,
      input.passwordField.kind,
      input.timeoutMs
    );
    if (!(passEl instanceof HTMLInputElement)) {
      return {
        ok: false,
        error: `Could not find the password field ("${input.passwordField.query}").`,
      };
    }
    setNativeValue(passEl, input.password);
    await waitStep(input.stepDelays, 'password', 'after');

    await waitStep(input.stepDelays, 'loginButton', 'before');
    const btnEl = await waitForMatch(
      input.loginButton.query,
      input.loginButton.kind,
      input.timeoutMs
    );
    if (!btnEl) {
      return {
        ok: false,
        error: `Could not find the login button ("${input.loginButton.query}").`,
      };
    }
    (btnEl as HTMLElement).click();
    await waitStep(input.stepDelays, 'loginButton', 'after');

    if (input.otpField && input.confirmOtpButton && input.otp !== undefined) {
      await waitStep(input.stepDelays, 'otp', 'before');
      const otpEl = await waitForMatch(input.otpField.query, input.otpField.kind, input.timeoutMs);
      if (!(otpEl instanceof HTMLInputElement)) {
        return {
          ok: false,
          error: `Login submitted, but could not find the OTP field ("${input.otpField.query}").`,
        };
      }
      setNativeValue(otpEl, input.otp);
      await waitStep(input.stepDelays, 'otp', 'after');

      await waitStep(input.stepDelays, 'confirmOtpButton', 'before');
      const confirmEl = await waitForMatch(
        input.confirmOtpButton.query,
        input.confirmOtpButton.kind,
        input.timeoutMs
      );
      if (!confirmEl) {
        return {
          ok: false,
          error: `OTP entered, but could not find the confirm button ("${input.confirmOtpButton.query}").`,
        };
      }
      (confirmEl as HTMLElement).click();
      await waitStep(input.stepDelays, 'confirmOtpButton', 'after');
    }

    return { ok: true, value: undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
