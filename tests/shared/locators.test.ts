import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildAbsoluteXPath,
  buildCssSelector,
  buildLocatorSet,
  countCssMatches,
  getAccessibleName,
  getRole,
  getTestIdAttr,
  isStableId,
  parseLocatorInput,
} from '@/shared/locators';

function setBody(html: string): void {
  document.body.innerHTML = html;
}

beforeEach(() => {
  setBody(`
    <form id="patient-form">
      <label for="fn">First Name</label>
      <input id="fn" data-testid="first-name" type="text" />
      <label>Email <input type="email" name="email" aria-label="Email" /></label>
      <button type="submit">Save</button>
      <div class="wrap"><span class="tag">hello world</span></div>
    </form>
  `);
});

describe('getTestIdAttr', () => {
  it('detects data-testid', () => {
    const el = document.querySelector('#fn')!;
    expect(getTestIdAttr(el)).toEqual({ attr: 'data-testid', value: 'first-name' });
  });

  it('returns null when no test id attribute is present', () => {
    const el = document.querySelector('span.tag')!;
    expect(getTestIdAttr(el)).toBeNull();
  });
});

describe('getRole / getAccessibleName', () => {
  it('maps a text input to the textbox role', () => {
    const el = document.querySelector('#fn')!;
    expect(getRole(el)).toBe('textbox');
  });

  it('resolves an accessible name from a label[for]', () => {
    const el = document.querySelector('#fn')!;
    expect(getAccessibleName(el, document)).toBe('First Name');
  });

  it('resolves an accessible name from aria-label', () => {
    const el = document.querySelector('input[type="email"]')!;
    expect(getAccessibleName(el, document)).toBe('Email');
  });

  it('uses button text as the accessible name', () => {
    const el = document.querySelector('button')!;
    expect(getRole(el)).toBe('button');
    expect(getAccessibleName(el, document)).toBe('Save');
  });
});

describe('buildCssSelector', () => {
  it('prefers a unique id', () => {
    const el = document.querySelector('#fn')!;
    expect(buildCssSelector(el, document)).toBe('#fn');
  });

  it('produces a selector that matches exactly one element', () => {
    const el = document.querySelector('span.tag')!;
    const selector = buildCssSelector(el, document);
    expect(document.querySelectorAll(selector).length).toBe(1);
  });
});

describe('Angular formControlName + auto-id handling', () => {
  beforeEach(() => {
    setBody(`
      <form>
        <input formcontrolname="firstName" id="mat-input-12" type="text" />
        <mat-select formcontrolname="gender" id="mat-select-3"></mat-select>
        <input aria-label="Mobile number input" id="mat-input-19" type="tel" />
        <mat-radio-button value="standard"><label>Standard</label></mat-radio-button>
      </form>
    `);
  });

  it('recommends the formControlName selector and never an auto-generated id', () => {
    const el = document.querySelector('input[formcontrolname="firstName"]')!;
    const set = buildLocatorSet(el, document);
    const top = set.suggestions[0]!;
    expect(top.strategy).toBe('formControl');
    expect(top.value).toBe('input[formcontrolname="firstName"]');
    // mat-input-12 is auto-generated → no id suggestion at all.
    expect(set.suggestions.some((s) => s.strategy === 'id')).toBe(false);
    const wdio = top.snippets.find((s) => s.framework === 'wdio');
    expect(wdio?.code).toBe('$(\'input[formcontrolname="firstName"]\')');
  });

  it('builds a formControlName selector for a mat-select', () => {
    const el = document.querySelector('mat-select')!;
    const set = buildLocatorSet(el, document);
    expect(set.suggestions[0]!.value).toBe('mat-select[formcontrolname="gender"]');
  });

  it('emits an aria-label CSS selector when there is no form control', () => {
    const el = document.querySelector('input[aria-label="Mobile number input"]')!;
    const set = buildLocatorSet(el, document);
    expect(
      set.suggestions.some(
        (s) => s.strategy === 'ariaLabel' && s.value === 'input[aria-label="Mobile number input"]'
      )
    ).toBe(true);
    expect(set.suggestions.some((s) => s.strategy === 'id')).toBe(false);
  });

  it('locates a radio button by its value', () => {
    const el = document.querySelector('mat-radio-button')!;
    const set = buildLocatorSet(el, document);
    expect(
      set.suggestions.some(
        (s) => s.strategy === 'attr' && s.value === 'mat-radio-button[value="standard"]'
      )
    ).toBe(true);
  });

  it('treats author-defined ids as stable', () => {
    expect(isStableId('patient-form')).toBe(true);
    expect(isStableId('mat-input-12')).toBe(false);
    expect(isStableId('cdk-overlay-3')).toBe(false);
    expect(isStableId('mat-select-3')).toBe(false);
  });
});

