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
  relativePosition,
  resolveFirstMatch,
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

describe('Dynamics 365 / Power Apps ids', () => {
  const dataId =
    'fmc_erpindustrycodeid.fieldControl-LookupResultsDropdown_fmc_erpindustrycodeid_textInputBox_with_filter_new';
  beforeEach(() => {
    setBody(`
      <div id="id-eb031c6a-d851-ec11-8c62-6045bd8f59e9-16-fmc_erpindustrycodeid_28_x"
           data-id="${dataId}">field</div>
    `);
  });

  it('rejects an id embedding a GUID (session/render-generated), keeps a plain id', () => {
    expect(isStableId('id-eb031c6a-d851-ec11-8c62-6045bd8f59e9-16-fmc_field')).toBe(false);
    expect(isStableId('patient-form')).toBe(true);
  });

  it('detects data-id as a test-id attribute', () => {
    const el = document.querySelector('[data-id]')!;
    expect(getTestIdAttr(el)).toEqual({ attr: 'data-id', value: dataId });
  });

  it('prefers the stable data-id over the GUID id', () => {
    const el = document.querySelector('[data-id]')!;
    const selector = buildCssSelector(el, document);
    expect(selector).toBe(`[data-id="${dataId}"]`);
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

describe('resolveFirstMatch', () => {
  it('resolves a CSS selector to its first live element', () => {
    const el = resolveFirstMatch('#fn', 'css', document);
    expect(el?.getAttribute('data-testid')).toBe('first-name');
  });

  it('returns null when nothing matches', () => {
    expect(resolveFirstMatch('.does-not-exist', 'css', document)).toBeNull();
  });

  it('returns null for an invalid CSS selector instead of throwing', () => {
    expect(resolveFirstMatch('###', 'css', document)).toBeNull();
  });

  it('returns null for xpath rather than throwing when Document.evaluate is unavailable', () => {
    // happy-dom does not implement Document.evaluate (matches countXPathMatches's
    // own `typeof doc.evaluate !== 'function'` guard) -- real XPath resolution is
    // exercised via the runInChrome skill against a real browser instead.
    expect(resolveFirstMatch('//button', 'xpath', document)).toBeNull();
  });

  it('defaults to the global document when none is passed', () => {
    expect(resolveFirstMatch('#fn', 'css')?.getAttribute('data-testid')).toBe('first-name');
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

  it('recommends the name attribute over aria-label, and still offers both plus role+name', () => {
    const el = document.querySelector('input[type="email"]')!;
    const set = buildLocatorSet(el, document);
    const top = set.suggestions[0]!;
    // `name` outranks `ariaLabel` in LOCATOR_PRIORITY — both are stable, but
    // `name` is the more conventional form-field-targeting attribute.
    expect(top.strategy).toBe('name');
    expect(top.value).toBe('input[name="email"]');
    expect(top.testQuery).toBe('input[name="email"]');
    expect(top.kind).toBe('css');
    const namePw = top.snippets.find((s) => s.framework === 'selenium');
    expect(namePw?.code).toContain('By.name("email")');

    const ariaLabel = set.suggestions.find((s) => s.strategy === 'ariaLabel');
    expect(ariaLabel?.value).toBe('input[aria-label="Email"]');

    const roleName = set.suggestions.find((s) => s.strategy === 'roleName');
    expect(roleName?.value).toBe('Email');
    const pw = roleName?.snippets.find((s) => s.framework === 'playwright');
    expect(pw?.code).toContain("getByRole('textbox'");
  });

  it('recommends visible text over a bare CSS/XPath fallback, but still offers both', () => {
    const el = document.querySelector('span.tag')!;
    const set = buildLocatorSet(el, document);
    // The span has no id/testid/name/aria-label — but it does have text, so
    // the new `text` strategy now outranks the generic CSS/XPath fallback.
    const top = set.suggestions[0]!;
    expect(top.strategy).toBe('text');
    expect(top.value).toBe('hello world');
    expect(top.kind).toBe('xpath');
    expect(top.testQuery).toBe('//span[normalize-space(.)="hello world"]');

    const cssSuggestion = set.suggestions.find((s) => s.strategy === 'css')!;
    const frameworks = cssSuggestion.snippets.map((s) => s.framework).sort();
    expect(frameworks).toEqual(['cypress', 'playwright', 'robot', 'selenium', 'wdio']);
    expect(cssSuggestion.matchCount).toBe(1);

    expect(set.suggestions.some((s) => s.strategy === 'xpath')).toBe(true);
    expect(set.element.tagName).toBe('span');
    expect(set.element.textPreview).toBe('hello world');
  });

  it('recommends the data-testid on a disabled button, exactly like an enabled one', () => {
    // The exact shape of a real bug report: a disabled Angular Material button
    // with a data-testid. buildLocatorSet has no notion of `disabled` at all —
    // this asserts that directly, so a regression here is caught even though
    // the actual root cause (a disabled control never dispatching `mousedown`/
    // `mouseup`/`click`, fixed in content/picker.ts by picking on `pointerdown`
    // instead, since that's the one event Chrome still dispatches on a
    // disabled control) lives one layer up, in code this suite can't exercise
    // (no real layout/event engine).
    setBody(`
      <button data-testid="huma-auth-kit-login" disabled="true" class="mdc-button mat-mdc-button-disabled">
        <span class="mdc-button__label"><span> Login </span></span>
      </button>
    `);
    const el = document.querySelector('button')!;
    const set = buildLocatorSet(el, document);
    const top = set.suggestions[0]!;
    expect(top.strategy).toBe('testId');
    expect(top.recommended).toBe(true);
    expect(top.value).toBe('huma-auth-kit-login');
    expect(top.quality).toBe('high');
  });
});

describe('buildLocatorSet — link text / partial link text (anchors only)', () => {
  it('offers linkText and partialLinkText for an anchor with text', () => {
    setBody(`<a href="/account">My Account</a>`);
    const el = document.querySelector('a')!;
    const set = buildLocatorSet(el, document);

    const linkText = set.suggestions.find((s) => s.strategy === 'linkText');
    expect(linkText?.value).toBe('My Account');
    expect(linkText?.kind).toBe('xpath');
    expect(linkText?.testQuery).toBe('//a[normalize-space(text())="My Account"]');
    const selenium = linkText?.snippets.find((s) => s.framework === 'selenium');
    expect(selenium?.code).toBe('By.linkText("My Account")');

    const partial = set.suggestions.find((s) => s.strategy === 'partialLinkText');
    expect(partial?.value).toBe('My Account');
    expect(partial?.testQuery).toBe('//a[contains(normalize-space(text()),"My Account")]');
    const partialSelenium = partial?.snippets.find((s) => s.framework === 'selenium');
    expect(partialSelenium?.code).toBe('By.partialLinkText("My Account")');
  });

  it('never offers linkText/partialLinkText for a non-anchor, even with text', () => {
    const el = document.querySelector('span.tag')!; // from the shared fixture, has text
    const set = buildLocatorSet(el, document);
    expect(set.suggestions.some((s) => s.strategy === 'linkText')).toBe(false);
    expect(set.suggestions.some((s) => s.strategy === 'partialLinkText')).toBe(false);
  });

  // happy-dom does not implement document.evaluate() at all (not partially —
  // absent), so these two assert the generated XPath string only; the real
  // browser (this is a content-script feature) supports both forms per the
  // XPath 1.0 spec.
  it('wraps text containing only double quotes in single quotes', () => {
    setBody(`<a href="/x">Say "hi"</a>`);
    const el = document.querySelector('a')!;
    const set = buildLocatorSet(el, document);
    const linkText = set.suggestions.find((s) => s.strategy === 'linkText');
    expect(linkText?.testQuery).toBe(`//a[normalize-space(text())='Say "hi"']`);
  });

  it('falls back to concat() when the text has both quote types (XPath 1.0 has no escape)', () => {
    setBody(`<a href="/x">Say "hi" y'all</a>`);
    const el = document.querySelector('a')!;
    const set = buildLocatorSet(el, document);
    const linkText = set.suggestions.find((s) => s.strategy === 'linkText');
    expect(linkText?.testQuery).toBe(
      `//a[normalize-space(text())=concat("Say ", '"', "hi", '"', " y'all")]`
    );
  });
});

describe('buildLocatorSet — class name', () => {
  it('picks the one unique class among several, over a non-unique one', () => {
    setBody(`
      <div class="row"></div>
      <div class="row submit-cta"></div>
    `);
    const el = document.querySelectorAll('div')[1]!;
    const set = buildLocatorSet(el, document);
    const cls = set.suggestions.find((s) => s.strategy === 'className');
    expect(cls?.value).toBe('submit-cta');
    expect(cls?.testQuery).toBe('.submit-cta');
    expect(cls?.quality).toBe('medium');
    expect(cls?.matchCount).toBe(1);
    const selenium = cls?.snippets.find((s) => s.framework === 'selenium');
    expect(selenium?.code).toBe('By.className("submit-cta")');
  });

  it('falls back to the first class, low quality, when none is unique alone', () => {
    setBody(`
      <div class="row highlight"></div>
      <div class="row highlight"></div>
    `);
    const el = document.querySelectorAll('div')[0]!;
    const set = buildLocatorSet(el, document);
    const cls = set.suggestions.find((s) => s.strategy === 'className');
    expect(cls?.value).toBe('row');
    expect(cls?.quality).toBe('low');
    expect(cls?.matchCount).toBe(2);
  });
});

describe('relativePosition', () => {
  it('classifies below/above/toLeftOf/toRightOf by the largest gap', () => {
    const anchor = { top: 100, bottom: 120, left: 0, right: 50 };
    expect(relativePosition({ top: 130, bottom: 150, left: 0, right: 50 }, anchor)).toBe('below');
    expect(relativePosition({ top: 60, bottom: 80, left: 0, right: 50 }, anchor)).toBe('above');
    expect(relativePosition({ top: 100, bottom: 120, left: 60, right: 110 }, anchor)).toBe(
      'toRightOf'
    );
    expect(relativePosition({ top: 100, bottom: 120, left: -60, right: -10 }, anchor)).toBe(
      'toLeftOf'
    );
  });

  it('returns null when the rects overlap on both axes (no clear relationship)', () => {
    const anchor = { top: 0, bottom: 100, left: 0, right: 100 };
    expect(relativePosition({ top: 10, bottom: 90, left: 10, right: 90 }, anchor)).toBeNull();
  });
});

describe('buildLocatorSet — relative locator (Selenium-only, label-associated only)', () => {
  it('offers a relative suggestion for a label-associated field, using the injected rect env', () => {
    setBody(`
      <label for="otp-code">One-time code</label>
      <input id="otp-code" />
    `);
    const input = document.querySelector('#otp-code')!;
    const label = document.querySelector('label')!;
    const env = {
      rectOf: (el: Element) =>
        el === input
          ? { top: 130, bottom: 150, left: 0, right: 50 }
          : el === label
            ? { top: 100, bottom: 120, left: 0, right: 50 }
            : { top: 0, bottom: 0, left: 0, right: 0 },
    };
    const set = buildLocatorSet(input, document, env);
    const relative = set.suggestions.find((s) => s.strategy === 'relative');
    expect(relative).toBeDefined();
    expect(relative?.label).toBe('relative (below)');
    expect(relative?.kind).toBeUndefined();
    expect(relative?.testQuery).toBeUndefined();
    expect(relative?.snippets).toHaveLength(1);
    expect(relative?.snippets[0]?.framework).toBe('selenium');
    expect(relative?.snippets[0]?.code).toContain(
      'RelativeLocator.with(By.tagName("input")).below('
    );
  });

  it('offers nothing when there is no associated label', () => {
    setBody(`<input id="lonely" />`);
    const el = document.querySelector('#lonely')!;
    const set = buildLocatorSet(el, document);
    expect(set.suggestions.some((s) => s.strategy === 'relative')).toBe(false);
  });
});
