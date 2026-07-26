import { describe, expect, it } from 'vitest';
import {
  fontShorthand,
  isGenericFamily,
  normalizeWeight,
  parseFontStack,
  pxToPt,
  pxToRem,
  quoteFamily,
  resolveLineHeight,
  resolveRenderedFace,
  weightName,
} from '@/shared/tools/typography';
import type { FaceProbes } from '@/shared/tools/typography';

describe('parseFontStack', () => {
  it('splits, unquotes and trims a font-family value', () => {
    expect(parseFontStack('"Helvetica Neue", Arial, sans-serif')).toEqual([
      'Helvetica Neue',
      'Arial',
      'sans-serif',
    ]);
    expect(parseFontStack("'Times New Roman', serif")).toEqual(['Times New Roman', 'serif']);
  });
});

describe('quoteFamily', () => {
  it('leaves generics and simple names unquoted, quotes the rest', () => {
    expect(quoteFamily('sans-serif')).toBe('sans-serif');
    expect(quoteFamily('Arial')).toBe('Arial');
    expect(quoteFamily('Helvetica Neue')).toBe('Helvetica Neue');
    expect(quoteFamily('Font "X"')).toBe('"Font \\"X\\""');
  });
});

describe('weight', () => {
  it('normalises keywords to numbers', () => {
    expect(normalizeWeight('bold')).toBe(700);
    expect(normalizeWeight('normal')).toBe(400);
    expect(normalizeWeight('600')).toBe(600);
    expect(normalizeWeight(500)).toBe(500);
  });

  it('names exact and in-between weights', () => {
    expect(weightName(400)).toBe('Regular');
    expect(weightName('bold')).toBe('Bold');
    expect(weightName(650)).toBe('Bold (650)'); // 650 rounds to 700 → Bold
  });
});

describe('unit conversions', () => {
  it('px → pt', () => {
    expect(pxToPt(16)).toBe(12); // 16 * 72/96
    expect(pxToPt(24)).toBe(18);
  });

  it('px → rem relative to root', () => {
    expect(pxToRem(24, 16)).toBe(1.5);
    expect(pxToRem(16, 16)).toBe(1);
  });
});

describe('resolveLineHeight', () => {
  it('handles a px computed value (Chrome shape)', () => {
    expect(resolveLineHeight('24px', 16)).toEqual({ px: 24, ratio: 1.5 });
  });

  it('handles a unitless value (happy-dom / authored shape)', () => {
    expect(resolveLineHeight('1.5', 16)).toEqual({ px: 24, ratio: 1.5 });
  });

  it('returns nulls for normal', () => {
    expect(resolveLineHeight('normal', 16)).toEqual({ px: null, ratio: null });
  });
});

describe('resolveRenderedFace', () => {
  const probes = (renders: string[], web: string[]): FaceProbes => ({
    renders: (f) => renders.includes(f),
    hasWebFace: (f) => web.includes(f),
  });

  it('picks the first available family and classifies it as a web font', () => {
    const face = resolveRenderedFace(
      ['Inter', 'Arial', 'sans-serif'],
      probes(['Inter'], ['Inter'])
    );
    expect(face).toEqual({ family: 'Inter', source: 'web', src: null });
  });

  it('classifies an available non-@font-face family as local', () => {
    const face = resolveRenderedFace(['Arial', 'sans-serif'], probes(['Arial'], []));
    expect(face).toEqual({ family: 'Arial', source: 'local', src: null });
  });

  it('falls through unavailable families to the generic fallback', () => {
    const face = resolveRenderedFace(['Missing', 'AlsoGone', 'serif'], probes([], []));
    expect(face).toEqual({ family: 'serif', source: 'generic', src: null });
  });

  it('reports the first generic reached even before unavailable custom fonts', () => {
    const face = resolveRenderedFace(['sans-serif', 'Inter'], probes(['Inter'], ['Inter']));
    expect(face.source).toBe('generic'); // the browser stops at the first available family
  });
});

describe('fontShorthand', () => {
  it('builds a copy-ready CSS font shorthand', () => {
    expect(fontShorthand('italic', 700, 16, '24px', ['Helvetica Neue', 'sans-serif'])).toBe(
      'italic 700 16px/24px Helvetica Neue, sans-serif'
    );
  });

  it('omits normal style and weight 400', () => {
    expect(fontShorthand('normal', 400, 14, 'normal', ['Arial'])).toBe('14px Arial');
  });
});

describe('isGenericFamily', () => {
  it('recognises the CSS generics case-insensitively', () => {
    expect(isGenericFamily('SANS-SERIF')).toBe(true);
    expect(isGenericFamily('ui-monospace')).toBe(true);
    expect(isGenericFamily('Inter')).toBe(false);
  });
});
