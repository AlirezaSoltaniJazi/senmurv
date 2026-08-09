import type { StackLayer, StackReport } from '@/shared/types';

/**
 * Pure hit-test analysis for the Stacking Inspector — the tool that debugs the
 * "element click intercepted / not clickable at point" flake. Given the elements
 * at a point (top-to-bottom, as `document.elementsFromPoint` returns them), it
 * decides which one actually receives the click and whether that element is a
 * non-interactive overlay sitting on top of something you meant to click.
 *
 * Chrome-free: the DOM read (elementsFromPoint + getComputedStyle) happens in the
 * content bridge, which passes the per-layer facts here.
 */

/** The facts the analyzer needs per layer — everything but the derived fields. */
export type RawLayer = Omit<StackLayer, 'relation' | 'locator'>;

/**
 * Classify the stack. The click lands on the topmost layer whose `pointer-events`
 * is not `none` (the hit target); layers above it are click-through, layers below
 * are blocked. It flags interception when the hit target is a NON-interactive
 * element (an overlay/backdrop) covering an interactive one below — the real bug,
 * without false-flagging an interactive element sitting over its own ancestors.
 */
export function analyzeStack(
  layers: readonly RawLayer[],
  point: { readonly x: number; readonly y: number }
): StackReport {
  const hitIndex = layers.findIndex((l) => l.pointerEvents !== 'none');

  const relate = (i: number): StackLayer['relation'] => {
    if (hitIndex === -1) return 'above';
    if (i === hitIndex) return 'hit';
    return i < hitIndex ? 'above' : 'blocked';
  };

  const out: StackLayer[] = layers.map((l, i) => ({ ...l, relation: relate(i) }));
  const hit = hitIndex >= 0 ? out[hitIndex] : undefined;
  const interceptsInteractive =
    hit !== undefined && !hit.interactive && out.some((l, i) => i > hitIndex && l.interactive);

  return { layers: out, hitIndex, interceptsInteractive, point };
}
