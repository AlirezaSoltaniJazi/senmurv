import { useState } from 'react';
import type { ChangeEvent, ReactElement } from 'react';
import {
  ACCOUNT_APPLY_RESULT_DISPLAY_SECONDS_MAX,
  ACCOUNT_APPLY_RESULT_DISPLAY_SECONDS_MIN,
  ACCOUNT_LOGIN_ERROR_DISPLAY_SECONDS_MAX,
  ACCOUNT_LOGIN_ERROR_DISPLAY_SECONDS_MIN,
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
  LOGICAL_NAMES_MAX_MAX,
  LOGICAL_NAMES_MAX_MIN,
  MATCH_HIGHLIGHT_MAX_MAX,
  MATCH_HIGHLIGHT_MAX_MIN,
  MAX_PINNED_TOOLS_MAX,
  MAX_PINNED_TOOLS_MIN,
  NAVIGATE_TIMEOUT_SECONDS_MAX,
  NAVIGATE_TIMEOUT_SECONDS_MIN,
  NOTES_AUTOSAVE_MS_MAX,
  NOTES_AUTOSAVE_MS_MIN,
  SITE_DATA_CONFIRM_SECONDS_MAX,
  SITE_DATA_CONFIRM_SECONDS_MIN,
  TAB_ORDER_MAX_STOPS_MAX,
  TAB_ORDER_MAX_STOPS_MIN,
} from '@/shared/constants';
import { RANDOM_NUMBER_LENGTH_MAX, RANDOM_NUMBER_LENGTH_MIN } from '@/shared/faker-data';
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
  /** How many tools can be pinned to the top of the Tools launcher at once. */
  maxPinnedTools: number;
  onMaxPinnedToolsChange: (n: number) => void;
  /** Cap on tab-order stops the Tab Order tool scans before giving up. */
  tabOrderMaxStops: number;
  onTabOrderMaxStopsChange: (n: number) => void;
  /** Cap on drawn locator-match badges (Locator tab's "highlight every match"). */
  matchHighlightMax: number;
  onMatchHighlightMaxChange: (n: number) => void;
  /** Cap on drawn Dynamics/Power Apps field labels (Logical Names tool). */
  logicalNamesMax: number;
  onLogicalNamesMaxChange: (n: number) => void;
  /** Seconds one-click Accounts login waits for the navigated page to finish loading. */
  navigateTimeoutSeconds: number;
  onNavigateTimeoutSecondsChange: (n: number) => void;
  /** Digit count the Data tab's random number field starts at on a fresh visit. */
  randomNumberLengthDefault: number;
  onRandomNumberLengthDefaultChange: (n: number) => void;
  /** Seconds the Site data tool's "click again to confirm" window stays armed. */
  siteDataConfirmSeconds: number;
  onSiteDataConfirmSecondsChange: (n: number) => void;
  /** Seconds an Accounts login-error banner stays visible. */
  accountLoginErrorDisplaySeconds: number;
  onAccountLoginErrorDisplaySecondsChange: (n: number) => void;
  /** Seconds an Accounts "Apply to group(s)" result banner stays visible. */
  accountApplyResultDisplaySeconds: number;
  onAccountApplyResultDisplaySecondsChange: (n: number) => void;
  /** Milliseconds a Notes draft sits idle before autosaving. */
  notesAutosaveMs: number;
  onNotesAutosaveMsChange: (n: number) => void;
}

const FONT_SIZES: { value: FontSize; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'xlarge', label: 'X-Large' },
];

type SettingsSection =
  | 'appearance'
  | 'flow'
  | 'accounts'
  | 'tools'
  | 'locator'
  | 'data'
  | 'notes'
  | 'tags';

const SECTIONS: { key: SettingsSection; label: string }[] = [
  { key: 'appearance', label: 'Appearance' },
  { key: 'flow', label: 'Flow' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'tools', label: 'Tools' },
  { key: 'locator', label: 'Locator' },
  { key: 'data', label: 'Data' },
  { key: 'notes', label: 'Notes' },
  { key: 'tags', label: 'Track Tags' },
];