describe('parseLocatorInput', () => {
  it('passes through a raw CSS selector and detects raw XPath', () => {
    expect(parseLocatorInput('mat-label')).toEqual({ query: 'mat-label', kind: 'css' });
    expect(parseLocatorInput("//button[@type='submit']")).toEqual({
      query: "//button[@type='submit']",
      kind: 'xpath',
    });
  });

  it('extracts the selector from framework code snippets', () => {
    expect(parseLocatorInput("page.locator('mat-label')")).toEqual({
      query: 'mat-label',
      kind: 'css',
    });
    expect(parseLocatorInput("$('.foo')")).toEqual({ query: '.foo', kind: 'css' });
    expect(parseLocatorInput("cy.get('.foo')")).toEqual({ query: '.foo', kind: 'css' });
    expect(parseLocatorInput("$x('//div')")).toEqual({ query: '//div', kind: 'xpath' });
    expect(parseLocatorInput("page.locator('xpath=//div')")).toEqual({
      query: '//div',
      kind: 'xpath',
    });
  });

  it('maps getByTestId and By.id to selectors', () => {
    expect(parseLocatorInput("page.getByTestId('app-shell-menu')")).toEqual({
      query: '[data-testid="app-shell-menu"]',
      kind: 'css',
    });
    expect(parseLocatorInput('By.id("fn")')).toEqual({ query: '#fn', kind: 'css' });
  });

  it('unescapes quotes in Selenium By.cssSelector snippets', () => {
    expect(parseLocatorInput('By.cssSelector("[data-testid=\\"x\\"]")')).toEqual({
      query: '[data-testid="x"]',
      kind: 'css',
    });
  });

  it('handles Robot Framework strategy strings', () => {
    expect(parseLocatorInput('css:.foo')).toEqual({ query: '.foo', kind: 'css' });
    expect(parseLocatorInput('xpath://div')).toEqual({ query: '//div', kind: 'xpath' });
    expect(parseLocatorInput('id:fn')).toEqual({ query: '#fn', kind: 'css' });
  });
});

describe('countCssMatches', () => {
  it('counts matching elements', () => {
    expect(countCssMatches(document, 'input')).toBe(2);
    expect(countCssMatches(document, '#fn')).toBe(1);
    expect(countCssMatches(document, 'table')).toBe(0);
  });

  it('returns undefined for an invalid selector', () => {
    expect(countCssMatches(document, '###')).toBeUndefined();
  });
});

describe('buildAbsoluteXPath', () => {
  it('builds a positional path from the root', () => {
    const el = document.querySelector('span.tag')!;
    const xpath = buildAbsoluteXPath(el);
    expect(xpath.startsWith('/')).toBe(true);
    expect(xpath.endsWith('/span[1]')).toBe(true);
  });
});

describe('buildLocatorSet ranking', () => {
  it('recommends the test id when present and emits a Playwright getByTestId snippet', () => {
    const el = document.querySelector('#fn')!;
    const set = buildLocatorSet(el, document);
    const top = set.suggestions[0]!;

    expect(top.strategy).toBe('testId');
    expect(top.recommended).toBe(true);
    expect(top.value).toBe('first-name');
    expect(top.matchCount).toBe(1);

    const pw = top.snippets.find((s) => s.framework === 'playwright');
    expect(pw?.code).toBe("page.getByTestId('first-name')");
    expect(top.snippets.some((s) => s.framework === 'robot')).toBe(true);

    // Exactly one recommended suggestion.
    expect(set.suggestions.filter((s) => s.recommended)).toHaveLength(1);
  });

  it('includes an id suggestion alongside the test id', () => {
    const el = document.querySelector('#fn')!;
    const set = buildLocatorSet(el, document);
    const idSuggestion = set.suggestions.find((s) => s.strategy === 'id');
    expect(idSuggestion?.value).toBe('fn');
  });

  it('recommends an aria-label CSS selector and still offers role+name', () => {
    const el = document.querySelector('input[type="email"]')!;
    const set = buildLocatorSet(el, document);
    const top = set.suggestions[0]!;
    expect(top.strategy).toBe('ariaLabel');
    expect(top.value).toBe('input[aria-label="Email"]');

    const roleName = set.suggestions.find((s) => s.strategy === 'roleName');
    expect(roleName?.value).toBe('Email');
    const pw = roleName?.snippets.find((s) => s.framework === 'playwright');
    expect(pw?.code).toContain("getByRole('textbox'");
  });

  it('falls back to css/xpath for a plain element and covers all frameworks', () => {
    const el = document.querySelector('span.tag')!;
    const set = buildLocatorSet(el, document);
    expect(set.suggestions[0]!.strategy).toBe('css');

    const cssSuggestion = set.suggestions.find((s) => s.strategy === 'css')!;
    const frameworks = cssSuggestion.snippets.map((s) => s.framework).sort();
    expect(frameworks).toEqual(['cypress', 'playwright', 'robot', 'selenium', 'wdio']);
    expect(cssSuggestion.matchCount).toBe(1);

    expect(set.suggestions.some((s) => s.strategy === 'xpath')).toBe(true);
    expect(set.element.tagName).toBe('span');
    expect(set.element.textPreview).toBe('hello world');
  });
});
