import { describe, expect, it } from 'vitest';
import { buildSpec, specFilename } from '@/shared/tools/spec-codegen';
import type { WorkflowStep } from '@/shared/workflow';

const FLOW: WorkflowStep[] = [
  { id: '1', kind: 'fill', selector: '#email', value: 'a@b.com' },
  { id: '2', kind: 'click', text: 'Sign in' },
  { id: '3', kind: 'press', selector: '#email', key: 'Enter' },
  { id: '4', kind: 'waitEl', selector: '.dashboard', ms: 5000 },
  { id: '5', kind: 'check', selector: '#agree', checked: true },
  { id: '6', kind: 'select', selector: '#plan', value: 'Pro', optionMode: 'text' },
  { id: '7', kind: 'wait', ms: 500 },
  { id: '8', kind: 'clickEl', selector: '.item', index: 2 },
  { id: '9', kind: 'fill', selector: '#skip', value: 'x', disabled: true },
];

describe('buildSpec — Playwright', () => {
  it('emits a runnable spec, skipping disabled steps', () => {
    expect(buildSpec(FLOW, 'playwright')).toBe(
      `import { test, expect } from '@playwright/test';

test('recorded flow', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.locator('#email').fill('a@b.com');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.locator('#email').press('Enter');
  await page.locator('.dashboard').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#agree').check();
  await page.locator('#plan').selectOption({ label: 'Pro' });
  await page.waitForTimeout(500);
  await page.locator('.item').nth(2).click();
});
`
    );
  });

  it('honours url and testName options', () => {
    const spec = buildSpec([{ id: '1', kind: 'wait', ms: 1 }], 'playwright', {
      url: 'https://app.test/login',
      testName: 'login works',
    });
    expect(spec).toContain(`test('login works', async ({ page }) => {`);
    expect(spec).toContain(`await page.goto('https://app.test/login');`);
  });
});

describe('buildSpec — Cypress', () => {
  it('emits a describe/it scaffold with cy commands', () => {
    expect(buildSpec(FLOW, 'cypress')).toBe(
      `describe('recorded flow', () => {
  it('runs the recorded flow', () => {
    cy.visit('http://localhost:3000');
    cy.get('#email').clear().type('a@b.com');
    cy.contains('button', 'Sign in').click();
    cy.get('#email').type('{enter}');
    cy.get('.dashboard', { timeout: 5000 }).should('be.visible');
    cy.get('#agree').check();
    cy.get('#plan').select('Pro');
    cy.wait(500);
    cy.get('.item').eq(2).click();
  });
});
`
    );
  });
});

describe('buildSpec — other frameworks', () => {
  it('WebdriverIO', () => {
    const s = buildSpec(FLOW, 'wdio');
    expect(s).toContain(`await browser.url('http://localhost:3000');`);
    expect(s).toContain(`await $('#email').setValue('a@b.com');`);
    expect(s).toContain(`await $('button=Sign in').click();`);
    expect(s).toContain(`await $$('.item')[2].click();`);
  });

  it('Selenium', () => {
    const s = buildSpec(FLOW, 'selenium');
    expect(s).toContain(`const { Builder, By, Key, until } = require('selenium-webdriver');`);
    expect(s).toContain(`await (await driver.findElement(By.css("#email"))).sendKeys('a@b.com');`);
    expect(s).toContain(`await ((await driver.findElements(By.css(".item")))[2]).click();`);
  });

  it('Robot Framework', () => {
    const s = buildSpec(FLOW, 'robot');
    expect(s).toContain(`Library    SeleniumLibrary`);
    expect(s).toContain(`Open Browser    http://localhost:3000    chrome`);
    expect(s).toContain(`Input Text    css=#email    a@b.com`);
    expect(s).toContain(`Click Button    Sign in`);
    expect(s).toContain(`Select Checkbox    css=#agree`);
  });
});

describe('escaping and placeholders', () => {
  it('escapes single quotes in values', () => {
    const s = buildSpec(
      [{ id: '1', kind: 'fill', selector: '#n', value: "O'Brien" }],
      'playwright'
    );
    expect(s).toContain(`await page.locator('#n').fill('O\\'Brien');`);
  });

  it('turns a random-generator fill into a labelled placeholder', () => {
    const s = buildSpec(
      [{ id: '1', kind: 'fill', selector: '#e', generator: 'email' }],
      'playwright'
    );
    expect(s).toContain(`await page.locator('#e').fill('TODO_email');`);
  });

  it('inlines runjs code', () => {
    const s = buildSpec([{ id: '1', kind: 'runjs', code: 'window.scrollTo(0, 0);' }], 'playwright');
    expect(s).toContain('await page.evaluate(() => {');
    expect(s).toContain('  window.scrollTo(0, 0);');
  });
});

describe('specFilename', () => {
  it('slugifies the test name and picks the right extension', () => {
    expect(specFilename('playwright', 'Login works!')).toBe('login-works.spec.ts');
    expect(specFilename('cypress', 'Login works!')).toBe('login-works.cy.js');
    expect(specFilename('robot', '')).toBe('flow.robot');
  });
});
