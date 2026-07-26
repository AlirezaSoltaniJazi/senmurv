import { compositeOver } from '@/shared/tools/contrast';
import type { Rgba } from '@/shared/types';

/**
 * Resolve the opaque colour visually behind an element's text, so a WCAG
 * contrast ratio can be computed. Pure: the content script reads each ancestor's
 * background off the live DOM and passes the layers in (nearest first); this
 * module composites them.
 *
 * This is an ANCESTOR WALK, and it deliberately warns rather than guesses about
 * everything it cannot see (background images/gradients, ::before overlays,
 * non-ancestor elements pulled behind by z-index, blend modes, …). Getting a
 * confident-but-wrong background is worse than admitting uncertainty.
 */

/** One element in the ancestor chain, from the target (nearest) outward. */
export interface BackgroundLayer {
  /** Its computed `background-color`, or null when non-sRGB / unreadable. */
  readonly color: Rgba | null;
  /** Its computed `opacity` (0-1), which multiplies its background's alpha. */
  readonly opacity: number;
  /** True when it paints a `background-image` (gradient or image) we cannot read. */
  readonly hasImage: boolean;
}

export interface EffectiveBackground {
  readonly rgb: { readonly r: number; readonly g: number; readonly b: number };
  /** True when no opaque layer was found and the page-default white was assumed. */
  readonly assumedWhite: boolean;
  readonly warnings: string[];
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Composite the ancestor backgrounds (nearest first) over the page-default white
 * backstop, in gamma-encoded sRGB, and report what could not be accounted for.
 */
export function resolveEffectiveBackground(
  layers: readonly BackgroundLayer[]
): EffectiveBackground {
  const warnings: string[] = [];
  if (layers.some((l) => l.hasImage)) {
    warnings.push(
      'A background image or gradient sits behind this element — only background-color is read, so the real contrast may differ.'
    );
  }

  // Composite from the furthest ancestor inward over an assumed-white backstop.
  let acc = { r: 255, g: 255, b: 255 };
  let hitOpaque = false;
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    const layer = layers[i];
    if (!layer || layer.color === null) continue;
    const alpha = clamp01(layer.color.a * clamp01(layer.opacity));
    if (alpha <= 0) continue;
    if (alpha >= 1) hitOpaque = true;
    acc = compositeOver({ ...layer.color, a: alpha }, acc);
  }

  if (!hitOpaque) {
    warnings.push(
      'No opaque background was found behind this element — assumed the page default (white). On a dark theme this will be wrong.'
    );
  }
  return { rgb: acc, assumedWhite: !hitOpaque, warnings };
}
