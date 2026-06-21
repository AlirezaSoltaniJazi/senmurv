import { LOCATOR_PRIORITY, TEST_ID_ATTRS } from '@/shared/constants';
import type {
  ElementInfo,
  Framework,
  FrameworkSnippet,
  LocatorKind,
  LocatorQuality,
  LocatorSet,
  LocatorStrategy,
  LocatorSuggestion,
} from '@/shared/types';

// ---------------------------------------------------------------------------
// String helpers
// ---------------------------------------------------------------------------

/** Escape a string for use as a single-quoted JS literal. */
function jsStr(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** Escape a string for use as a double-quoted (Java-style) literal. */
function dblStr(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Escape a value for use as a CSS identifier (e.g. an id). */
function cssEscapeIdent(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
}

/** Escape a value for use inside a `[attr="..."]` selector. */
function cssEscapeAttrValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Count how many elements a CSS selector matches (undefined if the selector is invalid). */
export function countCssMatches(doc: Document, selector: string): number | undefined {
  try {
    return doc.querySelectorAll(selector).length;
  } catch {
    return undefined;
  }
}

/** Count how many nodes an XPath matches (undefined if unsupported or invalid). */
export function countXPathMatches(doc: Document, xpath: string): number | undefined {
  try {
    if (typeof doc.evaluate !== 'function') return undefined;
    // 7 = XPathResult.ORDERED_NODE_SNAPSHOT_TYPE
    const result = doc.evaluate(xpath, doc, null, 7, null);
    return result.snapshotLength;
  } catch {
    return undefined;
  }
}

/** True if `selector` matches exactly one element in `doc`. */
function isUnique(doc: Document, selector: string): boolean {
  return countCssMatches(doc, selector) === 1;
}

/**
 * True if an `id` is author-defined and stable, false for framework-generated
 * ids (Angular Material / CDK: `mat-input-12`, `mat-select-3`, `cdk-…`,
 * `…-<counter>`). Those change every page load, so we never recommend them.
 */
export function isStableId(id: string): boolean {
  if (!id) return false;
  if (/^(mat-|cdk-|ng-)/i.test(id)) return false;
  if (/[-_]\d+$/.test(id)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Locator-input parsing (for the "Test a locator" box)
// ---------------------------------------------------------------------------

export interface ParsedLocator {
  query: string;
  kind: LocatorKind;
}

/** True if a raw value looks like an XPath rather than a CSS selector. */
export function looksLikeXPath(value: string): boolean {
  const v = value.trim();
  return v.startsWith('//') || v.startsWith('/') || v.startsWith('(') || v.startsWith('./');
}

function stripXPathPrefix(value: string): string {
  return value.replace(/^xpath\s*=\s*/i, '');
}

/**
 * Normalize whatever the user types into the locator tester into a plain query
 * + kind. Accepts a raw CSS selector or XPath, a Robot Framework strategy
 * (`css:…`, `xpath:…`, `id:…`), or a framework code snippet such as
 * `page.locator('…')`, `page.getByTestId('…')`, `$('…')`, `$x('…')`,
 * `cy.get('…')`, or `By.cssSelector("…")` / `By.id("…")` / `By.xpath("…")`.
 */
export function parseLocatorInput(input: string): ParsedLocator {
  const s = input.trim();

  // Robot Framework strategies: "css:…", "xpath:…", "id:…"
  const robot = /^(css|xpath|id)\s*:\s*([\s\S]+)$/i.exec(s);
  if (robot) {
    const strategy = robot[1]!.toLowerCase();
    const value = robot[2]!.trim();
    if (strategy === 'xpath') return { query: value, kind: 'xpath' };
    if (strategy === 'id') return { query: `#${value}`, kind: 'css' };
    return { query: value, kind: 'css' };
  }

  // Framework code with a quoted argument, e.g. page.locator('…') or By.id("…").
  const call = /^[\w$.]*?([\w$]+)\s*\(\s*(['"`])((?:\\.|(?!\2).)*)\2/.exec(s);
  if (call) {
    const method = call[1]!.toLowerCase();
    const raw = call[3]!.replace(/\\(.)/g, '$1');
    if (method === 'getbytestid') return { query: `[data-testid="${raw}"]`, kind: 'css' };
    if (method === 'id') return { query: `#${raw}`, kind: 'css' };
    if (method === 'xpath' || method === '$x')
      return { query: stripXPathPrefix(raw), kind: 'xpath' };
    const stripped = stripXPathPrefix(raw);
    if (stripped !== raw) return { query: stripped, kind: 'xpath' };
    return { query: raw, kind: looksLikeXPath(raw) ? 'xpath' : 'css' };
  }

  // Bare "xpath=…" prefix (Playwright shorthand).
  const bare = stripXPathPrefix(s);
  if (bare !== s) return { query: bare, kind: 'xpath' };

  return { query: s, kind: looksLikeXPath(s) ? 'xpath' : 'css' };
}

// ---------------------------------------------------------------------------
// Element introspection
// ---------------------------------------------------------------------------

/** The first present test-id attribute, in preference order. */
export function getTestIdAttr(el: Element): { attr: string; value: string } | null {
  for (const attr of TEST_ID_ATTRS) {
    const value = el.getAttribute(attr);
    if (value) return { attr, value };
  }
  return null;
}

/** The element's role — explicit `role` attribute, else a pragmatic implicit role. */
export function getRole(el: Element): string | null {
  const explicit = el.getAttribute('role');
  if (explicit) return explicit.trim();

  const tag = el.tagName.toLowerCase();
  if (tag === 'a') return el.hasAttribute('href') ? 'link' : null;
  if (tag === 'button') return 'button';
  if (tag === 'select') return 'combobox';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'img') return 'img';
  if (/^h[1-6]$/.test(tag)) return 'heading';
  if (tag === 'input') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    const map: Record<string, string> = {
      checkbox: 'checkbox',
      radio: 'radio',
      button: 'button',
      submit: 'button',
      reset: 'button',
      image: 'button',
      range: 'slider',
      number: 'spinbutton',
      search: 'searchbox',
      email: 'textbox',
      tel: 'textbox',
      url: 'textbox',
      text: 'textbox',
    };
    return map[type] ?? (type === 'hidden' || type === 'password' ? null : 'textbox');
  }
  return null;
}

/** The accessible name (aria-label, labelledby, associated/wrapping label, placeholder, text). */
export function getAccessibleName(el: Element, doc: Document): string | null {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel?.trim()) return ariaLabel.trim();

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const ref = doc.getElementById(labelledBy);
    const text = ref?.textContent?.trim();
    if (text) return text;
  }

  const id = el.getAttribute('id');
  if (id) {
    const label = doc.querySelector(`label[for="${cssEscapeAttrValue(id)}"]`);
    const text = label?.textContent?.trim();
    if (text) return text;
  }

  const wrappingLabel = el.closest('label');
  if (wrappingLabel?.textContent?.trim()) return wrappingLabel.textContent.trim();

  const placeholder = el.getAttribute('placeholder');
  if (placeholder?.trim()) return placeholder.trim();

  const tag = el.tagName.toLowerCase();
  if ((tag === 'button' || tag === 'a') && el.textContent?.trim()) {
    return el.textContent.trim();
  }
  return null;
}

/** A short, single-line preview of the element's visible text. */
export function getTextPreview(el: Element): string {
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
}

/** A short preview of the element's identifying attributes. */
function attributesPreview(el: Element): string {
  const keep = ['id', 'class', 'name', 'type', 'role', 'aria-label', ...TEST_ID_ATTRS];
  const parts: string[] = [];
  for (const attr of keep) {
    const value = el.getAttribute(attr);
    if (value) {
      const shown = value.length > 30 ? `${value.slice(0, 29)}…` : value;
      parts.push(`${attr}="${shown}"`);
    }
  }
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Selector generation
// ---------------------------------------------------------------------------

/** A single CSS path segment: tag, plus :nth-of-type when there are same-tag siblings. */
function elementSegment(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const parent = el.parentElement;
  if (!parent) return tag;
  const sameTag = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
  if (sameTag.length <= 1) return tag;
  return `${tag}:nth-of-type(${sameTag.indexOf(el) + 1})`;
}

/** Build the shortest reasonably-unique CSS selector for an element. */
export function buildCssSelector(el: Element, doc: Document): string {
  const id = el.getAttribute('id');
  if (id && isStableId(id)) {
    const sel = `#${cssEscapeIdent(id)}`;
    if (isUnique(doc, sel)) return sel;
  }

  const testId = getTestIdAttr(el);
  if (testId) {
    const sel = `[${testId.attr}="${cssEscapeAttrValue(testId.value)}"]`;
    if (isUnique(doc, sel)) return sel;
  }

  const formControl = el.getAttribute('formcontrolname');
  if (formControl) {
    const sel = `${el.tagName.toLowerCase()}[formcontrolname="${cssEscapeAttrValue(formControl)}"]`;
    if (isUnique(doc, sel)) return sel;
  }

  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current.nodeType === 1 && current.tagName.toLowerCase() !== 'html') {
    const currentId = current.getAttribute('id');
    if (currentId && isStableId(currentId) && isUnique(doc, `#${cssEscapeIdent(currentId)}`)) {
      parts.unshift(`#${cssEscapeIdent(currentId)}`);
      break;
    }
    parts.unshift(elementSegment(current));
    const candidate = parts.join(' > ');
    if (isUnique(doc, candidate)) return candidate;
    current = current.parentElement;
  }
  return parts.join(' > ');
}

/** Build a relative XPath, preferring id / stable attributes, falling back to absolute. */
export function buildRelativeXPath(el: Element): string {
  const id = el.getAttribute('id');
  if (id) return `//*[@id="${id}"]`;

  const tag = el.tagName.toLowerCase();
  for (const attr of ['data-testid', 'name', 'aria-label', 'placeholder', 'data-id']) {
    const value = el.getAttribute(attr);
    if (value) return `//${tag}[@${attr}="${value}"]`;
  }
  return buildAbsoluteXPath(el);
}

/** Build a positional absolute XPath from the document root. */
export function buildAbsoluteXPath(el: Element): string {
  const segments: string[] = [];
  let current: Element | null = el;
  while (current && current.nodeType === 1) {
    let index = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === current.tagName) index += 1;
      sibling = sibling.previousElementSibling;
    }
    segments.unshift(`${current.tagName.toLowerCase()}[${index}]`);
    current = current.parentElement;
  }
  return `/${segments.join('/')}`;
}

// ---------------------------------------------------------------------------
// Framework snippet formatters
// ---------------------------------------------------------------------------

function snippet(framework: Framework, label: string, code: string): FrameworkSnippet {
  return { framework, label, code };
}

function testIdSnippets(attr: string, value: string): FrameworkSnippet[] {
  const sel = `[${attr}="${value}"]`;
  return [
    attr === 'data-testid'
      ? snippet('playwright', 'getByTestId', `page.getByTestId(${jsStr(value)})`)
      : snippet('playwright', 'locator', `page.locator(${jsStr(sel)})`),
    snippet('wdio', '$', `$(${jsStr(sel)})`),
    snippet('cypress', 'get', `cy.get(${jsStr(sel)})`),
    snippet('selenium', 'By.cssSelector', `By.cssSelector(${dblStr(sel)})`),
    snippet('robot', 'css strategy', `css:${sel}`),
  ];
}

function idSnippets(id: string): FrameworkSnippet[] {
  const sel = `#${id}`;
  return [
    snippet('playwright', 'locator', `page.locator(${jsStr(sel)})`),
    snippet('wdio', '$', `$(${jsStr(sel)})`),
    snippet('cypress', 'get', `cy.get(${jsStr(sel)})`),
    snippet('selenium', 'By.id', `By.id(${dblStr(id)})`),
    snippet('robot', 'id strategy', `id:${id}`),
  ];
}

function roleNameSnippets(role: string, name: string): FrameworkSnippet[] {
  return [
    snippet('playwright', 'getByRole', `page.getByRole(${jsStr(role)}, { name: ${jsStr(name)} })`),
    snippet('playwright', 'getByLabel', `page.getByLabel(${jsStr(name)})`),
    snippet('wdio', '$ (aria)', `$('aria/${name.replace(/'/g, "\\'")}')`),
    snippet('cypress', 'contains', `cy.contains(${jsStr(name)})`),
    snippet('selenium', 'By.xpath', `By.xpath(${dblStr(`//*[@aria-label='${name}']`)})`),
    snippet('robot', 'xpath strategy', `xpath://*[@aria-label='${name}']`),
  ];
}

function cssSnippets(css: string): FrameworkSnippet[] {
  return [
    snippet('playwright', 'locator', `page.locator(${jsStr(css)})`),
    snippet('wdio', '$', `$(${jsStr(css)})`),
    snippet('cypress', 'get', `cy.get(${jsStr(css)})`),
    snippet('selenium', 'By.cssSelector', `By.cssSelector(${dblStr(css)})`),
    snippet('robot', 'css strategy', `css:${css}`),
  ];
}

function xpathSnippets(xpath: string): FrameworkSnippet[] {
  return [
    snippet('playwright', 'locator', `page.locator('xpath=${xpath.replace(/'/g, "\\'")}')`),
    snippet('wdio', '$x', `$x(${jsStr(xpath)})`),
    snippet('cypress', 'xpath (plugin)', `cy.xpath(${jsStr(xpath)})`),
    snippet('selenium', 'By.xpath', `By.xpath(${dblStr(xpath)})`),
    snippet('robot', 'xpath strategy', `xpath:${xpath}`),
  ];
}

// ---------------------------------------------------------------------------
// Orchestration + ranking
// ---------------------------------------------------------------------------

/** Attach a match count only when computable (exactOptionalPropertyTypes forbids `undefined`). */
function withMatchCount(
  suggestion: LocatorSuggestion,
  count: number | undefined
): LocatorSuggestion {
  if (typeof count === 'number') suggestion.matchCount = count;
  return suggestion;
}

/** Lower is more preferred. Absolute XPath sorts just after relative XPath. */
function priorityIndex(strategy: LocatorStrategy): number {
  const base = strategy === 'xpathAbsolute' ? 'xpath' : strategy;
  const idx = (LOCATOR_PRIORITY as readonly string[]).indexOf(base);
  const rank = idx === -1 ? LOCATOR_PRIORITY.length : idx;
  return strategy === 'xpathAbsolute' ? rank + 0.5 : rank;
}

/**
 * Compute the ranked set of locator suggestions for an element.
 * Pure — pass the owning document (defaults to the global `document`).
 */
export function buildLocatorSet(el: Element, doc: Document = document): LocatorSet {
  const suggestions: LocatorSuggestion[] = [];

  const testId = getTestIdAttr(el);
  if (testId) {
    const selector = `[${testId.attr}="${cssEscapeAttrValue(testId.value)}"]`;
    suggestions.push(
      withMatchCount(
        {
          strategy: 'testId',
          label: testId.attr,
          value: testId.value,
          quality: 'high',
          recommended: false,
          snippets: testIdSnippets(testId.attr, testId.value),
        },
        countCssMatches(doc, selector)
      )
    );
  }

  // formControlName — the Angular/Material app standard; very stable.
  const fcEl = el.matches('[formcontrolname]') ? el : el.closest('[formcontrolname]');
  const fcName = fcEl?.getAttribute('formcontrolname');
  if (fcEl && fcName) {
    const sel = `${fcEl.tagName.toLowerCase()}[formcontrolname="${cssEscapeAttrValue(fcName)}"]`;
    const count = countCssMatches(doc, sel);
    suggestions.push(
      withMatchCount(
        {
          strategy: 'formControl',
          label: 'form control',
          value: sel,
          quality: count === 1 ? 'high' : 'medium',
          recommended: false,
          snippets: cssSnippets(sel),
        },
        count
      )
    );
  }

  // Only offer an `id` selector when the id is author-defined (not mat-/cdk-/…-N).
  const id = el.getAttribute('id');
  if (id && isStableId(id)) {
    const count =
      countCssMatches(doc, `#${cssEscapeIdent(id)}`) ??
      countCssMatches(doc, `[id="${cssEscapeAttrValue(id)}"]`);
    const quality: LocatorQuality = count === 1 ? 'high' : 'medium';
    suggestions.push(
      withMatchCount(
        {
          strategy: 'id',
          label: 'id',
          value: id,
          quality,
          recommended: false,
          snippets: idSnippets(id),
        },
        count
      )
    );
  }

  // Radio buttons / mat-radio-button by their `value` attribute.
  const radioEl = el.matches('mat-radio-button, input[type="radio"], [role="radio"]')
    ? el
    : el.closest('mat-radio-button, [role="radio"]');
  const radioValue = radioEl?.getAttribute('value');
  if (radioEl && radioValue) {
    const sel = `${radioEl.tagName.toLowerCase()}[value="${cssEscapeAttrValue(radioValue)}"]`;
    const count = countCssMatches(doc, sel);
    suggestions.push(
      withMatchCount(
        {
          strategy: 'attr',
          label: 'value',
          value: sel,
          quality: count === 1 ? 'high' : 'medium',
          recommended: false,
          snippets: cssSnippets(sel),
        },
        count
      )
    );
  }

  // aria-label as a direct CSS attribute selector (distinct from role+name below).
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) {
    const sel = `${el.tagName.toLowerCase()}[aria-label="${cssEscapeAttrValue(ariaLabel)}"]`;
    const count = countCssMatches(doc, sel);
    suggestions.push(
      withMatchCount(
        {
          strategy: 'ariaLabel',
          label: 'aria-label',
          value: sel,
          quality: count === 1 ? 'high' : 'medium',
          recommended: false,
          snippets: cssSnippets(sel),
        },
        count
      )
    );
  }

  const role = getRole(el);
  const name = getAccessibleName(el, doc);
  if (role && name) {
    suggestions.push({
      strategy: 'roleName',
      label: `role=${role}`,
      value: name,
      quality: 'medium',
      recommended: false,
      snippets: roleNameSnippets(role, name),
    });
  }

  const css = buildCssSelector(el, doc);
  const cssCount = countCssMatches(doc, css);
  suggestions.push(
    withMatchCount(
      {
        strategy: 'css',
        label: 'CSS selector',
        value: css,
        quality: cssCount === 1 ? 'medium' : 'low',
        recommended: false,
        snippets: cssSnippets(css),
      },
      cssCount
    )
  );

  const relXpath = buildRelativeXPath(el);
  suggestions.push(
    withMatchCount(
      {
        strategy: 'xpath',
        label: 'XPath (relative)',
        value: relXpath,
        quality: 'low',
        recommended: false,
        snippets: xpathSnippets(relXpath),
      },
      countXPathMatches(doc, relXpath)
    )
  );

  const absXpath = buildAbsoluteXPath(el);
  if (absXpath && absXpath !== relXpath) {
    suggestions.push(
      withMatchCount(
        {
          strategy: 'xpathAbsolute',
          label: 'XPath (absolute)',
          value: absXpath,
          quality: 'low',
          recommended: false,
          snippets: xpathSnippets(absXpath),
        },
        countXPathMatches(doc, absXpath)
      )
    );
  }

  suggestions.sort((a, b) => priorityIndex(a.strategy) - priorityIndex(b.strategy));
  const top = suggestions[0];
  if (top) top.recommended = true;

  const element: ElementInfo = {
    tagName: el.tagName.toLowerCase(),
    textPreview: getTextPreview(el),
    attributesPreview: attributesPreview(el),
  };

  return { element, suggestions };
}
