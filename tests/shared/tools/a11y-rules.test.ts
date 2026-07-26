import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runA11yRules } from '@/shared/tools/a11y-rules';
import type { A11yEnv } from '@/shared/tools/a11y-rules';
import type { WcagLevel } from '@/shared/types';

function env(level: WcagLevel = 'AA'): A11yEnv {
  return { isRendered: () => true, styleOf: (el) => getComputedStyle(el), level };
}

/** Rule ids present in the findings for the current document body. */
function scan(level: WcagLevel = 'AA'): { count: (id: string) => number; ids: string[] } {
  const { findings } = runA11yRules(document, env(level));
  return {
    ids: findings.map((f) => f.ruleId),
    count: (id: string) => findings.filter((f) => f.ruleId === id).length,
  };
}

function mount(html: string): void {
  document.body.innerHTML = html;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.setAttribute('lang', 'en'); // valid by default
  const title =
    document.querySelector('title') ?? document.head.appendChild(document.createElement('title'));
  title.textContent = 'Test';
});
afterEach(() => {
  document.documentElement.setAttribute('lang', 'en');
});

describe('1.1.1 images', () => {
  it('flags img with no alt, but NOT alt="" or aria-labelled ones', () => {
    mount(
      '<img src="a.png"><figure><img src="b.png"><figcaption>cap</figcaption></figure><img src="c.png" alt=""><img src="d.png" alt="ok"><img src="e.png" aria-label="named">'
    );
    expect(scan().count('img-alt')).toBe(2); // only the two with a missing alt
  });

  it('flags input type=image and area without alt', () => {
    mount('<input type="image" src="go.png"><map><area href="/h"></map>');
    expect(scan().count('input-image-alt')).toBe(1);
    expect(scan().count('area-alt')).toBe(1);
  });

  it('flags svg[role=img] with no name, but not one with a <title>', () => {
    mount(
      '<svg role="img"><rect/></svg><svg role="img"><title>chart</title><rect/></svg><svg><rect/></svg>'
    );
    expect(scan().count('svg-img-alt')).toBe(1);
  });

  it('flags the contradictory decorative-image + aria-label as needs-review only', () => {
    mount('<img src="x.png" alt="" aria-label="flourish"><img src="y.png" alt="">');
    const s = scan();
    expect(s.count('decorative-image-redundant-label')).toBe(1);
    expect(s.count('img-alt')).toBe(0); // the plain alt="" is silent
  });
});

describe('forms', () => {
  it('flags a control with no accessible name (placeholder does not count)', () => {
    mount('<input placeholder="Email"><input aria-label="ok"><label>Name <input></label>');
    expect(scan().count('form-control-no-accessible-name')).toBe(1);
  });

  it('resolves a multi-token aria-labelledby (the critic must-fix)', () => {
    mount('<span id="a">First</span><span id="b">name</span><input aria-labelledby="a b">');
    expect(scan().count('form-control-no-accessible-name')).toBe(0);
  });

  it('flags a personal-data input missing autocomplete (needs-review)', () => {
    mount(
      '<label>Email <input type="email" name="email"></label><label>Search <input type="text" name="q"></label>'
    );
    expect(scan().count('input-missing-autocomplete')).toBe(1); // email only, not search
  });
});

describe('structure', () => {
  it('flags a ≥3×3 data table with no headers, but not a small or presentation table', () => {
    const big = '<table>' + '<tr><td>1</td><td>2</td><td>3</td></tr>'.repeat(3) + '</table>';
    mount(big + '<table role="presentation"><tr><td>x</td><td>y</td><td>z</td></tr></table>');
    expect(scan().count('table-missing-headers')).toBe(1);
  });

  it('flags a skipped heading level as needs-review', () => {
    mount('<h1>t</h1><h3>skipped</h3>');
    expect(scan().count('heading-skipped-level')).toBe(1);
  });

  it('flags an empty heading', () => {
    mount('<h2></h2><h2>ok</h2>');
    expect(scan().count('heading-empty')).toBe(1);
  });

  it('flags a missing/empty document title', () => {
    const title = document.querySelector('title');
    if (title) title.textContent = '';
    expect(scan().count('document-title-missing')).toBe(1);
  });
});

