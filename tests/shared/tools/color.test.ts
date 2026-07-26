import { describe, expect, it } from 'vitest';
import { parseColor, rgbToHsl, rgbToHwb, toFormats } from '@/shared/tools/color';

describe('parseColor — sRGB forms', () => {
  it('parses 3/6/8-digit hex', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('#2d7ff9')).toEqual({ r: 45, g: 127, b: 249, a: 1 });
    expect(parseColor('#ffffff00')).toEqual({ r: 255, g: 255, b: 255, a: 0 });
  });

  it('parses the 4-digit hex alpha nibble', () => {
    // #RGBA — last nibble is alpha; f → 255 → 1.
    expect(parseColor('#fff0')).toEqual({ r: 255, g: 255, b: 255, a: 0 });
  });

  it('parses rgb()/rgba() in the forms Chrome and happy-dom emit', () => {
    expect(parseColor('rgb(45, 127, 249)')).toEqual({ r: 45, g: 127, b: 249, a: 1 });
    expect(parseColor('rgba(0,0,0,.2)')).toEqual({ r: 0, g: 0, b: 0, a: 0.2 });
  });

  it('maps the transparent keyword to transparent black', () => {
    expect(parseColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it('parses hsl() back to sRGB', () => {
    // Oracle: hsl(214 94% 58%) → rgb(47, 134, 249).
    expect(parseColor('hsl(214, 94%, 58%)')).toEqual({ r: 47, g: 134, b: 249, a: 1 });
  });
});

describe('parseColor — non-sRGB returns null (raw string is shown instead)', () => {
  it.each(['', 'currentcolor', 'oklch(0.7 0.15 200)', 'lab(50% 40 30)', 'color(display-p3 1 0 0)'])(
    'returns null for %s',
    (input) => {
      expect(parseColor(input)).toBeNull();
    }
  );
});

describe('rgbToHsl / rgbToHwb — against the oracle', () => {
  it('#2d7ff9 → hsl(215.9, 94.4, 57.6) and hwb(215.9, 17.6, 2.4)', () => {
    const rgb = { r: 45, g: 127, b: 249 };
    expect(rgbToHsl(rgb)).toEqual({ h: 215.9, s: 94.4, l: 57.6 });
    expect(rgbToHwb(rgb)).toEqual({ h: 215.9, w: 17.6, b: 2.4 });
  });

  it('primaries land on 0/120/240 with full saturation', () => {
    expect(rgbToHsl({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, l: 50 });
    expect(rgbToHsl({ r: 0, g: 255, b: 0 })).toEqual({ h: 120, s: 100, l: 50 });
    expect(rgbToHsl({ r: 0, g: 0, b: 255 })).toEqual({ h: 240, s: 100, l: 50 });
  });

  it('greys have zero saturation', () => {
    expect(rgbToHsl({ r: 128, g: 128, b: 128 }).s).toBe(0);
  });
});

describe('toFormats', () => {
  it('renders every format for an opaque colour', () => {
    const f = toFormats({ r: 45, g: 127, b: 249, a: 1 });
    expect(f.hex).toBe('#2d7ff9');
    expect(f.hex8).toBe('#2d7ff9ff');
    expect(f.rgb).toBe('rgb(45, 127, 249)');
    expect(f.hsl).toBe('hsl(215.9, 94.4%, 57.6%)');
    expect(f.hwb).toBe('hwb(215.9 17.6% 2.4%)');
  });

  it('switches to the alpha forms when not opaque', () => {
    const f = toFormats({ r: 0, g: 0, b: 0, a: 0.2 });
    expect(f.hex).toBe('#000000');
    expect(f.hex8).toBe('#00000033'); // 0.2 * 255 = 51 = 0x33
    expect(f.rgb).toBe('rgba(0, 0, 0, 0.2)');
    expect(f.hsl).toBe('hsla(0, 0%, 0%, 0.2)');
    expect(f.hwb).toBe('hwb(0 0% 100% / 0.2)');
  });
});
