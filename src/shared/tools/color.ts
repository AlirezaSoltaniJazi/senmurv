import type { ColorFormats, Rgba } from '@/shared/types';

/**
 * CSS colour parsing and format conversion for the Colour tool.
 *
 * Two engines feed this: the eyedropper hands us `#rrggbb`, and the element
 * probe hands us whatever `getComputedStyle` returns — which in Chrome is
 * `rgb()`/`rgba()` for any sRGB colour, and `oklch()`/`lab()`/`color()`
 * VERBATIM for wide-gamut colours (those are not sRGB-convertible, so
 * `parseColor` returns null and the UI shows the raw string, never a fabricated
 * hex). happy-dom returns authored strings (`#fff`, bare keywords, `''`), which
 * `parseColor` also handles for the sRGB forms.
 */

const NUM = /[-+]?[0-9]*\.?[0-9]+%?/g;

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function channel(token: string): number {
  return token.endsWith('%')
    ? clamp255((parseFloat(token) / 100) * 255)
    : clamp255(parseFloat(token));
}

function parseHex(input: string): Rgba | null {
  const h = input.slice(1);
  const expand = (s: string): string => (s.length <= 4 ? [...s].map((c) => c + c).join('') : s);
  const full = expand(h);
  if (full.length !== 6 && full.length !== 8) return null;
  if (!/^[0-9a-f]+$/i.test(full)) return null;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const a = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x];
  return { r: clamp255((r + m) * 255), g: clamp255((g + m) * 255), b: clamp255((b + m) * 255) };
}

/**
 * Parse a CSS colour string into straight-alpha sRGB, or null when it is not an
 * sRGB colour (oklch/lab/color()/currentcolor/named-we-can't-resolve/empty).
 */
export function parseColor(input: string): Rgba | null {
  const s = input.trim().toLowerCase();
  if (s === '') return null;
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (s.startsWith('#')) return parseHex(s);

  if (s.startsWith('rgb')) {
    const parts = s.match(NUM) ?? [];
    if (parts.length < 3) return null;
    const alpha = parts[3] !== undefined ? clampAlpha(parts[3]) : 1;
    return { r: channel(parts[0]!), g: channel(parts[1]!), b: channel(parts[2]!), a: alpha };
  }

  if (s.startsWith('hsl')) {
    const parts = s.match(NUM) ?? [];
    if (parts.length < 3) return null;
    const h = parseFloat(parts[0]!);
    const sat = parseFloat(parts[1]!) / 100;
    const lig = parseFloat(parts[2]!) / 100;
    const alpha = parts[3] !== undefined ? clampAlpha(parts[3]) : 1;
    return { ...hslToRgb(h, sat, lig), a: alpha };
  }

  // Named keywords, oklch(), lab(), color(display-p3 …), currentcolor: not
  // resolvable to sRGB here — the caller shows the raw computed string instead.
  return null;
}

function clampAlpha(token: string): number {
  const n = token.endsWith('%') ? parseFloat(token) / 100 : parseFloat(token);
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 1));
}

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

/** Round to at most 1dp, dropping a trailing `.0`. */
function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

function hex2(n: number): string {
  return clamp255(n).toString(16).padStart(2, '0');
}

/** sRGB → HSL. Returns h in [0,360), s and l in [0,100]. */
export function rgbToHsl(rgb: { r: number; g: number; b: number }): {
  h: number;
  s: number;
  l: number;
} {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const c = mx - mn;
  const l = (mx + mn) / 2;
  const s = c === 0 ? 0 : c / (1 - Math.abs(2 * l - 1));
  return { h: hue(r, g, b, mx, c), s: r1(s * 100), l: r1(l * 100) };
}

/** sRGB → HWB. Returns h in [0,360), w and b (blackness) in [0,100]. */
export function rgbToHwb(rgb: { r: number; g: number; b: number }): {
  h: number;
  w: number;
  b: number;
} {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return { h: hue(r, g, b, mx, mx - mn), w: r1(mn * 100), b: r1((1 - mx) * 100) };
}

function hue(r: number, g: number, b: number, mx: number, c: number): number {
  if (c === 0) return 0;
  let h: number;
  if (mx === r) h = ((g - b) / c) % 6;
  else if (mx === g) h = (b - r) / c + 2;
  else h = (r - g) / c + 4;
  h *= 60;
  return r1(((h % 360) + 360) % 360);
}

/** Format an alpha as a compact string, e.g. 0.2 → "0.2", 1 → "1". */
function alphaStr(a: number): string {
  return String(Math.round(a * 100) / 100);
}

/** Render every copy-ready format for a colour. */
export function toFormats(rgba: Rgba): ColorFormats {
  const { r, g, b, a } = rgba;
  const hsl = rgbToHsl(rgba);
  const hwb = rgbToHwb(rgba);
  const opaque = a >= 1;
  return {
    hex: `#${hex2(r)}${hex2(g)}${hex2(b)}`,
    hex8: `#${hex2(r)}${hex2(g)}${hex2(b)}${hex2(a * 255)}`,
    rgb: opaque ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alphaStr(a)})`,
    hsl: opaque
      ? `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`
      : `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${alphaStr(a)})`,
    hwb: opaque
      ? `hwb(${hwb.h} ${hwb.w}% ${hwb.b}%)`
      : `hwb(${hwb.h} ${hwb.w}% ${hwb.b}% / ${alphaStr(a)})`,
  };
}
