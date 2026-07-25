/**
 * The EyeDropper API is not in TypeScript's DOM lib and no `@types` package
 * ships it, so `new EyeDropper()` is a hard TS2304 without this declaration.
 * It is experimental and Chromium-only (absent on Linux Wayland, Android, and
 * ChromeOS < 120); the Colour tool feature-detects with `'EyeDropper' in window`
 * before using it.
 *
 * https://developer.mozilla.org/en-US/docs/Web/API/EyeDropper
 */

interface ColorSelectionResult {
  /** The picked colour as a `#rrggbb` sRGB hex string. */
  readonly sRGBHex: string;
}

interface ColorSelectionOptions {
  readonly signal?: AbortSignal;
}

interface EyeDropper {
  open(options?: ColorSelectionOptions): Promise<ColorSelectionResult>;
}

interface EyeDropperConstructor {
  new (): EyeDropper;
}

interface Window {
  EyeDropper?: EyeDropperConstructor;
}
