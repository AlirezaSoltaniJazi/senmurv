import { FRAMEWORK_LABELS } from '@/shared/constants';
import { round } from '@/shared/tools/measure';
import type { BoxModel, Framework, SizeAssertion } from '@/shared/types';

/**
 * Copy-ready size assertions for a measured element — the module that turns a
 * measurement into something you paste into a test.
 *
 * THE BUG THIS EXISTS TO AVOID: a CSS-property assertion (`toHaveCSS('width')`,
 * `have.css`, `getCSSProperty`) reads the **content** box, while a bounding-box
 * assertion (`boundingBox()`, `getSize`, `outerWidth`, `getRect`) reads the
 * **border** box. They differ by exactly (padding + border). Emitting the
 * bounding-box number into a `toHaveCSS` is wrong on every element that has any
 * padding or border. So each assertion below is fed from the correct box, and
 * the exact strings are pinned by tests.
 */

function px(n: number): string {
  return `${round(n)}px`;
}

/** CSS-property (content-box) assertions, one per framework that supports them. */
function cssAssertions(box: BoxModel, selector: string): SizeAssertion[] {
  const { width, height } = box.content;
  const out: { framework: Framework; code: string }[] = [
    {
      framework: 'playwright',
      code: `await expect(page.locator('${selector}')).toHaveCSS('width', '${px(width)}');\nawait expect(page.locator('${selector}')).toHaveCSS('height', '${px(height)}');`,
    },
    {
      framework: 'cypress',
      code: `cy.get('${selector}').should('have.css', 'width', '${px(width)}').and('have.css', 'height', '${px(height)}');`,
    },
    {
      framework: 'wdio',
      code: `expect((await $('${selector}').getCSSProperty('width')).value).toBe('${px(width)}');`,
    },
  ];
  return out.map((a) => ({
    framework: a.framework,
    label: `${FRAMEWORK_LABELS[a.framework] ?? a.framework} — content box`,
    code: a.code,
  }));
}

/** Bounding-box (border-box) assertions, one per framework. */
function boxAssertions(box: BoxModel, selector: string): SizeAssertion[] {
  const { width, height } = box.borderBox;
  const out: { framework: Framework; code: string }[] = [
    {
      framework: 'playwright',
      code: `const box = await page.locator('${selector}').boundingBox();\nexpect(box?.width).toBeCloseTo(${round(width)});\nexpect(box?.height).toBeCloseTo(${round(height)});`,
    },
    {
      framework: 'cypress',
      code: `cy.get('${selector}').invoke('outerWidth').should('eq', ${round(width)});\ncy.get('${selector}').invoke('outerHeight').should('eq', ${round(height)});`,
    },
    {
      framework: 'wdio',
      code: `const size = await $('${selector}').getSize();\nexpect(size.width).toBe(${round(width)});\nexpect(size.height).toBe(${round(height)});`,
    },
    {
      framework: 'selenium',
      code: `const rect = await driver.findElement(By.css('${selector}')).getRect();\nassert.equal(rect.width, ${round(width)});\nassert.equal(rect.height, ${round(height)});`,
    },
    {
      framework: 'robot',
      code: `\${size}=    Get Element Size    css=${selector}\n# \${size} → { width: ${round(width)}, height: ${round(height)} }`,
    },
  ];
  return out.map((a) => ({
    framework: a.framework,
    label: `${FRAMEWORK_LABELS[a.framework] ?? a.framework} — bounding box`,
    code: a.code,
  }));
}

/**
 * All copy-ready assertions for a measured element: the content-box CSS checks
 * first (fed from `box.content`), then the border-box bounding-box checks (fed
 * from `box.borderBox`).
 */
export function buildSizeAssertions(box: BoxModel, selector: string): SizeAssertion[] {
  return [...cssAssertions(box, selector), ...boxAssertions(box, selector)];
}