/** A labelled, bounded number input — clamped and rounded to whole numbers on change. */
function NumberSetting({
  id,
  label,
  hint,
  min,
  max,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  min: number;
  max: number;
  value: number;
  onChange: (n: number) => void;
}): ReactElement {
  return (
    <>
      <div className="setting-row">
        <label className="setting-label" htmlFor={id}>
          {label}
        </label>
        <input
          id={id}
          className="hud-seconds"
          type="number"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const n = Math.round(Number(e.target.value));
            if (!Number.isFinite(n)) return;
            onChange(Math.min(max, Math.max(min, n)));
          }}
        />
      </div>
      <p className="hint">{hint}</p>
    </>
  );
}

/** Settings tab — one section at a time, picked via the chip row. */
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
  maxPinnedTools,
  onMaxPinnedToolsChange,
  tabOrderMaxStops,
  onTabOrderMaxStopsChange,
  matchHighlightMax,
  onMatchHighlightMaxChange,
  logicalNamesMax,
  onLogicalNamesMaxChange,
  navigateTimeoutSeconds,
  onNavigateTimeoutSecondsChange,
  randomNumberLengthDefault,
  onRandomNumberLengthDefaultChange,
  siteDataConfirmSeconds,
  onSiteDataConfirmSecondsChange,
  accountLoginErrorDisplaySeconds,
  onAccountLoginErrorDisplaySecondsChange,
  accountApplyResultDisplaySeconds,
  onAccountApplyResultDisplaySecondsChange,
  notesAutosaveMs,
  onNotesAutosaveMsChange,
}: Props): ReactElement {
  // The slider sits at the manual scale when set, else the active preset's zoom.
  const sliderValue = fontScale ?? FONT_PRESET_ZOOM[fontSize];
  const [section, setSection] = useState<SettingsSection>('appearance');

  return (
    <div className="tab">
      <div className="chips">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={section === s.key ? 'chip active' : 'chip'}
            onClick={() => setSection(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === 'appearance' && (
        <>
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
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                onFontScaleChange(Number(e.target.value))
              }
            />
            <span className="font-scale-value">{Math.round(sliderValue * 100)}%</span>
          </div>
          <p className="hint">
            Presets are one click; the slider fine-tunes exact scale. Applies here and in the
            full-page view.
          </p>
        </>
      )}

      {section === 'flow' && (
        <>
          <h3 className="section-title">Flow</h3>
          <NumberSetting
            id="hud-seconds"
            label="Run popup auto-close (seconds)"
            hint={
              'How long the on-page "Senmurv flow" popup stays after a flow finishes, before it disappears.'
            }
            min={HUD_SECONDS_MIN}
            max={HUD_SECONDS_MAX}
            value={hudSeconds}
            onChange={onHudSecondsChange}
          />
          <NumberSetting
            id="find-timeout"
            label="Element find timeout (seconds)"
            hint={
              'How long each flow step waits for its element before giving up (a "Wait for element" step with its own timeout still wins).'
            }
            min={FIND_TIMEOUT_SECONDS_MIN}
            max={FIND_TIMEOUT_SECONDS_MAX}
            value={findTimeoutSeconds}
            onChange={onFindTimeoutChange}
          />
        </>
      )}

      {section === 'accounts' && (
        <>
          <h3 className="section-title">Accounts</h3>
          <NumberSetting
            id="account-tooltip-delay"
            label="Description tooltip delay (seconds)"
            hint="How long the mouse must hover a saved account before its description tooltip appears."
            min={ACCOUNT_TOOLTIP_DELAY_SECONDS_MIN}
            max={ACCOUNT_TOOLTIP_DELAY_SECONDS_MAX}
            value={accountTooltipDelaySeconds}
            onChange={onAccountTooltipDelayChange}
          />
          <NumberSetting
            id="navigate-timeout"
            label="Login navigate timeout (seconds)"
            hint="How long one-click login waits for the address to finish loading before giving up."
            min={NAVIGATE_TIMEOUT_SECONDS_MIN}
            max={NAVIGATE_TIMEOUT_SECONDS_MAX}
            value={navigateTimeoutSeconds}
            onChange={onNavigateTimeoutSecondsChange}
          />
          <NumberSetting
            id="login-error-display"
            label="Login error banner (seconds)"
            hint="How long a login-error message stays visible before it auto-dismisses."
            min={ACCOUNT_LOGIN_ERROR_DISPLAY_SECONDS_MIN}
            max={ACCOUNT_LOGIN_ERROR_DISPLAY_SECONDS_MAX}
            value={accountLoginErrorDisplaySeconds}
            onChange={onAccountLoginErrorDisplaySecondsChange}
          />
          <NumberSetting
            id="apply-result-display"
            label={'"Apply to group(s)" result banner (seconds)'}
            hint="How long the Apply-to-group(s) outcome message stays visible before it clears."
            min={ACCOUNT_APPLY_RESULT_DISPLAY_SECONDS_MIN}
            max={ACCOUNT_APPLY_RESULT_DISPLAY_SECONDS_MAX}
            value={accountApplyResultDisplaySeconds}
            onChange={onAccountApplyResultDisplaySecondsChange}
          />
        </>
      )}

      {section === 'tools' && (
        <>
          <h3 className="section-title">Tools</h3>
          <NumberSetting
            id="max-pinned-tools"
            label="Max pinned tools"
            hint="How many tools can be pinned to the top of the Tools launcher at once."
            min={MAX_PINNED_TOOLS_MIN}
            max={MAX_PINNED_TOOLS_MAX}
            value={maxPinnedTools}
            onChange={onMaxPinnedToolsChange}
          />
          <NumberSetting
            id="tab-order-max-stops"
            label="Tab order scan cap"
            hint="Safety cap on how many stops the Tab Order tool scans before giving up."
            min={TAB_ORDER_MAX_STOPS_MIN}
            max={TAB_ORDER_MAX_STOPS_MAX}
            value={tabOrderMaxStops}
            onChange={onTabOrderMaxStopsChange}
          />
          <NumberSetting
            id="logical-names-max"
            label="Logical names draw cap"
            hint="Cap on how many Dynamics/Power Apps field labels the Logical Names tool draws."
            min={LOGICAL_NAMES_MAX_MIN}
            max={LOGICAL_NAMES_MAX_MAX}
            value={logicalNamesMax}
            onChange={onLogicalNamesMaxChange}
          />
          <NumberSetting
            id="site-data-confirm"
            label="Clear Site Data confirm window (seconds)"
            hint={'How long the "click again to confirm" window stays armed before it resets.'}
            min={SITE_DATA_CONFIRM_SECONDS_MIN}
            max={SITE_DATA_CONFIRM_SECONDS_MAX}
            value={siteDataConfirmSeconds}
            onChange={onSiteDataConfirmSecondsChange}
          />
        </>
      )}

      {section === 'locator' && (
        <>
          <h3 className="section-title">Locator</h3>
          <NumberSetting
            id="match-highlight-max"
            label="Highlight-all-matches draw cap"
            hint="Cap on how many matches the Locator tab draws when highlighting every match of a selector."
            min={MATCH_HIGHLIGHT_MAX_MIN}
            max={MATCH_HIGHLIGHT_MAX_MAX}
            value={matchHighlightMax}
            onChange={onMatchHighlightMaxChange}
          />
        </>
      )}

      {section === 'data' && (
        <>
          <h3 className="section-title">Data</h3>
          <NumberSetting
            id="random-number-length-default"
            label="Default random number length (digits)"
            hint="Digit count the Data tab's random number field starts at on a fresh visit."
            min={RANDOM_NUMBER_LENGTH_MIN}
            max={RANDOM_NUMBER_LENGTH_MAX}
            value={randomNumberLengthDefault}
            onChange={onRandomNumberLengthDefaultChange}
          />
        </>
      )}

      {section === 'notes' && (
        <>
          <h3 className="section-title">Notes</h3>
          <NumberSetting
            id="notes-autosave-ms"
            label="Draft autosave delay (ms)"
            hint="How long a title/body field must sit idle before an in-progress draft autosaves."
            min={NOTES_AUTOSAVE_MS_MIN}
            max={NOTES_AUTOSAVE_MS_MAX}
            value={notesAutosaveMs}
            onChange={onNotesAutosaveMsChange}
          />
        </>
      )}

      {section === 'tags' && (
        <>
          <h3 className="section-title">Track tags</h3>
          <TagManager tagColors={tagColors} onTagColorsChange={onTagColorsChange} />
        </>
      )}
    </div>
  );
}
