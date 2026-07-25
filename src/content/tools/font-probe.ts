import { MESSAGE_TYPES } from '@/shared/constants';
import { notify, notifyQuiet } from '@/content/context';
import { buildLocatorSet } from '@/shared/locators';
import { clearOverlay, destroyOverlay, drawBoxes, flashOverlay, targetAt } from '@/content/overlay';
import {
  fontShorthand,
  isGenericFamily,
  normalizeWeight,
  parseFontStack,
  pxToPt,
  pxToRem,
  quoteFamily,
  resolveLineHeight,
  resolveRenderedFace,
  weightName,
} from '@/shared/tools/typography';
import type { FaceProbes } from '@/shared/tools/typography';
import type { FontInfo, RenderedFace } from '@/shared/types';

/**
 * The in-page Fonts mode: hover an element to read its typography and the
 * TYPEFACE THAT ACTUALLY RENDERS. The rendered face needs a canvas width test
 * and a @font-face walk (neither available in happy-dom), so this is a content
 * mode; the ordering logic itself is the pure `resolveRenderedFace`.
 */

let active = false;
let lastSig = '';
let lastSent = 0;
let ctx: CanvasRenderingContext2D | null = null;

const SAMPLE = 'mmmmmwwwwwiiiii0123456789MMMMMWWWWW';
const GENERIC_PROBES = ['monospace', 'sans-serif', 'serif'];

// Ubiquitous system faces whose metrics may match a generic's, giving the canvas
// test a false negative — treat them as present when reached.
const COMMON_LOCAL = new Set([
  'arial',
  'helvetica',
  'helvetica neue',
  'times',
  'times new roman',
  'courier',
  'courier new',
  'georgia',
  'verdana',
  'tahoma',
  'trebuchet ms',
  'palatino',
  'garamond',
  'comic sans ms',
  'impact',
  'lucida console',
  'monaco',
  'menlo',
  'consolas',
  'segoe ui',
  'roboto',
  'san francisco',
]);

function widthOf(fontStr: string): number {
  if (ctx === null) {
    ctx = document.createElement('canvas').getContext('2d');
  }
  if (ctx === null) return 0;
  ctx.font = fontStr;
  return ctx.measureText(SAMPLE).width;
}

/** Does this family render (available as a web or local font)? Canvas width test. */
function rendersFamily(family: string): boolean {
  if (isGenericFamily(family)) return true;
  const q = quoteFamily(family);
  for (const generic of GENERIC_PROBES) {
    if (Math.abs(widthOf(`72px ${q}, ${generic}`) - widthOf(`72px ${generic}`)) > 0.5) return true;
  }
  return COMMON_LOCAL.has(family.trim().toLowerCase());
}

/** Map of `@font-face` family (lowercased) → its src, across readable stylesheets. */
function fontFaceRules(): Map<string, string> {
  const map = new Map<string, string>();
  const sheets: (CSSStyleSheet | StyleSheet)[] = [
    ...Array.from(document.styleSheets),
    ...(document.adoptedStyleSheets ?? []),
  ];
  for (const sheet of sheets) {
    let rules: CSSRuleList | undefined;
    try {
      rules = (sheet as CSSStyleSheet).cssRules;
    } catch {
      continue; // cross-origin stylesheet — SecurityError, skip
    }
    if (!rules) continue;
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSFontFaceRule) {
        const family = rule.style
          .getPropertyValue('font-family')
          .replace(/['"]/g, '')
          .trim()
          .toLowerCase();
        if (family) map.set(family, rule.style.getPropertyValue('src'));
      }
    }
  }
  return map;
}

function readFont(el: HTMLElement): FontInfo {
  const s = getComputedStyle(el);
  const stack = parseFontStack(s.fontFamily);
  const webFaces = fontFaceRules();
  const probes: FaceProbes = {
    renders: rendersFamily,
    hasWebFace: (f) => webFaces.has(f.trim().toLowerCase()),
  };
  const base = resolveRenderedFace(stack, probes);
  const rendered: RenderedFace =
    base.source === 'web'
      ? { ...base, src: webFaces.get(base.family.toLowerCase()) ?? null }
      : base;

  const px = parseFloat(s.fontSize) || 16;
  const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const weightValue = normalizeWeight(s.fontWeight);
  const lh = resolveLineHeight(s.lineHeight, px);

  return {
    tag: el.tagName.toLowerCase(),
    stack,
    rendered,
    size: { px: Math.round(px * 100) / 100, pt: pxToPt(px), rem: pxToRem(px, rootPx) },
    weight: { value: weightValue, name: weightName(s.fontWeight) },
    style: s.fontStyle,
    lineHeight: { raw: s.lineHeight, px: lh.px, ratio: lh.ratio },
    letterSpacing: s.letterSpacing,
    wordSpacing: s.wordSpacing,
    textTransform: s.textTransform,
    fontVariant: s.fontVariant,
    color: s.color,
    shorthand: fontShorthand(s.fontStyle, weightValue, px, s.lineHeight, stack),
    textPreview: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
  };
}

function outline(el: Element, label: string): void {
  const rect = el.getBoundingClientRect();
  drawBoxes([
    {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      variant: 'outline',
      label,
    },
  ]);
}

function stream(info: FontInfo): void {
  const sig = JSON.stringify(info);
  const now = Date.now();
  if (sig === lastSig || now - lastSent < 100) return;
  lastSig = sig;
  lastSent = now;
  notifyQuiet({ type: MESSAGE_TYPES.TOOL_STREAM, payload: { tool: 'font', data: info } });
}

function onHover(e: MouseEvent): void {
  const el = targetAt(e.clientX, e.clientY);
  if (!(el instanceof HTMLElement)) return;
  const info = readFont(el);
  outline(el, `${info.rendered.family} · ${info.size.px}px ${info.weight.name}`);
  stream(info);
}

function onPick(e: MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  const el = targetAt(e.clientX, e.clientY);
  if (!(el instanceof HTMLElement)) return;
  const info = readFont(el);
  outline(el, info.rendered.family);
  flashOverlay();
  notify(
    {
      type: MESSAGE_TYPES.TOOL_PICKED,
      payload: { tool: 'font', data: info, locators: buildLocatorSet(el, document) },
    },
    stopFont
  );
}

export function startFont(): void {
  if (active) stopFont();
  active = true;
  lastSig = '';
  clearOverlay();
  document.addEventListener('mousemove', onHover, true);
  document.addEventListener('click', onPick, true);
}

export function stopFont(): void {
  if (!active) return;
  active = false;
  document.removeEventListener('mousemove', onHover, true);
  document.removeEventListener('click', onPick, true);
  destroyOverlay();
}
