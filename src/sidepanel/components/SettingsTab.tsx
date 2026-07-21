import type { ReactElement } from 'react';
import type { FontSize } from '@/shared/types';

interface Props {
  fontSize: FontSize;
  onFontSizeChange: (size: FontSize) => void;
}

const FONT_SIZES: { value: FontSize; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
];

/** Settings tab — currently the panel font size (UI scale). */
export function SettingsTab({ fontSize, onFontSizeChange }: Props): ReactElement {
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
              className={fontSize === size.value ? 'chip active' : 'chip'}
              onClick={() => onFontSizeChange(size.value)}
            >
              {size.label}
            </button>
          ))}
        </div>
      </div>
      <p className="hint">Scales the whole panel. Applies here and in the full-page view.</p>
    </div>
  );
}
