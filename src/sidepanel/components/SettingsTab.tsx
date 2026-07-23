import type { ChangeEvent, ReactElement } from 'react';
import {
  FONT_PRESET_ZOOM,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STEP,
} from '@/shared/constants';
import type { FontSize } from '@/shared/types';

interface Props {
  fontSize: FontSize;
  onFontSizeChange: (size: FontSize) => void;
  /** Manual fine-tune zoom, or undefined when on a plain preset. */
  fontScale: number | undefined;
  onFontScaleChange: (scale: number) => void;
}

const FONT_SIZES: { value: FontSize; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'xlarge', label: 'X-Large' },
];

/** Settings tab — panel font size (UI scale): preset chips plus a fine-tune slider. */
export function SettingsTab({
  fontSize,
  onFontSizeChange,
  fontScale,
  onFontScaleChange,
}: Props): ReactElement {
  // The slider sits at the manual scale when set, else the active preset's zoom.
  const sliderValue = fontScale ?? FONT_PRESET_ZOOM[fontSize];
  return (
    <div className="tab">
      <h3 className="section-title">Appearance</h3>
      <div className="setting-row">
        <span className="setting-label">Font size</span>
        <div className="chips">
          {FONT_SIZES.map((size) => (
            <button
              key={size.value}
              type="button"
              className={
                fontScale === undefined && fontSize === size.value ? 'chip active' : 'chip'
              }
              onClick={() => onFontSizeChange(size.value)}
            >
              {size.label}
            </button>
          ))}
        </div>
      </div>
      <div className="setting-row">
        <span className="setting-label">Fine-tune</span>
        <input
          className="font-scale"
          type="range"
          min={FONT_SCALE_MIN}
          max={FONT_SCALE_MAX}
          step={FONT_SCALE_STEP}
          value={sliderValue}
          aria-label="Fine-tune font scale"
          onChange={(e: ChangeEvent<HTMLInputElement>) => onFontScaleChange(Number(e.target.value))}
        />
        <span className="font-scale-value">{Math.round(sliderValue * 100)}%</span>
      </div>
      <p className="hint">
        Presets are one click; the slider fine-tunes exact scale. Applies here and in the full-page
        view.
      </p>
    </div>
  );
}
