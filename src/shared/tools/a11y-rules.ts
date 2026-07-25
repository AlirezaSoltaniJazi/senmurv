import { getAccessibleName, getRole, resolveLabelledby } from '@/shared/locators';
import { compositeOver, contrastVerdict } from '@/shared/tools/contrast';
import { parseColor } from '@/shared/tools/color';
import { resolveEffectiveBackground } from '@/shared/tools/element-colors';
import type { BackgroundLayer } from '@/shared/tools/element-colors';
import { effectiveTabIndex } from '@/shared/tools/tab-order';
import type {
  A11yFinding,
  A11yReport,
  FindingConfidence,
  FindingImpact,
  Rgba,
  WcagLevel,
} from '@/shared/types';

/**
 * Hand-rolled WCAG A/AA/AAA checks. The catalogue, its confidence levels and its
 * false-positive guards were spec'd + adversarially reviewed (a11y-rule-catalogue
 * workflow). Two hard rules from that review:
 *
 *  - Automated tooling catches only a MINORITY of WCAG issues (~30-40% in the
 *    field; Deque's axe reaches ~57% under ideal conditions). A clean scan is
 *    never proof of conformance — hence `confidence: 'needs-review'` for every
 *    heuristic, and the disciplined `passedRules` list.
 *  - Under-report before you false-positive: a QA tool that cries wolf is muted.
 */

export interface A11yEnv {
  /** Is the element rendered? Injected because happy-dom has no layout. */
  isRendered(el: Element): boolean;
  /** Computed style, injected for the same reason (rules read colour/visibility). */
  styleOf(el: Element): CSSStyleDeclaration;
  /** Which conformance level the scan targets (AAA adds the 1.4.6 rule). */
  level: WcagLevel;
}

interface RawFinding {
  el: Element;
  ruleId: string;
  sc: string;
  level: WcagLevel;
  impact: FindingImpact;
  confidence: FindingConfidence;
  message: string;
  howToFix: string;
  helpUrl: string;
}

type Rule = (root: Document, env: A11yEnv) => RawFinding[];

const U = 'https://www.w3.org/WAI/WCAG22/Understanding';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function isHidden(el: Element): boolean {
  return el.closest('[aria-hidden="true"]') !== null || el.closest('[hidden]') !== null;
}

