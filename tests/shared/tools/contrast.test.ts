import { describe, expect, it } from 'vitest';
import {
  compositeOver,
  contrastRatio,
  contrastVerdict,
  isLargeText,
  LARGE_TEXT_BOLD_PX,
  LARGE_TEXT_PX,
  normalizeWeight,
  relativeLuminance,
} from '@/shared/tools/contrast';

// Oracle values computed independently to 50-digit precision (colour-math
// workflow). These must match axe/Lighthouse; a wrong threshold flips a verdict.
const white = { r: 255, g: 255, b: 255 };
const black = { r: 0, g: 0, b: 0 };

describe('relativeLuminance', () => {
  it('is exactly 1 for white and 0 for black', () => {
    expect(relativeLuminance(white)).toBe(1);
    expect(relativeLuminance(black)).toBe(0);
  });
});

describe('contrastRatio', () => {
  it('is exactly 21 for black on white', () => {
    expect(contrastRatio(black, white)).toBeCloseTo(21, 10);
  });

  it('is exactly 1 for a colour on itself', () => {
    expect(contrastRatio({ r: 128, g: 128, b: 128 }, { r: 128, g: 128, b: 128 })).toBe(1);
  });

  it('is symmetric (order of the two colours does not matter)', () => {
    expect(contrastRatio(black, white)).toBe(contrastRatio(white, black));
  });

  it('pins the canonical AA boundary: #767676 passes, #777777 fails', () => {
    const c767 = contrastRatio({ r: 0x76, g: 0x76, b: 0x76 }, white);
    const c777 = contrastRatio({ r: 0x77, g: 0x77, b: 0x77 }, white);
    expect(c767).toBeCloseTo(4.5422, 3);
    expect(c777).toBeCloseTo(4.4781, 3);
    expect(c767 >= 4.5).toBe(true); // passes AA normal
    expect(c777 >= 4.5).toBe(false); // fails AA normal
  });

  it('pins the AAA boundary at #595959 on white (~7.0047)', () => {
    expect(contrastRatio({ r: 0x59, g: 0x59, b: 0x59 }, white)).toBeCloseTo(7.0047, 3);
  });
});

describe('compositeOver', () => {
  it('mixes 50% black over white to 128 (127.5 rounds up)', () => {
    expect(compositeOver({ r: 0, g: 0, b: 0, a: 0.5 }, white)).toEqual({ r: 128, g: 128, b: 128 });
  });

  it('mixes 50% white over black to 128', () => {
    expect(compositeOver({ r: 255, g: 255, b: 255, a: 0.5 }, black)).toEqual({
      r: 128,
      g: 128,
      b: 128,
    });
  });

  it('leaves the backdrop unchanged at zero alpha', () => {
    expect(compositeOver({ r: 0, g: 0, b: 0, a: 0 }, { r: 200, g: 100, b: 50 })).toEqual({
      r: 200,
      g: 100,
      b: 50,
    });
  });
});

describe('normalizeWeight', () => {
  it('maps keywords and passes numbers through', () => {
    expect(normalizeWeight('bold')).toBe(700);
    expect(normalizeWeight('normal')).toBe(400);
    expect(normalizeWeight('700')).toBe(700);
    expect(normalizeWeight(600)).toBe(600);
    expect(normalizeWeight('oblique')).toBe(400); // unknown → default
  });
});

describe('isLargeText', () => {
  it('uses 24px for normal weight and 18.66px for bold', () => {
    expect(LARGE_TEXT_PX).toBe(24);
    expect(LARGE_TEXT_BOLD_PX).toBeCloseTo(18.6667, 3);
  });

  it('classifies the boundary cases', () => {
    expect(isLargeText(16, 400)).toBe(false);
    expect(isLargeText(24, 400)).toBe(true);
    expect(isLargeText(23.9, 400)).toBe(false);
    expect(isLargeText(18.66, 700)).toBe(false); // just under the bold threshold
    expect(isLargeText(18.67, 700)).toBe(true);
    expect(isLargeText(18.67, 400)).toBe(false); // big enough only if bold
    expect(isLargeText(19, 'bold')).toBe(true);
  });
});

describe('contrastVerdict', () => {
  it('grades #767676 on white as AA-normal pass, AAA-normal fail', () => {
    const v = contrastVerdict({ r: 0x76, g: 0x76, b: 0x76 }, white, 16, 400);
    expect(v.ratio).toBeCloseTo(4.54, 2);
    expect(v.aaNormal).toBe(true);
    expect(v.aaLarge).toBe(true);
    expect(v.aaaNormal).toBe(false);
    expect(v.aaaLarge).toBe(true);
    expect(v.isLargeText).toBe(false);
  });

  it('grades #777777 on white as AA-normal fail (the exact one-hex-off boundary)', () => {
    const v = contrastVerdict({ r: 0x77, g: 0x77, b: 0x77 }, white, 16, 400);
    expect(v.aaNormal).toBe(false);
    expect(v.aaLarge).toBe(true);
  });
});