describe('links & interaction', () => {
  it('flags an empty-name link as 4.1.2, and a named one is fine', () => {
    mount('<a href="/x"></a><a href="/y">Home</a><a href="/z"><img src="i.png" alt="Icon"></a>');
    const { findings } = runA11yRules(document, env());
    const empty = findings.filter((f) => f.ruleId === 'link-empty-name');
    expect(empty).toHaveLength(1);
    expect(empty[0]?.sc).toBe('4.1.2'); // critic re-map
  });

  it('flags generic link text but not when aria-label adds context', () => {
    mount('<a href="/a">click here</a><a href="/b" aria-label="Read the Q3 report">click here</a>');
    expect(scan().count('link-generic-text')).toBe(1);
  });

  it('flags an interactive role that cannot receive focus (violation)', () => {
    mount('<div role="button">Go</div><div role="button" tabindex="0">Ok</div>');
    expect(scan().count('click-handler-not-focusable')).toBe(1);
  });
});

describe('ARIA', () => {
  it('flags an invalid role but not a valid or doc-* one', () => {
    mount('<div role="buton">x</div><div role="button">y</div><div role="doc-chapter">z</div>');
    expect(scan().count('aria-role-invalid')).toBe(1);
  });

  it('flags aria-labelledby/for pointing at a missing id, but not describedby-present', () => {
    mount(
      '<div aria-labelledby="nope">x</div><label for="gone">L</label><span id="real">r</span><div aria-labelledby="real">y</div>'
    );
    expect(scan().count('aria-ref-broken')).toBe(2);
  });

  it('flags a role=checkbox missing aria-checked, but skips a native checkbox', () => {
    mount('<div role="checkbox">x</div><input type="checkbox" role="checkbox">');
    expect(scan().count('aria-required-attr')).toBe(1);
  });

  it('flags a duplicate id only when it is referenced', () => {
    mount(
      '<span id="dup">a</span><span id="dup">b</span><div aria-labelledby="dup">x</div><span id="plain">c</span><span id="plain">d</span>'
    );
    expect(scan().count('aria-ref-duplicate-id')).toBe(1); // 'dup' referenced; 'plain' not
  });
});

describe('language', () => {
  it('flags a missing html lang', () => {
    document.documentElement.removeAttribute('lang');
    expect(scan().count('html-lang-missing')).toBe(1);
  });

  it('flags an invalid html lang but allows en-GB and x-klingon', () => {
    document.documentElement.setAttribute('lang', 'en_GB');
    expect(scan().count('html-lang-invalid')).toBe(1);
    document.documentElement.setAttribute('lang', 'en-GB');
    expect(scan().count('html-lang-invalid')).toBe(0);
    document.documentElement.setAttribute('lang', 'x-klingon');
    expect(scan().count('html-lang-invalid')).toBe(0);
  });
});

describe('contrast (reuses the oracle-verified contrast.ts)', () => {
  it('flags grey #999 on white as failing AA, and passes #595959', () => {
    mount(
      '<p style="color:#999999;background:#ffffff">low</p><p style="color:#595959;background:#ffffff">ok</p>'
    );
    expect(scan('AA').count('contrast-text-aa')).toBe(1);
  });

  it('registers the AAA rule only in an AAA scan', () => {
    // #767676 on white = 4.54 → passes AA (≥4.5) but fails AAA-normal (<7).
    mount('<p style="color:#767676;background:#ffffff">boundary</p>');
    expect(scan('AA').count('contrast-text-aa')).toBe(0); // passes AA
    expect(scan('AA').ids).not.toContain('contrast-text-aaa'); // AAA rule not run at AA
    expect(scan('AAA').count('contrast-text-aaa')).toBe(1); // fails AAA
  });
});

describe('runner', () => {
  it('reports rule-level passes only for violation rules, never heuristics', () => {
    mount('<img src="a.png" alt="ok"><a href="/x">Home</a>');
    const { passedRules } = runA11yRules(document, env());
    expect(passedRules).toContain('img-alt');
    expect(passedRules).not.toContain('name-empty-or-generic'); // needs-review never passes
    expect(passedRules).not.toContain('table-missing-headers');
  });

  it('ties each finding to a retained element by index', () => {
    mount('<img src="a.png"><input placeholder="x">');
    const { findings, elements } = runA11yRules(document, env());
    for (const f of findings) expect(elements[f.index]).toBeInstanceOf(Element);
  });
});
