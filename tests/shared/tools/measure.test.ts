import { describe, expect, it } from 'vitest';
import {
  computeBoxModel,
  computeDistance,
  describeTransform,
  normalizeRegion,
  snapValue,
  toRegion,
} from '@/shared/tools/measure';
import type { BoxParts } from '@/shared/tools/measure';

const sides = (n: number) => ({ top: n, right: n, bottom: n, left: n });

describe('computeBoxModel', () => {
  it('derives the content box by subtracting padding and border', () => {
    // border box 320×180, 16px padding all round, 1px border all round.
    const parts: BoxParts = {
      borderBoxWidth: 320,
      borderBoxHeight: 180,
      padding: sides(16),
      border: sides(1),
      margin: { top: 0, right: 24, bottom: 0, left: 24 },
      transform: 'none',
    };
    const box = computeBoxModel(parts);
    expect(box.content).toEqual({ width: 286, height: 146 }); // 320-32-2, 180-32-2
    expect(box.borderBox).toEqual({ width: 320, height: 180 });
    expect(box.marginBox).toEqual({ width: 368, height: 180 }); // 320+24+24, 180+0
  });

  it('never lets the content box go negative on a tiny element', () => {
    const box = computeBoxModel({
      borderBoxWidth: 10,
      borderBoxHeight: 10,
      padding: sides(8),
      border: sides(2),
      margin: sides(0),
      transform: 'none',
    });
    expect(box.content.width).toBe(0);
    expect(box.content.height).toBe(0);
  });
});

describe('describeTransform', () => {
  it('returns null for none / empty, without constructing DOMMatrix', () => {
    expect(describeTransform('none')).toBeNull();
    expect(describeTransform('')).toBeNull();
  });

  // NB: real Chrome throws on an unparseable string (our catch → null), but
  // happy-dom's DOMMatrix is lenient and returns identity, so the throw path is
  // only exercised in the real-Chrome pass, not here.

  it('reports a genuinely-3D matrix distinctly', () => {
    // translateZ(50). happy-dom treats a PURE-identity matrix3d as 2D, so the
    // fixture needs a real z-component to be seen as 3D.
    expect(describeTransform('matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,50,1)')).toBe('3D transform');
  });

  it('decomposes a rotation from a production-shaped matrix(...)', () => {
    // A browser NEVER returns "rotate(30deg)" from getComputedStyle — it returns
    // the matrix form. 30°: matrix(cos, sin, -sin, cos, 0, 0).
    const c = Math.cos(Math.PI / 6);
    const s = Math.sin(Math.PI / 6);
    expect(describeTransform(`matrix(${c}, ${s}, ${-s}, ${c}, 0, 0)`)).toBe('rotate 30°');
  });

  it('decomposes scale and translate', () => {
    expect(describeTransform('matrix(2, 0, 0, 3, 10, 20)')).toBe('scale 2×3, translate 10, 20px');
  });

  it('calls an unscaled, unrotated, untranslated matrix identity', () => {
    expect(describeTransform('matrix(1, 0, 0, 1, 0, 0)')).toBe('identity');
  });
});

describe('normalizeRegion', () => {
  it('anchors top-left regardless of drag direction', () => {
    const expected = { left: 10, top: 20, width: 90, height: 60 };
    expect(normalizeRegion(10, 20, 100, 80)).toEqual(expected); // ↘
    expect(normalizeRegion(100, 80, 10, 20)).toEqual(expected); // ↖
    expect(normalizeRegion(100, 20, 10, 80)).toEqual(expected); // ↙
    expect(normalizeRegion(10, 80, 100, 20)).toEqual(expected); // ↗
  });
});

describe('toRegion', () => {
  it('adds the scroll offset to produce page-absolute coordinates', () => {
    const region = toRegion({ left: 10, top: 20, width: 100, height: 50 }, 200, 300);
    expect(region.viewport).toEqual({ left: 10, top: 20 });
    expect(region.page).toEqual({ left: 210, top: 320 });
    expect(region.width).toBe(100);
  });
});

describe('snapValue', () => {
  it('snaps to the nearest candidate within threshold', () => {
    expect(snapValue(102, [100, 200], 6)).toBe(100);
    expect(snapValue(196, [100, 200], 6)).toBe(200);
  });

  it('leaves the value alone when nothing is close enough', () => {
    expect(snapValue(150, [100, 200], 6)).toBe(150);
  });

  it('picks the strictly nearer of two in-threshold candidates', () => {
    expect(snapValue(103, [100, 105], 6)).toBe(105);
    expect(snapValue(102, [100, 105], 6)).toBe(100);
  });
});

describe('computeDistance', () => {
  const rect = (left: number, top: number, width: number, height: number) => ({
    left,
    top,
    width,
    height,
  });

  it('measures the clear gap between two separated boxes', () => {
    const a = rect(0, 0, 100, 100);
    const b = rect(160, 0, 100, 100);
    const d = computeDistance(a, b);
    expect(d.horizontal).toBe(60); // 160 - 100
    expect(d.vertical).toBe(0); // aligned on y
    expect(d.dx).toBe(160); // centre delta: 210 - 50
  });

  it('reports a zero gap on an axis where the boxes overlap', () => {
    const a = rect(0, 0, 100, 100);
    const b = rect(50, 200, 100, 100);
    const d = computeDistance(a, b);
    expect(d.horizontal).toBe(0); // overlap on x
    expect(d.vertical).toBe(100); // 200 - 100
  });

  it('computes centre-to-centre distance', () => {
    const a = rect(0, 0, 10, 10);
    const b = rect(30, 40, 10, 10);
    // centres (5,5) and (35,45): dx 30, dy 40, hypot 50.
    expect(computeDistance(a, b).centerToCenter).toBe(50);
  });
});
