/**
 * Coalesce a burst of pointer events to one call per animation frame.
 *
 * Every in-page hover mode (pick, measure, colour, fonts, stacking, assert,
 * validation) reads live layout on `mousemove` — `elementFromPoint`,
 * `getBoundingClientRect`, `getComputedStyle` — which forces a synchronous
 * style/layout recalc. A high-refresh mouse fires 120+ moves/second, so that
 * work runs far more often than the screen can paint. Wrapping the handler here
 * caps it at one run per frame with the LATEST position, cutting the layout cost
 * by up to ~2× on 120 Hz displays and much more on heavy pages, with no visible
 * change (the eye can't see more than one update per frame anyway).
 *
 * `cancel()` MUST be called from each mode's `stop*()` so a queued frame can
 * never fire after the mode tore its overlay down (which would re-create it and
 * break the single-mode arbiter invariant). Add and remove the SAME `handler`
 * reference — hold the returned object in module scope for that reason.
 */
export interface RafThrottled {
  /** The `mousemove` listener to register; runs the wrapped fn once per frame. */
  readonly handler: (e: MouseEvent) => void;
  /** Cancel any pending frame and drop the stored event. Idempotent. */
  cancel(): void;
}

export function rafThrottle(fn: (e: MouseEvent) => void): RafThrottled {
  let raf = 0;
  let latest: MouseEvent | null = null;

  const handler = (e: MouseEvent): void => {
    // clientX/clientY are fixed at dispatch, so retaining the event across a
    // frame is safe — we only read coordinates from it.
    latest = e;
    if (raf !== 0) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const pending = latest;
      latest = null;
      if (pending) fn(pending);
    });
  };

  const cancel = (): void => {
    if (raf !== 0) cancelAnimationFrame(raf);
    raf = 0;
    latest = null;
  };

  return { handler, cancel };
}
