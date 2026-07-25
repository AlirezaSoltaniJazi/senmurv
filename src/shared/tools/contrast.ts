import type { ContrastVerdict, Rgba } from '@/shared/types';

/**
 * WCAG 2.x contrast — SHARED with the Accessibility tool. Nothing else may
 * reimplement relative luminance; both tools must agree with axe/Lighthouse.
 *
 * There is ONE sRGB threshold, 0.04045 (WCAG 2.1/2.2 normative). WCAG Note 2
 * says the pre-2021 value 0.03928 "has no practical effect" — do not introduce a
 * second threshold. Alpha compositing is done in GAMMA-encoded sRGB (browsers
 * do not linearise CSS compositing); linearisation happens ONLY inside
 * `relativeLuminance`. Getting either backwards can flip an AA verdict.
 */

/** Large text per WCAG 1.4.3: ≥18pt (24px), or ≥14pt bold. 1pt = 96/72 px. */
export const LARGE_TEXT_PX = (18 * 96) / 72; // 24
export const LARGE_TEXT_BOLD_PX = (14 * 96) / 72; // 18.666…

/** Linearise one gamma-encoded sRGB channel (0-255 → 0-1 linear). */
function linearize(channel255: number): number {
  const c = channel255 / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of an opaque sRGB colour. Ignores alpha — composite first. */
export function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  return 0.2126 * linearize(rgb.r) + 0.7152 * linearize(rgb.g) + 0.0722 * linearize(rgb.b);
}

/** Contrast ratio between two opaque colours: (Llight + .05) / (Ldark + .05), 1..21. */
export function contrastRatio(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number }
): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Composite a straight-alpha colour over an opaque backdrop, in gamma space.
 * result = fg·a + bg·(1-a) per channel, rounded to the nearest 0-255 integer.
 */
export function compositeOver(
  fg: Rgba,
  bg: { r: number; g: number; b: number }
): {
  r: number;
  g: number;
  b: number;
} {
  const mix = (f: number, b: number): number => Math.round(f * fg.a + b * (1 - fg.a));
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b) };
}

/** Normalise a CSS font-weight (keyword or number) to a numeric weight. */
export function normalizeWeight(weight: string | number): number {
  if (typeof weight === 'number') return weight;
  if (weight === 'bold') return 700;
  if (weight === 'normal') return 400;
  const n = parseInt(weight, 10);
  return Number.isFinite(n) ? n : 400;
}

/** Does this text count as "large" for the relaxed 3:1 / 4.5:1 thresholds? */
export function isLargeText(px: number, weight: string | number): boolean {
  if (px >= LARGE_TEXT_PX) return true;
  return px >= LARGE_TEXT_BOLD_PX && normalizeWeight(weight) >= 700;
}

/**
 * Full WCAG verdict for foreground text over its effective background.
 * `fg`/`bg` must already be opaque (composite alpha first).
 */
export function contrastVerdict(
  fg: { r: number; g: number; b: number },
  bg: { r: number; g: number; b: number },
  px: number,
  weight: string | number
): ContrastVerdict {
  const ratio = contrastRatio(fg, bg);
  const large = isLargeText(px, weight);
  return {
    ratio: Math.round(ratio * 100) / 100,
    aaNormal: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaaNormal: ratio >= 7,
    aaaLarge: ratio >= 4.5,
    isLargeText: large,
  };
}
