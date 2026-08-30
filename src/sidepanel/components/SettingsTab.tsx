import type { ChangeEvent, ReactElement } from 'react';
import {
  ACCOUNT_TOOLTIP_DELAY_SECONDS_MAX,
  ACCOUNT_TOOLTIP_DELAY_SECONDS_MIN,
  FIND_TIMEOUT_SECONDS_MAX,
  FIND_TIMEOUT_SECONDS_MIN,
  FONT_PRESET_ZOOM,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STEP,
  HUD_SECONDS_MAX,
  HUD_SECONDS_MIN,
} from '@/shared/constants';
import type { FontSize } from '@/shared/types';
import { TagManager } from './TagManager';

interface Props {
  fontSize: FontSize;
  onFontSizeChange: (size: FontSize) => void;
  /** Manual fine-tune zoom, or undefined when on a plain preset. */
  fontScale: number | undefined;
  onFontScaleChange: (scale: number) => void;
  /** Seconds the Flow run popup lingers before it auto-closes. */
  hudSeconds: number;
  onHudSecondsChange: (seconds: number) => void;
  /** Seconds a Flow step waits for its element before giving up. */
  findTimeoutSeconds: number;
  onFindTimeoutChange: (seconds: number) => void;
  /** Seconds a saved account must be hovered before its description tooltip appears. */
  accountTooltipDelaySeconds: number;
  onAccountTooltipDelayChange: (seconds: number) => void;
  /** Track-tag colour overrides (tag → palette index), and its setter. */
  tagColors: Record<string, number>;
  onTagColorsChange: (next: Record<string, number>) => void;
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
  hudSeconds,
  onHudSecondsChange,
  findTimeoutSeconds,
  onFindTimeoutChange,
  accountTooltipDelaySeconds,
  onAccountTooltipDelayChange,
  tagColors,
  onTagColorsChange,
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

      <h3 className="section-title">Flow</h3>
      <div className="setting-row">
        <label className="setting-label" htmlFor="hud-seconds">
          Run popup auto-close (seconds)
        </label>
        <input
          id="hud-seconds"
          className="hud-seconds"
          type="number"
          min={HUD_SECONDS_MIN}
          max={HUD_SECONDS_MAX}
          step={1}
          value={hudSeconds}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const n = Math.round(Number(e.target.value));
            if (!Number.isFinite(n)) return;
            onHudSecondsChange(Math.min(HUD_SECONDS_MAX, Math.max(HUD_SECONDS_MIN, n)));
          }}
        />
      </div>
      <p className="hint">
        How long the on-page “Senmurv flow” popup stays after a flow finishes, before it disappears.
      </p>
      <div className="setting-row">
        <label className="setting-label" htmlFor="find-timeout">
          Element find timeout (seconds)
        </label>
        <input
          id="find-timeout"
          className="hud-seconds"
          type="number"
          min={FIND_TIMEOUT_SECONDS_MIN}
          max={FIND_TIMEOUT_SECONDS_MAX}
          step={1}
          value={findTimeoutSeconds}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const n = Math.round(Number(e.target.value));
            if (!Number.isFinite(n)) return;
            onFindTimeoutChange(
              Math.min(FIND_TIMEOUT_SECONDS_MAX, Math.max(FIND_TIMEOUT_SECONDS_MIN, n))
            );
          }}
        />
      </div>
      <p className="hint">
        How long each flow step waits for its element before giving up (a “Wait for element” step
        with its own timeout still wins).
      </p>

      <h3 className="section-title">Accounts</h3>
      <div className="setting-row">
        <label className="setting-label" htmlFor="account-tooltip-delay">
          Description tooltip delay (seconds)
        </label>
        <input
          id="account-tooltip-delay"
          className="hud-seconds"
          type="number"
          min={ACCOUNT_TOOLTIP_DELAY_SECONDS_MIN}
          max={ACCOUNT_TOOLTIP_DELAY_SECONDS_MAX}
          step={1}
          value={accountTooltipDelaySeconds}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const n = Math.round(Number(e.target.value));
            if (!Number.isFinite(n)) return;
            onAccountTooltipDelayChange(
              Math.min(
                ACCOUNT_TOOLTIP_DELAY_SECONDS_MAX,
                Math.max(ACCOUNT_TOOLTIP_DELAY_SECONDS_MIN, n)
              )
            );
          }}
        />
      </div>
      <p className="hint">
        How long the mouse must hover a saved account before its description tooltip appears.
      </p>

      <h3 className="section-title">Track tags</h3>
      <TagManager tagColors={tagColors} onTagColorsChange={onTagColorsChange} />
    </div>
  );
}
