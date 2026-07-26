import type { FontSource, RenderedFace } from '@/shared/types';

/**
 * Pure typography helpers for the Fonts tool. The parts that need the DOM — is a
 * web font loaded, does a family render, what is its @font-face src — live in the
 * content bridge and are injected here as callbacks, so the resolution algorithm
 * stays unit-testable (happy-dom has no `document.fonts` and no canvas).
 */

/** The CSS generic families — the end of any stack, and never "web" or "local". */
const GENERICS = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
]);

export function isGenericFamily(family: string): boolean {
  return GENERICS.has(family.trim().toLowerCase());
}

/** Split a `font-family` value into its ordered families, unquoted and trimmed. */
export function parseFontStack(family: string): string[] {
  return family
    .split(',')
    .map((f) =>
      f
        .trim()
        .replace(/^["']|["']$/g, '')
        .trim()
    )
    .filter((f) => f !== '');
}

/** Quote + escape a family name for `document.fonts.check` / a `font` shorthand. */
export function quoteFamily(name: string): string {
  if (isGenericFamily(name) || /^[a-zA-Z][a-zA-Z0-9 -]*$/.test(name)) return name;
  return `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

const WEIGHT_NAMES: Record<number, string> = {
  100: 'Thin',
  200: 'Extra Light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semi Bold',
  700: 'Bold',
  800: 'Extra Bold',
  900: 'Black',
};

/** Normalise a CSS font-weight (keyword or number) to a numeric value. */
export function normalizeWeight(weight: string | number): number {
  if (typeof weight === 'number') return weight;
  if (weight === 'bold') return 700;
  if (weight === 'normal') return 400;
  if (weight === 'lighter') return 300;
  if (weight === 'bolder') return 700;
  const n = parseInt(weight, 10);
  return Number.isFinite(n) ? n : 400;
}

/** Human name for a weight, e.g. 700 → "Bold", 650 → "Semi Bold (650)". */
export function weightName(weight: string | number): string {
  const value = normalizeWeight(weight);
  const exact = WEIGHT_NAMES[value];
  if (exact) return exact;
  const nearest = Math.round(value / 100) * 100;
  const near = WEIGHT_NAMES[nearest] ?? 'Regular';
  return `${near} (${value})`;
}

/** px → pt (1pt = 96/72 px), rounded to 1dp. */
export function pxToPt(px: number): number {
  return Math.round((px * 72) / 96 / 0.1) * 0.1;
}

/** px → rem given the root font size, rounded to 3dp. */
export function pxToRem(px: number, rootPx: number): number {
  if (rootPx <= 0) return 0;
  return Math.round((px / rootPx) * 1000) / 1000;
}

/**
 * Resolve a computed `line-height` to px and unitless ratio. Chrome returns a px
 * value (`"24px"`) or `"normal"`; happy-dom may return the authored unitless
 * number (`"1.5"`). Handle both.
 */
export function resolveLineHeight(
  raw: string,
  fontSizePx: number
): { px: number | null; ratio: number | null } {
  const v = raw.trim();
  if (v === '' || v === 'normal') return { px: null, ratio: null };
  if (v.endsWith('px')) {
    const px = parseFloat(v);
    return { px, ratio: fontSizePx > 0 ? Math.round((px / fontSizePx) * 100) / 100 : null };
  }
  const num = parseFloat(v);
  if (Number.isFinite(num)) {
    // Unitless multiplier (authored value).
    return { px: Math.round(num * fontSizePx), ratio: num };
  }
  return { px: null, ratio: null };
}

/** DOM-dependent probes, injected so the resolver stays testable. */
export interface FaceProbes {
  /** Does this family render differently from a fallback? (canvas width test) */
  renders(family: string): boolean;
  /** Is there a loaded @font-face for this family? (a web font vs a local install) */
  hasWebFace(family: string): boolean;
}

/**
 * Walk the CSS `font-family` stack and return the face the browser actually
 * renders: the first family that is available (a loaded web font, an installed
 * local font, or a generic fallback). A generic keyword always "renders".
 */
export function resolveRenderedFace(stack: string[], probes: FaceProbes): RenderedFace {
  for (const family of stack) {
    if (isGenericFamily(family)) {
      return { family, source: 'generic', src: null };
    }
    if (probes.renders(family)) {
      const source: FontSource = probes.hasWebFace(family) ? 'web' : 'local';
      return { family, source, src: null };
    }
  }
  // Nothing in the stack was available — the browser fell back to a UA default.
  const last = stack[stack.length - 1];
  return {
    family: last ?? 'unknown',
    source: last && isGenericFamily(last) ? 'generic' : 'unknown',
    src: null,
  };
}

/** A copy-ready CSS `font` shorthand: style weight size/line-height family. */
export function fontShorthand(
  style: string,
  weight: number,
  sizePx: number,
  lineHeightRaw: string,
  stack: string[]
): string {
  const parts: string[] = [];
  if (style !== 'normal' && style !== '') parts.push(style);
  if (weight !== 400) parts.push(String(weight));
  const size =
    lineHeightRaw && lineHeightRaw !== 'normal' ? `${sizePx}px/${lineHeightRaw}` : `${sizePx}px`;
  parts.push(size);
  parts.push(stack.map(quoteFamily).join(', '));
  return parts.join(' ');
}
