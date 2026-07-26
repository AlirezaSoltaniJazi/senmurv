import { describe, expect, it } from 'vitest';
import { resolveEffectiveBackground } from '@/shared/tools/element-colors';
import type { BackgroundLayer } from '@/shared/tools/element-colors';

const layer = (
  color: BackgroundLayer['color'],
  opacity = 1,
  hasImage = false
): BackgroundLayer => ({
  color,
  opacity,
  hasImage,
});

describe('resolveEffectiveBackground', () => {
  it('returns an opaque background directly', () => {
    const eff = resolveEffectiveBackground([layer({ r: 45, g: 127, b: 249, a: 1 })]);
    expect(eff.rgb).toEqual({ r: 45, g: 127, b: 249 });
    expect(eff.assumedWhite).toBe(false);
    expect(eff.warnings).toHaveLength(0);
  });

  it('composites a translucent element over an opaque ancestor', () => {
    // 50% black element over an opaque white parent → grey 128.
    const eff = resolveEffectiveBackground([
      layer({ r: 0, g: 0, b: 0, a: 0.5 }),
      layer({ r: 255, g: 255, b: 255, a: 1 }),
    ]);
    expect(eff.rgb).toEqual({ r: 128, g: 128, b: 128 });
    expect(eff.assumedWhite).toBe(false);
  });

  it('folds an ancestor opacity into its background alpha', () => {
    // A fully-opaque black bg but the element has opacity 0.5 → behaves like 50% black.
    const eff = resolveEffectiveBackground([
      layer({ r: 0, g: 0, b: 0, a: 1 }, 0.5),
      layer({ r: 255, g: 255, b: 255, a: 1 }),
    ]);
    expect(eff.rgb).toEqual({ r: 128, g: 128, b: 128 });
  });

  it('assumes white and WARNS when nothing opaque is found', () => {
    const eff = resolveEffectiveBackground([
      layer({ r: 0, g: 0, b: 0, a: 0 }), // transparent
      layer(null), // e.g. an oklch background we could not read
    ]);
    expect(eff.rgb).toEqual({ r: 255, g: 255, b: 255 });
    expect(eff.assumedWhite).toBe(true);
    expect(eff.warnings.join(' ')).toMatch(/assumed the page default/);
  });

  it('warns about a background image it cannot read', () => {
    const eff = resolveEffectiveBackground([layer({ r: 255, g: 255, b: 255, a: 1 }, 1, true)]);
    expect(eff.warnings.join(' ')).toMatch(/background image or gradient/);
  });

  it('treats an opaque middle ancestor as the backdrop (further layers do not leak)', () => {
    const eff = resolveEffectiveBackground([
      layer({ r: 0, g: 0, b: 0, a: 0 }), // transparent text element
      layer({ r: 45, g: 127, b: 249, a: 1 }), // opaque blue parent
      layer({ r: 255, g: 0, b: 0, a: 1 }), // red grandparent — hidden behind the blue
    ]);
    expect(eff.rgb).toEqual({ r: 45, g: 127, b: 249 });
  });
});
