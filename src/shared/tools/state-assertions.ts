import { FRAMEWORK_LABELS } from '@/shared/constants';
import { isInteractive } from '@/shared/tools/element-state';
import type { ElementState, Framework } from '@/shared/types';

/**
 * Copy-ready state assertions for a picked element — the codegen half of the
 * "Element → Assertions" tool. A recorded flow with no assertions is not a test;
 * this turns the element's snapshot into paste-ready `toHaveText` / `toHaveValue`
 * / `toBeChecked` / `toBeEnabled` / `toBeVisible` / `toHaveAttribute` (and the
 * Cypress / WebdriverIO / Selenium / Robot equivalents), each pinned by tests.
 */

export interface StateAssertion {
  readonly framework: Framework;
  /** Which facet + framework, e.g. "Playwright — visible". */
  readonly label: string;
  readonly code: string;
}

/** Escape a value for embedding in a single-quoted JS/CSS string. */
function q(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

const ORDER: readonly Framework[] = ['playwright', 'cypress', 'wdio', 'selenium', 'robot'];

/** Build one facet's rows in a stable framework order, skipping unsupported ones. */
function facet(name: string, codes: Partial<Record<Framework, string>>): StateAssertion[] {
  return ORDER.filter((fw) => codes[fw] !== undefined).map((fw) => ({
    framework: fw,
    label: `${FRAMEWORK_LABELS[fw] ?? fw} — ${name}`,
    code: codes[fw] as string,
  }));
}

/** Cap on how many attribute assertions we emit, so the list stays paste-able. */
const MAX_ATTR_ASSERTIONS = 3;

/** All copy-ready state assertions for a picked element, targeted by `selector`. */
export function buildStateAssertions(state: ElementState, selector: string): StateAssertion[] {
  const s = q(selector);
  const out: StateAssertion[] = [];

  // Visibility (always).
  out.push(
    ...(state.visible
      ? facet('visible', {
          playwright: `await expect(page.locator('${s}')).toBeVisible();`,
          cypress: `cy.get('${s}').should('be.visible');`,
          wdio: `await expect($('${s}')).toBeDisplayed();`,
          selenium: `assert.strictEqual(await driver.findElement(By.css('${s}')).isDisplayed(), true);`,
          robot: `Element Should Be Visible    css=${selector}`,
        })
      : facet('hidden', {
          playwright: `await expect(page.locator('${s}')).toBeHidden();`,
          cypress: `cy.get('${s}').should('not.be.visible');`,
          wdio: `await expect($('${s}')).not.toBeDisplayed();`,
          selenium: `assert.strictEqual(await driver.findElement(By.css('${s}')).isDisplayed(), false);`,
          robot: `Element Should Not Be Visible    css=${selector}`,
        }))
  );

  // Text (short text only — an exact match on a long container is rarely useful).
  if (state.text !== null && state.text.length <= 100) {
    const t = q(state.text);
    out.push(
      ...facet('text', {
        playwright: `await expect(page.locator('${s}')).toHaveText('${t}');`,
        cypress: `cy.get('${s}').should('have.text', '${t}');`,
        wdio: `await expect($('${s}')).toHaveText('${t}');`,
        selenium: `assert.strictEqual(await driver.findElement(By.css('${s}')).getText(), '${t}');`,
        robot: `Element Text Should Be    css=${selector}    ${state.text}`,
      })
    );
  }

  // Form value.
  if (state.value !== null) {
    const v = q(state.value);
    out.push(
      ...facet('value', {
        playwright: `await expect(page.locator('${s}')).toHaveValue('${v}');`,
        cypress: `cy.get('${s}').should('have.value', '${v}');`,
        wdio: `await expect($('${s}')).toHaveValue('${v}');`,
        selenium: `assert.strictEqual(await driver.findElement(By.css('${s}')).getAttribute('value'), '${v}');`,
        robot: `Textfield Value Should Be    css=${selector}    ${state.value}`,
      })
    );
  }

  // Checked (checkbox/radio).
  if (state.checked !== null) {
    out.push(
      ...(state.checked
        ? facet('checked', {
            playwright: `await expect(page.locator('${s}')).toBeChecked();`,
            cypress: `cy.get('${s}').should('be.checked');`,
            wdio: `await expect($('${s}')).toBeChecked();`,
            selenium: `assert.strictEqual(await driver.findElement(By.css('${s}')).isSelected(), true);`,
            robot: `Checkbox Should Be Selected    css=${selector}`,
          })
        : facet('unchecked', {
            playwright: `await expect(page.locator('${s}')).not.toBeChecked();`,
            cypress: `cy.get('${s}').should('not.be.checked');`,
            wdio: `await expect($('${s}')).not.toBeChecked();`,
            selenium: `assert.strictEqual(await driver.findElement(By.css('${s}')).isSelected(), false);`,
            robot: `Checkbox Should Not Be Selected    css=${selector}`,
          }))
    );
  }

  // Enabled / disabled (interactive elements only).
  if (isInteractive(state)) {
    out.push(
      ...(state.disabled
        ? facet('disabled', {
            playwright: `await expect(page.locator('${s}')).toBeDisabled();`,
            cypress: `cy.get('${s}').should('be.disabled');`,
            wdio: `await expect($('${s}')).toBeDisabled();`,
            selenium: `assert.strictEqual(await driver.findElement(By.css('${s}')).isEnabled(), false);`,
            robot: `Element Should Be Disabled    css=${selector}`,
          })
        : facet('enabled', {
            playwright: `await expect(page.locator('${s}')).toBeEnabled();`,
            cypress: `cy.get('${s}').should('be.enabled');`,
            wdio: `await expect($('${s}')).toBeEnabled();`,
            selenium: `assert.strictEqual(await driver.findElement(By.css('${s}')).isEnabled(), true);`,
            robot: `Element Should Be Enabled    css=${selector}`,
          }))
    );
  }

  // A few attribute assertions.
  for (const attr of state.attributes.slice(0, MAX_ATTR_ASSERTIONS)) {
    const n = q(attr.name);
    const v = q(attr.value);
    out.push(
      ...facet(`@${attr.name}`, {
        playwright: `await expect(page.locator('${s}')).toHaveAttribute('${n}', '${v}');`,
        cypress: `cy.get('${s}').should('have.attr', '${n}', '${v}');`,
        wdio: `await expect($('${s}')).toHaveAttribute('${n}', '${v}');`,
        selenium: `assert.strictEqual(await driver.findElement(By.css('${s}')).getAttribute('${n}'), '${v}');`,
        robot: `Element Attribute Value Should Be    css=${selector}    ${attr.name}    ${attr.value}`,
      })
    );
  }

  return out;
}
