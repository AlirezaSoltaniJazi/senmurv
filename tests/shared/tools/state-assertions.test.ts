import { describe, expect, it } from 'vitest';
import { buildStateAssertions } from '@/shared/tools/state-assertions';
import type { ElementState } from '@/shared/types';

function state(over: Partial<ElementState>): ElementState {
  return {
    tag: 'div',
    text: null,
    value: null,
    checked: null,
    disabled: false,
    readOnly: false,
    visible: true,
    inputType: null,
    attributes: [],
    ...over,
  };
}

function codes(s: ElementState, sel = '#el'): string[] {
  return buildStateAssertions(s, sel).map((a) => a.code);
}

describe('buildStateAssertions', () => {
  it('emits toBeVisible / toBeHidden for the visibility facet', () => {
    expect(codes(state({ visible: true }))).toContain(
      "await expect(page.locator('#el')).toBeVisible();"
    );
    expect(codes(state({ visible: false }))).toContain(
      "await expect(page.locator('#el')).toBeHidden();"
    );
  });

  it('emits a text assertion for short text and skips long text', () => {
    expect(codes(state({ tag: 'button', text: 'Save' }))).toContain(
      "await expect(page.locator('#el')).toHaveText('Save');"
    );
    const long = 'x'.repeat(101);
    expect(codes(state({ text: long })).some((c) => c.includes('toHaveText'))).toBe(false);
  });

  it('emits a value assertion for a form value', () => {
    expect(codes(state({ tag: 'input', value: 'a@b.com', inputType: 'text' }))).toContain(
      "await expect(page.locator('#el')).toHaveValue('a@b.com');"
    );
  });

  it('emits toBeChecked / not.toBeChecked for checkboxes', () => {
    expect(codes(state({ tag: 'input', checked: true, inputType: 'checkbox' }))).toContain(
      "await expect(page.locator('#el')).toBeChecked();"
    );
    expect(codes(state({ tag: 'input', checked: false, inputType: 'checkbox' }))).toContain(
      "await expect(page.locator('#el')).not.toBeChecked();"
    );
  });

  it('emits toBeEnabled / toBeDisabled for interactive elements only', () => {
    expect(codes(state({ tag: 'button', disabled: false }))).toContain(
      "await expect(page.locator('#el')).toBeEnabled();"
    );
    expect(codes(state({ tag: 'button', disabled: true }))).toContain(
      "await expect(page.locator('#el')).toBeDisabled();"
    );
    // A plain div is not interactive → no enabled/disabled assertion.
    expect(codes(state({ tag: 'div' })).some((c) => c.includes('toBeEnabled'))).toBe(false);
  });

  it('emits attribute assertions, capped at three', () => {
    const s = state({
      attributes: [
        { name: 'type', value: 'submit' },
        { name: 'name', value: 'go' },
        { name: 'aria-label', value: 'Go' },
        { name: 'data-testid', value: 't' },
      ],
    });
    const attrCodes = codes(s).filter((c) => c.includes('toHaveAttribute'));
    expect(attrCodes).toContain(
      "await expect(page.locator('#el')).toHaveAttribute('type', 'submit');"
    );
    // 3 attributes × 1 (playwright) — capped, so data-testid is dropped.
    expect(attrCodes.some((c) => c.includes("'data-testid'"))).toBe(false);
  });

  it('covers all five frameworks for a facet', () => {
    const fws = new Set(
      buildStateAssertions(state({ visible: true }), '#el').map((a) => a.framework)
    );
    expect([...fws].sort()).toEqual(['cypress', 'playwright', 'robot', 'selenium', 'wdio']);
  });

  it('escapes quotes in text and selector', () => {
    const c = codes(state({ tag: 'button', text: "O'Brien" }), "[data-x='y']");
    expect(c).toContain("await expect(page.locator('[data-x=\\'y\\']')).toHaveText('O\\'Brien');");
  });

  it('produces Cypress / WDIO / Selenium / Robot forms too', () => {
    const all = codes(state({ tag: 'input', value: 'hi', inputType: 'text' }));
    expect(all).toContain("cy.get('#el').should('have.value', 'hi');");
    expect(all).toContain("await expect($('#el')).toHaveValue('hi');");
    expect(all).toContain(
      "assert.strictEqual(await driver.findElement(By.css('#el')).getAttribute('value'), 'hi');"
    );
    expect(all).toContain('Textfield Value Should Be    css=#el    hi');
  });
});
