import { resolveFirstMatch } from '@/shared/locators';
import type { AccountLocator, LocatorKind, Result } from '@/shared/types';

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
}

const POLL_INTERVAL_MS = 200;

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

    if (input.otpField && input.confirmOtpButton && input.otp !== undefined) {
      const otpEl = await waitForMatch(input.otpField.query, input.otpField.kind, input.timeoutMs);
      if (!(otpEl instanceof HTMLInputElement)) {
        return {
          ok: false,
          error: `Login submitted, but could not find the OTP field ("${input.otpField.query}").`,
        };
      }
      setNativeValue(otpEl, input.otp);

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
    }

    return { ok: true, value: undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
