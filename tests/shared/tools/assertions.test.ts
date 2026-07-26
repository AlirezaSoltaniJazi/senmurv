import { describe, expect, it } from 'vitest';
import { buildSizeAssertions } from '@/shared/tools/assertions';
import type { BoxModel } from '@/shared/types';

// border box 320×180, content box 286×146 — they differ by (padding + border),
// which is exactly the confusion this module exists to prevent.
const BOX: BoxModel = {
  content: { width: 286, height: 146 },
  padding: { top: 16, right: 16, bottom: 16, left: 16 },
  border: { top: 1, right: 1, bottom: 1, left: 1 },
  margin: { top: 0, right: 24, bottom: 0, left: 24 },
  borderBox: { width: 320, height: 180 },
  marginBox: { width: 368, height: 180 },
  transform: null,
};

describe('buildSizeAssertions', () => {
  const assertions = buildSizeAssertions(BOX, '#el');
  const find = (label: string) => assertions.find((a) => a.label === label)?.code ?? '';

  it('feeds the CONTENT box to CSS-property assertions', () => {
    const pw = find('Playwright — content box');
    expect(pw).toContain("toHaveCSS('width', '286px')");
    expect(pw).toContain("toHaveCSS('height', '146px')");
    // …and never the border-box number.
    expect(pw).not.toContain('320px');
  });

  it('feeds the BORDER box to bounding-box assertions', () => {
    const pw = find('Playwright — bounding box');
    expect(pw).toContain('toBeCloseTo(320)');
    expect(pw).toContain('toBeCloseTo(180)');
    // …and never the content-box number.
    expect(pw).not.toContain('286');
  });

  it('gets the Cypress content-box vs outer-size split right', () => {
    expect(find('Cypress — content box')).toContain("have.css', 'width', '286px'");
    expect(find('Cypress — bounding box')).toContain("invoke('outerWidth').should('eq', 320)");
  });

  it('covers all five frameworks for the bounding-box form', () => {
    const boxFws = assertions
      .filter((a) => a.label.endsWith('bounding box'))
      .map((a) => a.framework);
    expect(new Set(boxFws)).toEqual(
      new Set(['playwright', 'cypress', 'wdio', 'selenium', 'robot'])
    );
  });
});
