import { looksLikeXPath } from '@/shared/locators';
import type { Framework } from '@/shared/types';
import type { WorkflowStep } from '@/shared/workflow';

/**
 * Turn a recorded WorkflowStep[] into a runnable test SPEC file for a chosen
 * framework — the codegen behind the Recorder's "Export as spec". Pure string
 * building over the typed step array; the exact output is pinned by tests.
 *
 * It is best-effort: a recorded flow maps cleanly to clicks/fills/presses/waits,
 * but random-value fills become a placeholder (they can't be reproduced without
 * the generator) and mat-label-only targets fall back to a label locator.
 */

export interface SpecOptions {
  readonly url: string;
  readonly testName: string;
}

const DEFAULTS: SpecOptions = { url: 'http://localhost:3000', testName: 'recorded flow' };

function q(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
function dq(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** The static value a `fill` step types — its recorded value, or a placeholder. */
function fillValue(s: WorkflowStep): string {
  if (s.value !== undefined && s.value !== '') return s.value;
  if (s.generator !== undefined && s.generator !== 'custom') return `TODO_${s.generator}`;
  return '';
}

interface Dialect {
  step(s: WorkflowStep): string[];
  wrap(body: string[], o: SpecOptions): string;
}

// ---------------------------------------------------------------------------
// Playwright
// ---------------------------------------------------------------------------

function pwLoc(s: WorkflowStep): string {
  if (s.selector !== undefined && s.selector !== '') {
    const base = `page.locator('${q(s.selector)}')`;
    return s.index !== undefined ? `${base}.nth(${s.index})` : base;
  }
  if (s.label !== undefined && s.label !== '') return `page.getByLabel('${q(s.label)}')`;
  return `page.locator('body')`;
}

const playwright: Dialect = {
  step(s) {
    switch (s.kind) {
      case 'click':
        return [`await page.getByRole('button', { name: '${q(s.text ?? '')}' }).click();`];
      case 'clickEl':
        return [`await ${pwLoc(s)}.click();`];
      case 'fill':
        return [`await ${pwLoc(s)}.fill('${q(fillValue(s))}');`];
      case 'press':
        return [
          s.selector || s.label
            ? `await ${pwLoc(s)}.press('${q(s.key ?? '')}');`
            : `await page.keyboard.press('${q(s.key ?? '')}');`,
        ];
      case 'select':
        return [
          s.optionMode === 'text' || s.optionMode === undefined
            ? `await ${pwLoc(s)}.selectOption({ label: '${q(s.value ?? '')}' });`
            : `await ${pwLoc(s)}.selectOption({ index: 0 }); // ${s.optionMode} option`,
        ];
      case 'radio':
        return [
          `await page.locator('${q(s.selector ?? '')}${s.value ? `[value="${dq(s.value)}"]` : ''}').check();`,
        ];
      case 'check':
        return [`await ${pwLoc(s)}.${s.checked === false ? 'uncheck' : 'check'}();`];
      case 'wait':
        return [`await page.waitForTimeout(${s.ms ?? 0});`];
      case 'waitEl':
        return [
          `await page.locator('${q(s.selector ?? '')}').waitFor({ state: 'visible'${s.ms ? `, timeout: ${s.ms}` : ''} });`,
        ];
      case 'runjs':
        return ['await page.evaluate(() => {', ...indentLines(s.code ?? '', '  '), '});'];
      default:
        return [`// unsupported step: ${s.kind}`];
    }
  },
  wrap(body, o) {
    return [
      `import { test, expect } from '@playwright/test';`,
      ``,
      `test('${q(o.testName)}', async ({ page }) => {`,
      `  await page.goto('${q(o.url)}');`,
      ...body.map((l) => `  ${l}`),
      `});`,
      ``,
    ].join('\n');
  },
};

// ---------------------------------------------------------------------------
// Cypress
// ---------------------------------------------------------------------------

function cyLoc(s: WorkflowStep): string {
  if (s.selector !== undefined && s.selector !== '') {
    const base = `cy.get('${q(s.selector)}')`;
    return s.index !== undefined ? `${base}.eq(${s.index})` : base;
  }
  if (s.label !== undefined && s.label !== '')
    return `cy.contains('label', '${q(s.label)}').find('input, select, textarea')`;
  return `cy.get('body')`;
}

const cypress: Dialect = {
  step(s) {
    switch (s.kind) {
      case 'click':
        return [`cy.contains('button', '${q(s.text ?? '')}').click();`];
      case 'clickEl':
        return [`${cyLoc(s)}.click();`];
      case 'fill':
        return [`${cyLoc(s)}.clear().type('${q(fillValue(s))}');`];
      case 'press':
        return [`${cyLoc(s)}.type('{${(s.key ?? '').toLowerCase()}}');`];
      case 'select':
        return [`${cyLoc(s)}.select('${q(s.value ?? '')}');`];
      case 'radio':
        return [
          `cy.get('${q(s.selector ?? '')}${s.value ? `[value="${dq(s.value)}"]` : ''}').check();`,
        ];
      case 'check':
        return [`${cyLoc(s)}.${s.checked === false ? 'uncheck' : 'check'}();`];
      case 'wait':
        return [`cy.wait(${s.ms ?? 0});`];
      case 'waitEl':
        return [
          `cy.get('${q(s.selector ?? '')}'${s.ms ? `, { timeout: ${s.ms} }` : ''}).should('be.visible');`,
        ];
      case 'runjs':
        return ['cy.window().then((win) => {', ...indentLines(s.code ?? '', '  '), '});'];
      default:
        return [`// unsupported step: ${s.kind}`];
    }
  },
  wrap(body, o) {
    return [
      `describe('${q(o.testName)}', () => {`,
      `  it('runs the recorded flow', () => {`,
      `    cy.visit('${q(o.url)}');`,
      ...body.map((l) => `    ${l}`),
      `  });`,
      `});`,
      ``,
    ].join('\n');
  },
};

// ---------------------------------------------------------------------------
// WebdriverIO
// ---------------------------------------------------------------------------

function wdioLoc(s: WorkflowStep): string {
  if (s.selector !== undefined && s.selector !== '') {
    return s.index !== undefined ? `$$('${q(s.selector)}')[${s.index}]` : `$('${q(s.selector)}')`;
  }
  if (s.label !== undefined && s.label !== '') return `$('aria/${q(s.label)}')`;
  return `$('body')`;
}

const wdio: Dialect = {
  step(s) {
    switch (s.kind) {
      case 'click':
        return [`await $('button=${q(s.text ?? '')}').click();`];
      case 'clickEl':
        return [`await ${wdioLoc(s)}.click();`];
      case 'fill':
        return [`await ${wdioLoc(s)}.setValue('${q(fillValue(s))}');`];
      case 'press':
        return [`await browser.keys('${q(s.key ?? '')}');`];
      case 'select':
        return [`await ${wdioLoc(s)}.selectByVisibleText('${q(s.value ?? '')}');`];
      case 'radio':
        return [
          `await $('${q(s.selector ?? '')}${s.value ? `[value="${dq(s.value)}"]` : ''}').click();`,
        ];
      case 'check':
        return [
          `await ${wdioLoc(s)}.click(); // ensure ${s.checked === false ? 'unchecked' : 'checked'}`,
        ];
      case 'wait':
        return [`await browser.pause(${s.ms ?? 0});`];
      case 'waitEl':
        return [
          `await $('${q(s.selector ?? '')}').waitForDisplayed(${s.ms ? `{ timeout: ${s.ms} }` : ''});`,
        ];
      case 'runjs':
        return ['await browser.execute(() => {', ...indentLines(s.code ?? '', '  '), '});'];
      default:
        return [`// unsupported step: ${s.kind}`];
    }
  },
  wrap(body, o) {
    return [
      `describe('${q(o.testName)}', () => {`,
      `  it('runs the recorded flow', async () => {`,
      `    await browser.url('${q(o.url)}');`,
      ...body.map((l) => `    ${l}`),
      `  });`,
      `});`,
      ``,
    ].join('\n');
  },
};

// ---------------------------------------------------------------------------
// Selenium (JavaScript / Mocha)
// ---------------------------------------------------------------------------

function seEl(s: WorkflowStep): string {
  const by = looksLikeXPath(s.selector ?? '')
    ? `By.xpath("${dq(s.selector ?? '')}")`
    : `By.css("${dq(s.selector ?? '')}")`;
  if (s.index !== undefined) return `(await driver.findElements(${by}))[${s.index}]`;
  return `await driver.findElement(${by})`;
}

const selenium: Dialect = {
  step(s) {
    switch (s.kind) {
      case 'click':
        return [
          `await driver.findElement(By.xpath("//button[normalize-space()='${dq(s.text ?? '')}']")).click();`,
        ];
      case 'clickEl':
        return [`await (${seEl(s)}).click();`];
      case 'fill':
        return [`await (${seEl(s)}).sendKeys('${q(fillValue(s))}');`];
      case 'press':
        return [
          `await driver.actions().sendKeys(Key.${(s.key ?? 'ENTER').toUpperCase()}).perform();`,
        ];
      case 'select':
        return [`await new Select(${seEl(s)}).selectByVisibleText('${q(s.value ?? '')}');`];
      case 'radio':
        return [
          `await driver.findElement(By.css("${dq(s.selector ?? '')}${s.value ? `[value='${dq(s.value)}']` : ''}")).click();`,
        ];
      case 'check':
        return [
          `await (${seEl(s)}).click(); // ensure ${s.checked === false ? 'unchecked' : 'checked'}`,
        ];
      case 'wait':
        return [`await driver.sleep(${s.ms ?? 0});`];
      case 'waitEl':
        return [
          `await driver.wait(until.elementLocated(By.css("${dq(s.selector ?? '')}")), ${s.ms ?? 5000});`,
        ];
      case 'runjs':
        return [`await driver.executeScript(${JSON.stringify(s.code ?? '')});`];
      default:
        return [`// unsupported step: ${s.kind}`];
    }
  },
  wrap(body, o) {
    return [
      `const { Builder, By, Key, until } = require('selenium-webdriver');`,
      `const { Select } = require('selenium-webdriver/lib/select');`,
      ``,
      `describe('${q(o.testName)}', function () {`,
      `  let driver;`,
      `  before(async () => { driver = await new Builder().forBrowser('chrome').build(); });`,
      `  after(async () => { await driver.quit(); });`,
      `  it('runs the recorded flow', async () => {`,
      `    await driver.get('${q(o.url)}');`,
      ...body.map((l) => `    ${l}`),
      `  });`,
      `});`,
      ``,
    ].join('\n');
  },
};

// ---------------------------------------------------------------------------
// Robot Framework (SeleniumLibrary)
// ---------------------------------------------------------------------------

function robotLoc(s: WorkflowStep): string {
  if (s.selector !== undefined && s.selector !== '') {
    return looksLikeXPath(s.selector) ? `xpath=${s.selector}` : `css=${s.selector}`;
  }
  if (s.label !== undefined && s.label !== '')
    return `xpath=//label[contains(., "${dq(s.label)}")]//input`;
  return `css=body`;
}

const robot: Dialect = {
  step(s) {
    switch (s.kind) {
      case 'click':
        return [`Click Button    ${s.text ?? ''}`];
      case 'clickEl':
        return [`Click Element    ${robotLoc(s)}`];
      case 'fill':
        return [`Input Text    ${robotLoc(s)}    ${fillValue(s)}`];
      case 'press':
        return [`Press Keys    ${robotLoc(s)}    ${s.key ?? ''}`];
      case 'select':
        return [`Select From List By Label    ${robotLoc(s)}    ${s.value ?? ''}`];
      case 'radio':
        return [`Select Radio Button    ${s.selector ?? ''}    ${s.value ?? ''}`];
      case 'check':
        return [
          `${s.checked === false ? 'Unselect Checkbox' : 'Select Checkbox'}    ${robotLoc(s)}`,
        ];
      case 'wait':
        return [`Sleep    ${s.ms ?? 0}ms`];
      case 'waitEl':
        return [`Wait Until Element Is Visible    ${robotLoc(s)}    ${s.ms ?? 5000}ms`];
      case 'runjs':
        return [`Execute Javascript    ${(s.code ?? '').replace(/\n/g, ' ')}`];
      default:
        return [`# unsupported step: ${s.kind}`];
    }
  },
  wrap(body, o) {
    return [
      `*** Settings ***`,
      `Library    SeleniumLibrary`,
      ``,
      `*** Test Cases ***`,
      titleCase(o.testName),
      `    Open Browser    ${o.url}    chrome`,
      ...body.map((l) => `    ${l}`),
      `    Close Browser`,
      ``,
    ].join('\n');
  },
};

function titleCase(name: string): string {
  return name.replace(/\b\w/g, (c) => c.toUpperCase());
}

function indentLines(code: string, indent: string): string[] {
  return code.split('\n').map((l) => `${indent}${l}`);
}

const DIALECTS: Record<Framework, Dialect> = { playwright, cypress, wdio, selenium, robot };

/** Build a runnable spec file for `framework` from the recorded steps. */
export function buildSpec(
  steps: readonly WorkflowStep[],
  framework: Framework,
  options: Partial<SpecOptions> = {}
): string {
  const o = { ...DEFAULTS, ...options };
  const enabled = steps.filter((s) => s.disabled !== true);
  const dialect = DIALECTS[framework];
  const body = enabled.flatMap((s) => dialect.step(s));
  return dialect.wrap(body, o);
}

/** Suggested filename for a spec of this framework. */
export function specFilename(framework: Framework, testName: string): string {
  const slug =
    testName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'flow';
  const ext: Record<Framework, string> = {
    playwright: 'spec.ts',
    cypress: 'cy.js',
    wdio: 'e2e.js',
    selenium: 'test.js',
    robot: 'robot',
  };
  return `${slug}.${ext[framework]}`;
}
