import { MESSAGE_TYPES } from '@/shared/constants';
import { notify, notifyQuiet } from '@/content/context';
import { buildLocatorSet } from '@/shared/locators';
import { clearOverlay, destroyOverlay, drawBoxes, flashOverlay, targetAt } from '@/content/overlay';
import { rafThrottle } from '@/content/raf-throttle';
import type { RafThrottled } from '@/content/raf-throttle';
import { parseColor, toFormats } from '@/shared/tools/color';
import { compositeOver, contrastVerdict } from '@/shared/tools/contrast';
import { resolveEffectiveBackground } from '@/shared/tools/element-colors';
import type { BackgroundLayer } from '@/shared/tools/element-colors';
import type { ColorReport, ColorSwatch } from '@/shared/types';

/**
 * The in-page Colour mode: hover an element to read its colours and WCAG
 * contrast, click to pin it (with copy-ready locators). Colour reading needs the
 * effective background, which is an ancestor walk over live DOM — hence a
 * content-script mode rather than a pure module.
 */

let active = false;
let lastSig = '';
let lastSent = 0;
let hover: RafThrottled | null = null;

function px(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function swatch(role: string, raw: string): ColorSwatch {
  const rgba = parseColor(raw);
  return { role, raw, rgba, formats: rgba ? toFormats(rgba) : null };
}

function readColors(el: HTMLElement): ColorReport {
  const s = getComputedStyle(el);
  const warnings: string[] = [];

  const text = swatch('text', s.color);
  const swatches: ColorSwatch[] = [text, swatch('background', s.backgroundColor)];
  if (px(s.borderTopWidth) > 0) swatches.push(swatch('border', s.borderTopColor));
  if (s.outlineStyle !== 'none' && px(s.outlineWidth) > 0) {
    swatches.push(swatch('outline', s.outlineColor));
  }

  // Ancestor layers, nearest first, for the effective background.
  const layers: BackgroundLayer[] = [];
  for (let node: Element | null = el; node !== null; node = node.parentElement) {
    const cs = getComputedStyle(node);
    layers.push({
      color: parseColor(cs.backgroundColor),
      opacity: px(cs.opacity) || 1,
      hasImage: cs.backgroundImage !== 'none' && cs.backgroundImage !== '',
    });
  }
  const eff = resolveEffectiveBackground(layers);
  warnings.push(...eff.warnings);

  const effRgba = { ...eff.rgb, a: 1 };
  swatches.push({
    role: 'effective background',
    raw: `rgb(${eff.rgb.r}, ${eff.rgb.g}, ${eff.rgb.b})`,
    rgba: effRgba,
    formats: toFormats(effRgba),
  });

  let contrast: ColorReport['contrast'] = null;
  if (text.rgba !== null) {
    // Composite translucent text over the effective background before grading.
    const textRgb = text.rgba.a < 1 ? compositeOver(text.rgba, eff.rgb) : text.rgba;
    contrast = contrastVerdict(textRgb, eff.rgb, px(s.fontSize) || 16, s.fontWeight);
  } else if (text.raw.trim() !== '') {
    warnings.push('Text colour is not an sRGB colour, so contrast could not be computed.');
  }

  return {
    tag: el.tagName.toLowerCase(),
    swatches,
    contrast,
    warnings: [...new Set(warnings)],
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

function label(report: ColorReport): string {
  const bg = report.swatches.find((s) => s.role === 'effective background');
  const ratio = report.contrast ? `  ${report.contrast.ratio}:1` : '';
  return `${bg?.formats?.hex ?? ''}${ratio}`;
}

function stream(report: ColorReport): void {
  // Cheap time gate first, so the ~10 Hz throttle skips the expensive
  // JSON.stringify on the frames it would drop anyway.
  const now = Date.now();
  if (now - lastSent < 100) return;
  const sig = JSON.stringify(report);
  if (sig === lastSig) return;
  lastSig = sig;
  lastSent = now;
  notifyQuiet({ type: MESSAGE_TYPES.TOOL_STREAM, payload: { tool: 'color', data: report } });
}

function onHover(e: MouseEvent): void {
  const el = targetAt(e.clientX, e.clientY);
  if (!(el instanceof HTMLElement)) return;
  const report = readColors(el);
  outline(el, label(report));
  stream(report);
}

function onPick(e: MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  const el = targetAt(e.clientX, e.clientY);
  if (!(el instanceof HTMLElement)) return;
  const report = readColors(el);
  outline(el, label(report));
  flashOverlay();
  notify(
    {
      type: MESSAGE_TYPES.TOOL_PICKED,
      payload: { tool: 'color', data: report, locators: buildLocatorSet(el, document) },
    },
    stopColor
  );
}

export function startColor(): void {
  if (active) stopColor();
  active = true;
  lastSig = '';
  clearOverlay();
  hover = rafThrottle(onHover);
  document.addEventListener('mousemove', hover.handler, true);
  document.addEventListener('click', onPick, true);
}

export function stopColor(): void {
  if (!active) return;
  active = false;
  if (hover) {
    document.removeEventListener('mousemove', hover.handler, true);
    hover.cancel();
    hover = null;
  }
  document.removeEventListener('click', onPick, true);
  destroyOverlay();
}
