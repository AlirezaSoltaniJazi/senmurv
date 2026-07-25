import { describe, expect, it } from 'vitest';
import { analyzeStack } from '@/shared/tools/stacking';
import type { RawLayer } from '@/shared/tools/stacking';

const POINT = { x: 100, y: 100 };

function layer(over: Partial<RawLayer>): RawLayer {
  return {
    tag: 'div',
    zIndex: 'auto',
    position: 'static',
    opacity: '1',
    pointerEvents: 'auto',
    width: 100,
    height: 40,
    interactive: false,
    ...over,
  };
}

describe('analyzeStack', () => {
  it('marks the topmost hit-testable layer as the hit target', () => {
    const r = analyzeStack(
      [layer({ tag: 'button', interactive: true }), layer({ tag: 'div' }), layer({ tag: 'body' })],
      POINT
    );
    expect(r.hitIndex).toBe(0);
    expect(r.layers.map((l) => l.relation)).toEqual(['hit', 'blocked', 'blocked']);
    expect(r.interceptsInteractive).toBe(false);
  });

  it('flags a non-interactive overlay intercepting a button below it', () => {
    const r = analyzeStack(
      [
        layer({ tag: 'div#overlay', interactive: false, opacity: '0' }),
        layer({ tag: 'button.buy', interactive: true }),
        layer({ tag: 'body' }),
      ],
      POINT
    );
    expect(r.hitIndex).toBe(0);
    expect(r.interceptsInteractive).toBe(true);
    expect(r.layers[1]?.relation).toBe('blocked');
  });

  it('treats a pointer-events:none overlay as click-through', () => {
    const r = analyzeStack(
      [
        layer({ tag: 'div#veil', pointerEvents: 'none' }),
        layer({ tag: 'button', interactive: true }),
        layer({ tag: 'body' }),
      ],
      POINT
    );
    expect(r.hitIndex).toBe(1);
    expect(r.layers.map((l) => l.relation)).toEqual(['above', 'hit', 'blocked']);
    expect(r.interceptsInteractive).toBe(false); // the hit target IS the button
  });

  it('does not flag an interactive element sitting over its own ancestors', () => {
    // button inside a link: link is interactive and below, but the click lands on
    // the (interactive) button, so there is no interception to report.
    const r = analyzeStack(
      [
        layer({ tag: 'button', interactive: true }),
        layer({ tag: 'a', interactive: true }),
        layer({ tag: 'body' }),
      ],
      POINT
    );
    expect(r.interceptsInteractive).toBe(false);
  });

  it('handles nothing hit-testable (every layer pointer-events:none)', () => {
    const r = analyzeStack(
      [layer({ pointerEvents: 'none' }), layer({ pointerEvents: 'none' })],
      POINT
    );
    expect(r.hitIndex).toBe(-1);
    expect(r.layers.every((l) => l.relation === 'above')).toBe(true);
    expect(r.interceptsInteractive).toBe(false);
  });

  it('carries the point through', () => {
    expect(analyzeStack([layer({})], { x: 7, y: 9 }).point).toEqual({ x: 7, y: 9 });
  });
});