/** Collapsed text of an element's whole subtree (includes sr-only spans). */
function textOf(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** A rich accessible-name resolution for links / headings (name from anywhere). */
function resolveName(el: Element, doc: Document): string {
  const al = el.getAttribute('aria-label')?.trim();
  if (al) return al;
  const lb = resolveLabelledby(el, doc);
  if (lb) return lb;
  const text = textOf(el);
  if (text) return text;
  for (const img of Array.from(el.querySelectorAll('img[alt]'))) {
    const a = img.getAttribute('alt')?.trim();
    if (a) return a;
  }
  for (const svg of Array.from(el.querySelectorAll('svg'))) {
    const sl = svg.getAttribute('aria-label')?.trim();
    if (sl) return sl;
    const t = svg.querySelector('title')?.textContent?.trim();
    if (t) return t;
  }
  for (const d of Array.from(el.querySelectorAll('[aria-label]'))) {
    const a = d.getAttribute('aria-label')?.trim();
    if (a) return a;
  }
  return el.getAttribute('title')?.trim() ?? '';
}

/** True when the element (or an ancestor) is declared decorative. */
function isDecorativeRole(el: Element): boolean {
  const role = (el.getAttribute('role') ?? '').toLowerCase();
  return role === 'presentation' || role === 'none';
}

function describeTarget(el: Element, doc: Document): string {
  const name = getAccessibleName(el, doc) ?? textOf(el).slice(0, 40);
  return `<${el.tagName.toLowerCase()}>${name ? ` “${name}”` : ''}`;
}

// ---------------------------------------------------------------------------
// SC 1.1.1 — images
// ---------------------------------------------------------------------------

const imgAlt: Rule = (root, env) =>
  Array.from(root.querySelectorAll('img'))
    .filter(
      (el) =>
        !el.hasAttribute('alt') &&
        !isDecorativeRole(el) &&
        !isHidden(el) &&
        env.isRendered(el) &&
        !el.getAttribute('aria-label')?.trim() &&
        !resolveLabelledby(el, root) &&
        !el.getAttribute('title')?.trim()
    )
    .map((el) => ({
      el,
      ruleId: 'img-alt',
      sc: '1.1.1',
      level: 'A' as const,
      impact: 'critical' as const,
      confidence: 'violation' as const,
      message: 'Image has no text alternative — the alt attribute is missing.',
      howToFix:
        'Add alt="…" describing the image, or alt="" if it is purely decorative. A <figcaption> does not replace alt.',
      helpUrl: `${U}/non-text-content.html`,
    }));

const inputImageAlt: Rule = (root, env) =>
  Array.from(root.querySelectorAll('input[type="image" i]'))
    .filter(
      (el) =>
        !isHidden(el) &&
        env.isRendered(el) &&
        !el.getAttribute('alt')?.trim() &&
        !el.getAttribute('aria-label')?.trim() &&
        !resolveLabelledby(el, root) &&
        !el.getAttribute('title')?.trim()
    )
    .map((el) => ({
      el,
      ruleId: 'input-image-alt',
      sc: '1.1.1',
      level: 'A' as const,
      impact: 'critical' as const,
      confidence: 'violation' as const,
      message: 'Image button (<input type="image">) has no text alternative.',
      howToFix: 'Add alt="Search" (the button\'s action) or an aria-label.',
      helpUrl: `${U}/non-text-content.html`,
    }));

const areaAlt: Rule = (root) =>
  Array.from(root.querySelectorAll('area[href]'))
    .filter(
      (el) =>
        !el.hasAttribute('alt') &&
        !el.getAttribute('aria-label')?.trim() &&
        !resolveLabelledby(el, root) &&
        !el.getAttribute('title')?.trim()
    )
    .map((el) => ({
      el,
      ruleId: 'area-alt',
      sc: '1.1.1',
      level: 'A' as const,
      impact: 'critical' as const,
      confidence: 'violation' as const,
      message: 'Image-map area (<area>) link has no text alternative.',
      howToFix: 'Give each linked <area> an alt describing its destination, or an aria-label.',
      helpUrl: `${U}/non-text-content.html`,
    }));

const svgImgAlt: Rule = (root) =>
  Array.from(root.querySelectorAll('svg[role="img" i]'))
    .filter((el) => {
      if (isHidden(el)) return false;
      if (el.getAttribute('aria-label')?.trim()) return false;
      if (resolveLabelledby(el, root)) return false;
      const title = el.querySelector(':scope > title')?.textContent?.trim();
      return !title;
    })
    .map((el) => ({
      el,
      ruleId: 'svg-img-alt',
      sc: '1.1.1',
      level: 'A' as const,
      impact: 'serious' as const,
      confidence: 'violation' as const,
      message: 'SVG marked as an image (role="img") has no accessible name.',
      howToFix: 'Add aria-label="…" or a <title> element as the SVG\'s first child.',
      helpUrl: `${U}/non-text-content.html`,
    }));

const decorativeImageRedundantLabel: Rule = (root) =>
  Array.from(root.querySelectorAll('img'))
    .filter((el) => {
      const decorative = el.getAttribute('alt') === '' || isDecorativeRole(el);
      const named =
        Boolean(el.getAttribute('aria-label')?.trim()) || Boolean(resolveLabelledby(el, root));
      return decorative && named;
    })
    .map((el) => ({
      el,
      ruleId: 'decorative-image-redundant-label',
      sc: '1.1.1',
      level: 'A' as const,
      impact: 'minor' as const,
      confidence: 'needs-review' as const,
      message:
        'Image is marked decorative (empty alt / role=presentation) yet also carries an aria-label — contradictory intent; confirm which is correct.',
      howToFix:
        'If decorative, remove the aria-label; if meaningful, remove alt=""/role=presentation and describe it in alt.',
      helpUrl: `${U}/non-text-content.html`,
    }));

// ---------------------------------------------------------------------------
// SC 4.1.2 / 3.3.2 / 1.3.5 — form controls
// ---------------------------------------------------------------------------

const SKIP_INPUT_TYPES = new Set(['hidden', 'button', 'submit', 'reset', 'image']);

function isNamedFormControl(el: Element, doc: Document): boolean {
  if (el.getAttribute('aria-label')?.trim()) return true;
  if (resolveLabelledby(el, doc)) return true;
  const id = el.getAttribute('id');
  if (id) {
    const forLabel = doc.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (forLabel?.textContent?.trim()) return true;
  }
  if (el.closest('label')?.textContent?.trim()) return true;
  return Boolean(el.getAttribute('title')?.trim());
}

function formControls(root: Document): Element[] {
  return Array.from(root.querySelectorAll('input, select, textarea')).filter((el) => {
    const type = (el.getAttribute('type') ?? '').toLowerCase();
    if (el.tagName.toLowerCase() === 'input' && SKIP_INPUT_TYPES.has(type)) return false;
    return !el.hasAttribute('disabled') && !isHidden(el);
  });
}

const formControlNoName: Rule = (root) =>
  formControls(root)
    .filter((el) => !isNamedFormControl(el, root))
    .map((el) => ({
      el,
      ruleId: 'form-control-no-accessible-name',
      sc: '4.1.2',
      level: 'A' as const,
      impact: 'critical' as const,
      confidence: 'violation' as const,
      message: 'This form control has no accessible name. A placeholder does not count as a label.',
      howToFix: 'Add a <label for>, wrap it in a <label>, or add aria-label / aria-labelledby.',
      helpUrl: `${U}/name-role-value.html`,
    }));

const PERSONAL =
  /(fname|lname|firstname|lastname|fullname|givenname|familyname|name|email|tel|phone|mobile|address|addr|street|city|town|state|province|country|zip|postal|postcode|bday|birth|ccname|cardnumber|creditcard|honorific|organization|company)/;
const NON_PERSONAL =
  /(search|query|comment|message|subject|quantity|qty|otp|onetimecode|coupon|promo|username|user)/;
const AUTOCOMPLETE_TYPES = new Set(['text', 'email', 'tel', 'url', 'number', 'month', 'date']);

const inputMissingAutocomplete: Rule = (root) =>
  Array.from(root.querySelectorAll('input'))
    .filter((el) => {
      const type = (el.getAttribute('type') ?? 'text').toLowerCase();
      if (!AUTOCOMPLETE_TYPES.has(type)) return false;
      if (isHidden(el) || el.hasAttribute('disabled')) return false;
      const hint = `${el.getAttribute('name') ?? ''} ${el.getAttribute('id') ?? ''}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
      const personal =
        type === 'email' || type === 'tel' || (PERSONAL.test(hint) && !NON_PERSONAL.test(hint));
      if (!personal) return false;
      const ac = (el.getAttribute('autocomplete') ?? '').trim().toLowerCase();
      return ac === '' || ac === 'off' || ac === 'on';
    })
    .map((el) => ({
      el,
      ruleId: 'input-missing-autocomplete',
      sc: '1.3.5',
      level: 'AA' as const,
      impact: 'moderate' as const,
      confidence: 'needs-review' as const,
      message:
        'This input appears to collect personal data but has no valid autocomplete token — confirm its purpose, then add one.',
      howToFix: 'Add the WCAG autocomplete token, e.g. autocomplete="email" or "given-name".',
      helpUrl: `${U}/identify-input-purpose.html`,
    }));

const requiredFieldNoLabel: Rule = (root) =>
  formControls(root)
    .filter((el) => el.hasAttribute('required') || el.getAttribute('aria-required') === 'true')
    .filter((el) => {
      const id = el.getAttribute('id');
      const forLabel = id ? root.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      if (forLabel?.textContent?.trim() && !forLabel.closest('[hidden]')) return false;
      const wrap = el.closest('label');
      if (wrap?.textContent?.trim()) return false;
      const lb = el.getAttribute('aria-labelledby');
      if (lb && resolveLabelledby(el, root)) return false;
      return true; // named only by aria-label/title/placeholder, or unnamed
    })
    .map((el) => ({
      el,
      ruleId: 'required-field-no-visible-label',
      sc: '3.3.2',
      level: 'A' as const,
      impact: 'moderate' as const,
      confidence: 'needs-review' as const,
      message: 'This field is required but has no visible label or instruction.',
      howToFix: 'Add a visible <label> (or visible instructions) associated with the field.',
      helpUrl: `${U}/labels-or-instructions.html`,
    }));

// ---------------------------------------------------------------------------
// SC 1.3.1 / 2.4.x — structure
// ---------------------------------------------------------------------------

const tableMissingHeaders: Rule = (root) =>
  Array.from(root.querySelectorAll('table'))
    .filter((el) => {
      if (isDecorativeRole(el)) return false;
      const rows = Array.from(el.querySelectorAll(':scope > tbody > tr, :scope > tr'));
      if (rows.length < 3) return false;
      const maxCols = Math.max(0, ...rows.map((r) => r.querySelectorAll('td, th').length));
      if (maxCols < 3) return false;
      if (el.querySelector('td[headers]')) return false;
      const hasHeader = el.querySelector('th, [scope], [role="columnheader"], [role="rowheader"]');
      return el.querySelector('td') !== null && hasHeader === null;
    })
    .map((el) => ({
      el,
      ruleId: 'table-missing-headers',
      sc: '1.3.1',
      level: 'A' as const,
      impact: 'serious' as const,
      confidence: 'needs-review' as const,
      message:
        'Data table has cells but no <th>/scope/header roles — verify whether it needs headers or is a layout table needing role="presentation".',
      howToFix:
        'Mark header cells with <th scope="col|row">, or add role="presentation" to a layout table.',
      helpUrl: `${U}/info-and-relationships.html`,
    }));

function headings(root: Document): Element[] {
  return Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')).filter(
    (el) => !isHidden(el) && el.closest('template') === null
  );
}

function headingLevel(el: Element): number {
  const m = /^h([1-6])$/.exec(el.tagName.toLowerCase());
  if (m) return parseInt(m[1] as string, 10);
  return parseInt(el.getAttribute('aria-level') ?? '2', 10) || 2;
}

const headingSkippedLevel: Rule = (root) => {
  const out: RawFinding[] = [];
  let prev: number | null = null;
  for (const el of headings(root)) {
    const level = headingLevel(el);
    if (prev !== null && level > prev + 1) {
      out.push({
        el,
        ruleId: 'heading-skipped-level',
        sc: '1.3.1',
        level: 'A',
        impact: 'moderate',
        confidence: 'needs-review',
        message: `Heading level skipped (h${prev} → h${level}) — a best-practice outline check, not a strict 1.3.1 failure.`,
        howToFix: 'Use heading levels sequentially without skipping (h2 after h1, not h3).',
        helpUrl: `${U}/info-and-relationships.html`,
      });
    }
    prev = level;
  }
  return out;
};

const headingEmpty: Rule = (root) =>
  headings(root)
    .filter((el) => resolveName(el, root) === '')
    .map((el) => ({
      el,
      ruleId: 'heading-empty',
      sc: '1.3.1',
      level: 'A' as const,
      impact: 'moderate' as const,
      confidence: 'violation' as const,
      message: 'Heading element has no accessible text.',
      howToFix: 'Give the heading text, or remove the empty heading element.',
      helpUrl: `${U}/info-and-relationships.html`,
    }));

const documentTitleMissing: Rule = (root) => {
  const titleEl = root.querySelector('head > title') ?? root.querySelector('title');
  if (titleEl && (titleEl.textContent ?? '').trim() !== '') return [];
  return [
    {
      el: root.documentElement,
      ruleId: 'document-title-missing',
      sc: '2.4.2',
      level: 'A' as const,
      impact: 'serious' as const,
      confidence: 'violation' as const,
      message: 'The document has no non-empty <title>.',
      howToFix: 'Add a descriptive <title> in the document <head>.',
      helpUrl: `${U}/page-titled.html`,
    },
  ];
};

const bypassBlocksMissing: Rule = (root) => {
  const hasMain = root.querySelector('main, [role="main"]') !== null;
  const skipLink = Array.from(root.querySelectorAll('a[href^="#"]')).some((a) => {
    const id = (a.getAttribute('href') ?? '').slice(1);
    return id !== '' && root.getElementById(id) !== null;
  });
  const twoHeadings = headings(root).length >= 2;
  const landmark =
    root.querySelector('nav, [role="navigation"], [role="banner"], [role="contentinfo"]') !== null;
  if (hasMain || skipLink || twoHeadings || landmark) return [];
  return [
    {
      el: root.documentElement,
      ruleId: 'bypass-blocks-missing',
      sc: '2.4.1',
      level: 'A' as const,
      impact: 'serious' as const,
      confidence: 'needs-review' as const,
      message:
        'No detectable bypass mechanism (no main/landmarks/heading outline/skip link) — confirm manually.',
      howToFix: 'Add a <main> landmark, a heading outline, or a skip link to the main content.',
      helpUrl: `${U}/bypass-blocks.html`,
    },
  ];
};

const GENERIC_NAMES = new Set([
  'click here',
  'here',
  'read more',
  'more',
  'learn more',
  'link',
  'button',
  'submit',
  'go',
  'ok',
  'details',
  'info',
  'more info',
  'continue',
  'next',
  'previous',
  'untitled',
  'title',
  'heading',
  'section',
  'image',
  'icon',
  'this',
  'this page',
  'read',
  'click',
]);

const nameEmptyOrGeneric: Rule = (root) => {
  const controls = Array.from(
    root.querySelectorAll(
      'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="tab"], [role="menuitem"]'
    )
  ).filter((el) => {
    const type = (el.getAttribute('type') ?? '').toLowerCase();
    if (el.tagName.toLowerCase() === 'input' && SKIP_INPUT_TYPES.has(type)) return false;
    return !el.hasAttribute('disabled') && !isHidden(el);
  });
  const all = [...controls, ...headings(root)];
  return all
    .map((el) => ({ el, name: resolveName(el, root) }))
    .filter(({ name }) => {
      const norm = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
      return norm === '' || GENERIC_NAMES.has(norm);
    })
    .map(({ el, name }) => ({
      el,
      ruleId: 'name-empty-or-generic',
      sc: '2.4.6',
      level: 'AA' as const,
      impact: 'moderate' as const,
      confidence: 'needs-review' as const,
      message: `Empty or generic accessible name${name ? ` (“${name}”)` : ''} — review whether it is descriptive.`,
      howToFix: 'Give the element a specific, descriptive name.',
      helpUrl: `${U}/headings-and-labels.html`,
    }));
};

// ---------------------------------------------------------------------------
// SC 2.4.4 / 2.1.1 — links & interaction
// ---------------------------------------------------------------------------

const linkEmptyName: Rule = (root) =>
  Array.from(root.querySelectorAll('a[href]'))
    .filter((el) => !isHidden(el) && getRole(el) === 'link' && resolveName(el, root) === '')
    .map((el) => ({
      el,
      ruleId: 'link-empty-name',
      sc: '4.1.2',
      level: 'A' as const,
      impact: 'serious' as const,
      confidence: 'violation' as const,
      message: 'Link has no accessible name — it cannot be identified or announced.',
      howToFix:
        'Add visible text, an aria-label, an sr-only span, or img alt / svg title inside the link.',
      helpUrl: `${U}/name-role-value.html`,
    }));

const GENERIC_LINKS = new Set([
  'click here',
  'read more',
  'here',
  'link',
  'more',
  'learn more',
  'details',
  'this',
  'this page',
  'continue',
  'go',
  'read',
  'more info',
  'click',
]);

const linkGenericText: Rule = (root) =>
  Array.from(root.querySelectorAll('a[href]'))
    .filter((el) => {
      if (isHidden(el)) return false;
      // An author-supplied aria label gives context — do not second-guess it.
      if (el.getAttribute('aria-label')?.trim() || el.getAttribute('aria-labelledby')?.trim()) {
        return false;
      }
      const name = (getAccessibleName(el, root) ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
      return GENERIC_LINKS.has(name);
    })
    .map((el) => ({
      el,
      ruleId: 'link-generic-text',
      sc: '2.4.4',
      level: 'A' as const,
      impact: 'moderate' as const,
      confidence: 'needs-review' as const,
      message: `Link text is generic (“${textOf(el)}”) — its purpose may be unclear out of context.`,
      howToFix: 'Make the link text describe its destination, or add context via aria-label.',
      helpUrl: `${U}/link-purpose-in-context.html`,
    }));

const WIDGET_ROLES = new Set([
  'button',
  'link',
  'checkbox',
  'radio',
  'switch',
  'tab',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'slider',
  'spinbutton',
  'textbox',
  'combobox',
  'searchbox',
  'treeitem',
]);

const clickHandlerNotFocusable: Rule = (root) =>
  Array.from(root.querySelectorAll('[role]'))
    .filter((el) => {
      const role = getRole(el);
      return role !== null && WIDGET_ROLES.has(role) && effectiveTabIndex(el) === null;
    })
    .map((el) => ({
      el,
      ruleId: 'click-handler-not-focusable',
      sc: '2.1.1',
      level: 'A' as const,
      impact: 'serious' as const,
      confidence: 'violation' as const,
      message:
        'Element has an interactive ARIA role but cannot receive keyboard focus (no tabindex, not natively focusable).',
      howToFix: 'Add tabindex="0", or use a natively-focusable element (<button>, <a href>).',
      helpUrl: `${U}/keyboard.html`,
    }));

const onclickNotFocusable: Rule = (root) =>
  Array.from(root.querySelectorAll('[onclick]'))
    .filter((el) => {
      if (effectiveTabIndex(el) !== null) return false;
      // A focusable descendant means the click is likely delegated to it.
      if (el.querySelector('a[href], button, input, select, textarea, [tabindex]')) return false;
      if (el.tagName.toLowerCase() === 'label') return false;
      return true;
    })
    .map((el) => ({
      el,
      ruleId: 'onclick-not-focusable',
      sc: '2.1.1',
      level: 'A' as const,
      impact: 'serious' as const,
      confidence: 'needs-review' as const,
      message:
        'Element has an inline onclick but no keyboard focus and no focusable child — verify it is reachable. (addEventListener handlers are invisible to static analysis.)',
      howToFix:
        'Make the clickable element focusable and operable by keyboard (a real button, or tabindex + key handlers).',
      helpUrl: `${U}/keyboard.html`,
    }));

const focusIndicatorRemoved: Rule = (root, env) =>
  Array.from(root.querySelectorAll('[style]'))
    .filter((el) => {
      const tab = effectiveTabIndex(el);
      if (tab === null || tab < 0 || !env.isRendered(el)) return false;
      const style = (el.getAttribute('style') ?? '').toLowerCase();
      const killsOutline =
        /outline\s*:\s*(none|0(px)?)|outline-style\s*:\s*none|outline-width\s*:\s*0/.test(style);
      if (!killsOutline) return false;
      // A visible replacement (box-shadow / border) is a plausible focus style.
      return !/box-shadow\s*:/.test(style) && !/border\s*:/.test(style);
    })
    .map((el) => ({
      el,
      ruleId: 'focus-indicator-removed',
      sc: '2.4.7',
      level: 'AA' as const,
      impact: 'moderate' as const,
      confidence: 'needs-review' as const,
      message:
        'Focusable element removes its outline inline with no detectable replacement — author CSS and :focus-visible are invisible here; confirm focus visibility manually.',
      howToFix: 'Keep a visible focus indicator (:focus-visible outline or box-shadow).',
      helpUrl: `${U}/focus-visible.html`,
    }));

// ---------------------------------------------------------------------------
// SC 4.1.2 (ARIA) + 3.1.x
// ---------------------------------------------------------------------------

const VALID_ROLES = new Set([
  'alert',
  'alertdialog',
  'application',
  'article',
  'banner',
  'blockquote',
  'button',
  'caption',
  'cell',
  'checkbox',
  'code',
  'columnheader',
  'combobox',
  'complementary',
  'contentinfo',
  'definition',
  'deletion',
  'dialog',
  'directory',
  'document',
  'emphasis',
  'feed',
  'figure',
  'form',
  'generic',
  'grid',
  'gridcell',
  'group',
  'heading',
  'img',
  'insertion',
  'link',
  'list',
  'listbox',
  'listitem',
  'log',
  'main',
  'marquee',
  'math',
  'menu',
  'menubar',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'meter',
  'navigation',
  'none',
  'note',
  'option',
  'paragraph',
  'presentation',
  'progressbar',
  'radio',
  'radiogroup',
  'region',
  'row',
  'rowgroup',
  'rowheader',
  'scrollbar',
  'search',
  'searchbox',
  'separator',
  'slider',
  'spinbutton',
  'status',
  'strong',
  'subscript',
  'superscript',
  'switch',
  'tab',
  'table',
  'tablist',
  'tabpanel',
  'term',
  'textbox',
  'time',
  'timer',
  'toolbar',
  'tooltip',
  'tree',
  'treegrid',
  'treeitem',
]);

function roleTokens(el: Element): string[] {
  return (el.getAttribute('role') ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
}

const ariaRoleInvalid: Rule = (root) =>
  Array.from(root.querySelectorAll('[role]'))
    .filter((el) => {
      const tokens = roleTokens(el);
      if (tokens.length === 0) return false;
      return !tokens.some((t) => VALID_ROLES.has(t) || /^(doc|graphics)-[a-z]+$/.test(t));
    })
    .map((el) => ({
      el,
      ruleId: 'aria-role-invalid',
      sc: '4.1.2',
      level: 'A' as const,
      impact: 'serious' as const,
      confidence: 'violation' as const,
      message: `role="${el.getAttribute('role') ?? ''}" is not a valid ARIA role.`,
      howToFix: "Use a valid ARIA role, or remove the role to keep the element's native semantics.",
      helpUrl: `${U}/name-role-value.html`,
    }));

const REQUIRED_ARIA: Record<string, string[]> = {
  checkbox: ['aria-checked'],
  radio: ['aria-checked'],
  switch: ['aria-checked'],
  menuitemcheckbox: ['aria-checked'],
  menuitemradio: ['aria-checked'],
  combobox: ['aria-expanded'],
  slider: ['aria-valuenow'],
  spinbutton: ['aria-valuenow'],
  scrollbar: ['aria-controls', 'aria-valuenow'],
};

const ariaRequiredAttr: Rule = (root) => {
  const out: RawFinding[] = [];
  for (const el of Array.from(root.querySelectorAll('[role]'))) {
    const role = roleTokens(el).find((t) => VALID_ROLES.has(t));
    if (role === undefined) continue;
    const required = REQUIRED_ARIA[role];
    if (!required) continue;
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') ?? '').toLowerCase();
    // Native owners already expose the state.
    if (
      required.includes('aria-checked') &&
      tag === 'input' &&
      (type === 'checkbox' || type === 'radio')
    ) {
      continue;
    }
    if (required.includes('aria-expanded') && tag === 'select') continue;
    const missing = required.filter((a) => !el.hasAttribute(a));
    if (missing.length > 0) {
      out.push({
        el,
        ruleId: 'aria-required-attr',
        sc: '4.1.2',
        level: 'A',
        impact: 'serious',
        confidence: 'violation',
        message: `role="${role}" is missing required ARIA attribute(s): ${missing.join(', ')}.`,
        howToFix: `Add ${missing.join(' and ')} to the element.`,
        helpUrl: `${U}/name-role-value.html`,
      });
    }
  }
  return out;
};

function idList(el: Element, attr: string): string[] {
  const v = el.getAttribute(attr);
  return v === null || v.trim() === '' ? [] : v.trim().split(/\s+/);
}

const ariaRefBroken: Rule = (root) => {
  const out: RawFinding[] = [];
  const check = (el: Element, attr: string, confidence: FindingConfidence): void => {
    const missing = idList(el, attr).filter((id) => root.getElementById(id) === null);
    if (missing.length > 0) {
      out.push({
        el,
        ruleId: 'aria-ref-broken',
        sc: '4.1.2',
        level: 'A',
        impact: 'serious',
        confidence,
        message: `${attr}="${el.getAttribute(attr) ?? ''}" points to id(s) that do not exist (${missing.join(', ')}).`,
        howToFix: `Point ${attr} at the id of an element that exists on the page.`,
        helpUrl: `${U}/name-role-value.html`,
      });
    }
  };
  for (const el of Array.from(root.querySelectorAll('[aria-labelledby]')))
    check(el, 'aria-labelledby', 'violation');
  for (const el of Array.from(root.querySelectorAll('label[for], output[for]')))
    check(el, 'for', 'violation');
  for (const el of Array.from(root.querySelectorAll('[aria-describedby]')))
    check(el, 'aria-describedby', 'needs-review');
  return out;
};

const ariaRefDuplicateId: Rule = (root) => {
  const counts = new Map<string, number>();
  for (const el of Array.from(root.querySelectorAll('[id]'))) {
    const id = (el.getAttribute('id') ?? '').trim();
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const referenced = new Set<string>();
  const refAttrs = [
    'aria-labelledby',
    'aria-describedby',
    'aria-controls',
    'aria-owns',
    'aria-activedescendant',
  ];
  for (const attr of refAttrs) {
    for (const el of Array.from(root.querySelectorAll(`[${attr}]`))) {
      for (const id of idList(el, attr)) referenced.add(id);
    }
  }
  for (const el of Array.from(root.querySelectorAll('label[for], output[for]'))) {
    for (const id of idList(el, 'for')) referenced.add(id);
  }
  const out: RawFinding[] = [];
  for (const id of referenced) {
    if ((counts.get(id) ?? 0) > 1) {
      const el = root.getElementById(id) ?? root.documentElement;
      out.push({
        el,
        ruleId: 'aria-ref-duplicate-id',
        sc: '4.1.2',
        level: 'A',
        impact: 'serious',
        confidence: 'violation',
        message: `id="${id}" appears more than once and is targeted by an ARIA/for reference — the reference is ambiguous.`,
        howToFix: 'Make the referenced id unique on the page.',
        helpUrl: `${U}/name-role-value.html`,
      });
    }
  }
  return out;
};

function stripPrivateUse(tag: string): string {
  return /^(x|i)-/i.test(tag) ? tag.slice(2) : tag;
}

const htmlLangMissing: Rule = (root) => {
  const html = root.documentElement;
  if (html.hasAttribute('lang') || html.hasAttribute('xml:lang')) return [];
  return [
    {
      el: html,
      ruleId: 'html-lang-missing',
      sc: '3.1.1',
      level: 'A' as const,
      impact: 'serious' as const,
      confidence: 'violation' as const,
      message: '<html> has no lang attribute.',
      howToFix: 'Add lang to <html>, e.g. <html lang="en">.',
      helpUrl: `${U}/language-of-page.html`,
    },
  ];
};

function isInvalidLang(value: string): boolean {
  const v = value.trim();
  if (v === '' || /\s/.test(v) || v.includes('_')) return true;
  const primary = stripPrivateUse(v).split('-')[0] ?? '';
  return !/^[a-zA-Z]{2,8}$/.test(primary);
}

const htmlLangInvalid: Rule = (root) => {
  const html = root.documentElement;
  const lang = html.getAttribute('lang');
  if (lang === null || !isInvalidLang(lang)) return [];
  return [
    {
      el: html,
      ruleId: 'html-lang-invalid',
      sc: '3.1.1',
      level: 'A' as const,
      impact: 'moderate' as const,
      confidence: 'violation' as const,
      message: `<html lang="${lang}"> is not a valid language tag.`,
      howToFix: 'Use a valid BCP-47 tag, e.g. lang="en" or lang="en-GB".',
      helpUrl: `${U}/language-of-page.html`,
    },
  ];
};

const langPartInvalid: Rule = (root) =>
  Array.from(root.querySelectorAll('[lang]'))
    .filter((el) => el !== root.documentElement && isInvalidLang(el.getAttribute('lang') ?? ''))
    .map((el) => ({
      el,
      ruleId: 'lang-part-invalid',
      sc: '3.1.2',
      level: 'AA' as const,
      impact: 'moderate' as const,
      confidence: 'needs-review' as const,
      message: `lang="${el.getAttribute('lang') ?? ''}" on this passage is not a valid BCP-47 tag. (Untagged foreign passages need manual review.)`,
      howToFix: 'Use a valid BCP-47 language tag on the passage.',
      helpUrl: `${U}/language-of-parts.html`,
    }));

const statusMessageNotLive: Rule = (root) => {
  const tokens = new Set(['toast', 'snackbar', 'notification', 'flash', 'alert-message']);
  return Array.from(root.querySelectorAll('[class], [id]'))
    .filter((el) => {
      const segs = `${el.className} ${el.id}`.toLowerCase().split(/[\s-]+/);
      if (!segs.some((s) => tokens.has(s))) return false;
      if (el.closest('[role="alert"], [role="status"], [role="log"], [aria-live]')) return false;
      return true;
    })
    .map((el) => ({
      el,
      ruleId: 'status-message-not-live',
      sc: '4.1.3',
      level: 'AA' as const,
      impact: 'moderate' as const,
      confidence: 'needs-review' as const,
      message:
        'Looks like a status/toast surface but is not a live region — confirm it announces runtime status text.',
      howToFix: 'Add role="status" (polite) or role="alert" (assertive), or aria-live.',
      helpUrl: `${U}/status-messages.html`,
    }));
};

// ---------------------------------------------------------------------------
// SC 1.4.3 / 1.4.6 — contrast (reuses the oracle-verified contrast.ts)
// ---------------------------------------------------------------------------

function hasDirectText(el: Element): boolean {
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3 && (node.textContent ?? '').trim() !== '') return true;
  }
  return false;
}

function backgroundLayers(el: Element, env: A11yEnv): BackgroundLayer[] {
  const layers: BackgroundLayer[] = [];
  for (let node: Element | null = el; node !== null; node = node.parentElement) {
    const cs = env.styleOf(node);
    layers.push({
      color: parseColor(cs.backgroundColor),
      opacity: parseFloat(cs.opacity) || 1,
      hasImage: cs.backgroundImage !== 'none' && cs.backgroundImage !== '',
    });
  }
  return layers;
}

const POSITIONED = new Set(['absolute', 'fixed', 'sticky']);

function contrastRule(level: 'AA' | 'AAA'): Rule {
  return (root, env) => {
    const out: RawFinding[] = [];
    for (const el of Array.from(root.querySelectorAll('*'))) {
      if (!hasDirectText(el) || isHidden(el) || !env.isRendered(el)) continue;
      if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') continue;
      const cs = env.styleOf(el);
      const fg = parseColor(cs.color);
      // Unmeasurable text (non-sRGB, transparent, painted fill) → never a hard fail.
      const painted =
        cs.getPropertyValue('-webkit-background-clip') === 'text' || cs.backgroundClip === 'text';
      const fontSize = parseFloat(cs.fontSize) || 16;
      const weight = cs.fontWeight || '400';

      if (fg === null || fg.a === 0 || painted) {
        if (fg === null && (cs.color ?? '').trim() !== '') {
          out.push(
            reviewContrast(
              el,
              level,
              'Text colour is not sRGB-parseable — check contrast manually.'
            )
          );
        }
        continue;
      }

      const eff = resolveEffectiveBackground(backgroundLayers(el, env));
      const fgOpaque: Rgba = fg.a < 1 ? { ...compositeOver(fg, eff.rgb), a: 1 } : fg;
      const v = contrastVerdict(fgOpaque, eff.rgb, fontSize, weight);
      const fails =
        level === 'AA'
          ? v.isLargeText
            ? !v.aaLarge
            : !v.aaNormal
          : v.isLargeText
            ? !v.aaaLarge
            : !v.aaaNormal;
      if (!fails) continue;

      const positioned = (() => {
        for (let n: Element | null = el; n !== null; n = n.parentElement) {
          if (POSITIONED.has(env.styleOf(n).position)) return true;
        }
        return false;
      })();
      const confidence: FindingConfidence =
        eff.warnings.length === 0 && !eff.assumedWhite && !positioned
          ? 'violation'
          : 'needs-review';
      const size = v.isLargeText ? 'large' : 'normal';
      const threshold =
        level === 'AA' ? (v.isLargeText ? '3' : '4.5') : v.isLargeText ? '4.5' : '7';
      out.push({
        el,
        ruleId: level === 'AA' ? 'contrast-text-aa' : 'contrast-text-aaa',
        sc: level === 'AA' ? '1.4.3' : '1.4.6',
        level,
        impact: level === 'AA' ? 'serious' : 'moderate',
        confidence,
        message: `Text contrast ${v.ratio}:1 is below the ${level} minimum of ${threshold}:1 for ${size} text.`,
        howToFix: 'Darken the text or lighten the background until the ratio meets the threshold.',
        helpUrl: `${U}/${level === 'AA' ? 'contrast-minimum' : 'contrast-enhanced'}.html`,
      });
    }
    return out;
  };
}

function reviewContrast(el: Element, level: 'AA' | 'AAA', message: string): RawFinding {
  return {
    el,
    ruleId: level === 'AA' ? 'contrast-text-aa' : 'contrast-text-aaa',
    sc: level === 'AA' ? '1.4.3' : '1.4.6',
    level,
    impact: 'serious',
    confidence: 'needs-review',
    message,
    howToFix: 'Verify the text/background contrast manually.',
    helpUrl: `${U}/${level === 'AA' ? 'contrast-minimum' : 'contrast-enhanced'}.html`,
  };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/** Rules that may report a rule-level PASS (all are `violation`-only, no heuristics). */
const PASSABLE = new Set([
  'img-alt',
  'input-image-alt',
  'area-alt',
  'svg-img-alt',
  'form-control-no-accessible-name',
  'heading-empty',
  'document-title-missing',
  'link-empty-name',
  'aria-role-invalid',
  'aria-required-attr',
  'aria-ref-duplicate-id',
  'html-lang-missing',
  'html-lang-invalid',
]);

interface RegisteredRule {
  id: string;
  level: WcagLevel;
  run: Rule;
}

const RULES: RegisteredRule[] = [
  { id: 'img-alt', level: 'A', run: imgAlt },
  { id: 'input-image-alt', level: 'A', run: inputImageAlt },
  { id: 'area-alt', level: 'A', run: areaAlt },
  { id: 'svg-img-alt', level: 'A', run: svgImgAlt },
  { id: 'decorative-image-redundant-label', level: 'A', run: decorativeImageRedundantLabel },
  { id: 'form-control-no-accessible-name', level: 'A', run: formControlNoName },
  { id: 'input-missing-autocomplete', level: 'AA', run: inputMissingAutocomplete },
  { id: 'required-field-no-visible-label', level: 'A', run: requiredFieldNoLabel },
  { id: 'table-missing-headers', level: 'A', run: tableMissingHeaders },
  { id: 'heading-skipped-level', level: 'A', run: headingSkippedLevel },
  { id: 'heading-empty', level: 'A', run: headingEmpty },
  { id: 'document-title-missing', level: 'A', run: documentTitleMissing },
  { id: 'bypass-blocks-missing', level: 'A', run: bypassBlocksMissing },
  { id: 'name-empty-or-generic', level: 'AA', run: nameEmptyOrGeneric },
  { id: 'link-empty-name', level: 'A', run: linkEmptyName },
  { id: 'link-generic-text', level: 'A', run: linkGenericText },
  { id: 'click-handler-not-focusable', level: 'A', run: clickHandlerNotFocusable },
  { id: 'onclick-not-focusable', level: 'A', run: onclickNotFocusable },
  { id: 'focus-indicator-removed', level: 'AA', run: focusIndicatorRemoved },
  { id: 'aria-role-invalid', level: 'A', run: ariaRoleInvalid },
  { id: 'aria-required-attr', level: 'A', run: ariaRequiredAttr },
  { id: 'aria-ref-broken', level: 'A', run: ariaRefBroken },
  { id: 'aria-ref-duplicate-id', level: 'A', run: ariaRefDuplicateId },
  { id: 'html-lang-missing', level: 'A', run: htmlLangMissing },
  { id: 'html-lang-invalid', level: 'A', run: htmlLangInvalid },
  { id: 'lang-part-invalid', level: 'AA', run: langPartInvalid },
  { id: 'status-message-not-live', level: 'AA', run: statusMessageNotLive },
  { id: 'contrast-text-aa', level: 'AA', run: contrastRule('AA') },
  { id: 'contrast-text-aaa', level: 'AAA', run: contrastRule('AAA') },
];

/** Which levels to include given the requested target (A ⊂ AA ⊂ AAA). */
function levelsFor(target: WcagLevel): Set<WcagLevel> {
  if (target === 'A') return new Set(['A']);
  if (target === 'AA') return new Set(['A', 'AA']);
  return new Set(['A', 'AA', 'AAA']);
}

/**
 * Run the catalogue against `root`. Returns findings (each tied to a retained
 * element by index), the elements, and the rule ids that passed.
 */
export function runA11yRules(
  root: Document,
  env: A11yEnv
): { findings: A11yFinding[]; elements: Element[]; passedRules: string[] } {
  const levels = levelsFor(env.level);
  const elements: Element[] = [];
  const elementIndex = new Map<Element, number>();
  const findings: A11yFinding[] = [];
  const passedRules: string[] = [];

  for (const rule of RULES) {
    if (!levels.has(rule.level)) continue;
    const raw = rule.run(root, env);
    if (raw.length === 0 && PASSABLE.has(rule.id)) passedRules.push(rule.id);
    for (const f of raw) {
      let index = elementIndex.get(f.el);
      if (index === undefined) {
        index = elements.length;
        elements.push(f.el);
        elementIndex.set(f.el, index);
      }
      findings.push({
        ruleId: f.ruleId,
        sc: f.sc,
        level: f.level,
        impact: f.impact,
        confidence: f.confidence,
        message: f.message,
        howToFix: f.howToFix,
        helpUrl: f.helpUrl,
        target: describeTarget(f.el, root),
        index,
      });
    }
  }

  return { findings, elements, passedRules };
}

/** The honest coverage note shown in the UI. */
export const A11Y_COVERAGE_NOTE =
  'Automated checks catch only a minority of WCAG issues — roughly 30–40% in the field (Deque’s axe reaches ~57% under ideal conditions). A clean scan is not proof of conformance; the needs-review items and everything not machine-detectable still require a manual audit.';

export type { A11yReport };
