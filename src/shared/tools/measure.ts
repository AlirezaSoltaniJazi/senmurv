import type { BoxModel, BoxSides, DistanceReading, MeasureRegion } from '@/shared/types';

/**
 * Pure geometry for the Measure tool. Everything here is arithmetic over plain
 * numbers — no DOM reads — because happy-dom has no layout engine
 * (`getBoundingClientRect()` returns an all-zero rect), so anything touching live
 * geometry would be untestable. The content bridge reads the DOM and passes the
 * numbers in; this module does the maths.
 *
 * `DOMMatrix` IS available under happy-dom, so `describeTransform` genuinely runs
 * in tests.
 */

/** A rectangle in one coordinate space. */
export interface MeasureRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** The raw box parts read off an element, before derivation. */
export interface BoxParts {
  readonly borderBoxWidth: number;
  readonly borderBoxHeight: number;
  readonly padding: BoxSides;
  readonly border: BoxSides;
  readonly margin: BoxSides;
  /** Computed `transform` string (`'none'`, `''`, `matrix(...)`, `matrix3d(...)`). */
  readonly transform: string;
}

/** Round to at most 2dp, dropping a trailing `.0`, so "286" not "286.00". */
export function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Derive the full box model from the border-box size and the four sides.
 *
 * The border box is what `getBoundingClientRect` reports; the content box is the
 * number `getComputedStyle().width` returns — the two differ by exactly
 * (padding + border), which is the whole reason `assertions.ts` exists.
 */
export function computeBoxModel(parts: BoxParts): BoxModel {
  const { padding, border, margin } = parts;
  return {
    content: {
      width: round(
        Math.max(
          0,
          parts.borderBoxWidth - padding.left - padding.right - border.left - border.right
        )
      ),
      height: round(
        Math.max(
          0,
          parts.borderBoxHeight - padding.top - padding.bottom - border.top - border.bottom
        )
      ),
    },
    padding,
    border,
    margin,
    borderBox: { width: round(parts.borderBoxWidth), height: round(parts.borderBoxHeight) },
    marginBox: {
      width: round(parts.borderBoxWidth + margin.left + margin.right),
      height: round(parts.borderBoxHeight + margin.top + margin.bottom),
    },
    transform: describeTransform(parts.transform),
  };
}

/**
 * Turn a computed `transform` into a short human description, or null when there
 * is none. Guards `!s || s === 'none'` BEFORE constructing `DOMMatrix` (which
 * throws on those), and reports `matrix3d` distinctly — a `translateZ(0)` GPU
 * hack makes any element's transform 3D, and its 2D decomposition is meaningless.
 */
export function describeTransform(transform: string): string | null {
  if (!transform || transform === 'none') return null;
  let m: DOMMatrix;
  try {
    m = new DOMMatrix(transform);
  } catch {
    return null;
  }
  if (!m.is2D) return '3D transform';

  const scaleX = Math.hypot(m.a, m.b);
  const scaleY = Math.hypot(m.c, m.d);
  const angle = round((Math.atan2(m.b, m.a) * 180) / Math.PI);

  const parts: string[] = [];
  if (Math.abs(angle) > 0.01) parts.push(`rotate ${angle}°`);
  if (Math.abs(scaleX - 1) > 0.01 || Math.abs(scaleY - 1) > 0.01) {
    parts.push(`scale ${round(scaleX)}×${round(scaleY)}`);
  }
  if (Math.abs(m.e) > 0.01 || Math.abs(m.f) > 0.01) {
    parts.push(`translate ${round(m.e)}, ${round(m.f)}px`);
  }
  return parts.length === 0 ? 'identity' : parts.join(', ');
}

/** Normalise a drag from any of the four directions into a top-left-anchored rect. */
export function normalizeRegion(ax: number, ay: number, bx: number, by: number): MeasureRect {
  return {
    left: Math.min(ax, bx),
    top: Math.min(ay, by),
    width: Math.abs(bx - ax),
    height: Math.abs(by - ay),
  };
}

/** Build a MeasureRegion from a viewport rect and the page scroll offset. */
export function toRegion(rect: MeasureRect, scrollX: number, scrollY: number): MeasureRegion {
  return {
    width: round(rect.width),
    height: round(rect.height),
    viewport: { left: round(rect.left), top: round(rect.top) },
    page: { left: round(rect.left + scrollX), top: round(rect.top + scrollY) },
  };
}

/**
 * Snap `value` to the nearest candidate within `threshold`, else return it
 * unchanged. Ties resolve to the strictly nearer one; equal distances keep the
 * earlier candidate. Used to snap a drag edge to a nearby element edge.
 */
export function snapValue(value: number, candidates: readonly number[], threshold: number): number {
  let best = value;
  let bestDist = threshold;
  for (const c of candidates) {
    const dist = Math.abs(c - value);
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}

/** The four resolved edges of a rect, for gap arithmetic. */
interface Edges {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly cx: number;
  readonly cy: number;
}

function edges(r: MeasureRect): Edges {
  return {
    left: r.left,
    right: r.left + r.width,
    top: r.top,
    bottom: r.top + r.height,
    cx: r.left + r.width / 2,
    cy: r.top + r.height / 2,
  };
}

/**
 * Gap and centre-to-centre distance between two rects. A nearest-edge gap is 0
 * when the boxes overlap on that axis; otherwise it is the clear space between
 * their facing edges.
 */
export function computeDistance(a: MeasureRect, b: MeasureRect): DistanceReading {
  const ea = edges(a);
  const eb = edges(b);
  const horizontal =
    ea.right < eb.left ? eb.left - ea.right : eb.right < ea.left ? ea.left - eb.right : 0;
  const vertical =
    ea.bottom < eb.top ? eb.top - ea.bottom : eb.bottom < ea.top ? ea.top - eb.bottom : 0;
  const dx = eb.cx - ea.cx;
  const dy = eb.cy - ea.cy;
  return {
    horizontal: round(horizontal),
    vertical: round(vertical),
    dx: round(dx),
    dy: round(dy),
    centerToCenter: round(Math.hypot(dx, dy)),
  };
}
