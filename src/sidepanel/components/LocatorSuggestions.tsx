import type { ReactElement } from 'react';
import { FRAMEWORK_LABELS, FRAMEWORKS } from '@/shared/constants';
import type { Framework, LocatorSuggestion } from '@/shared/types';
import { CopyButton } from './CopyButton';

/**
 * The ranked-locator list, extracted from LocatorTab so every Tools sub-tool
 * can emit copy-ready locators for the element it acted on without restating
 * the markup. Keep the DOM identical to what LocatorTab rendered — the styling
 * for `.locator-card` / `.snippet-list` depends on this exact shape.
 */

/** A framework filter, or `all` to show every snippet. */
export type FrameworkFilter = Framework | 'all';

const FRAMEWORK_FILTERS: { key: FrameworkFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  ...FRAMEWORKS.map((f) => ({ key: f as FrameworkFilter, label: FRAMEWORK_LABELS[f] ?? f })),
];

/** Live match count for a locator: unique / no match / N matches. */
export function CountBadge({ count }: { count: number | undefined }): ReactElement | null {
  if (count === undefined) return null;
  if (count === 1) return <span className="count unique">unique</span>;
  if (count === 0) return <span className="count none">no match</span>;
  return <span className="count many">{count} matches</span>;
}

/** The framework filter chip row. */
export function FrameworkChips({
  filter,
  onChange,
}: {
  filter: FrameworkFilter;
  onChange: (filter: FrameworkFilter) => void;
}): ReactElement {
  return (
    <div className="chips">
      {FRAMEWORK_FILTERS.map((f) => (
        <button
          key={f.key}
          type="button"
          className={filter === f.key ? 'chip active' : 'chip'}
          onClick={() => onChange(f.key)}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

/** Ranked locator suggestions, each with its per-framework snippets. */
export function LocatorSuggestions({
  suggestions,
  filter,
}: {
  suggestions: LocatorSuggestion[];
  filter: FrameworkFilter;
}): ReactElement {
  return (
    <ul className="locator-list">
      {suggestions.map((s) => {
        const shown =
          filter === 'all' ? s.snippets : s.snippets.filter((sn) => sn.framework === filter);
        return (
          <li key={`${s.strategy}-${s.value}`} className="locator-card">
            <div className="locator-head">
              <span className="locator-label">{s.label}</span>
              {s.recommended && <span className="badge">recommended</span>}
              <CountBadge count={s.matchCount} />
              <span className={`quality q-${s.quality}`}>{s.quality}</span>
            </div>
            <div className="locator-value">
              <code>{s.value}</code>
              <CopyButton text={s.value} />
            </div>
            {shown.length > 0 && (
              <ul className="snippet-list">
                {shown.map((sn) => (
                  <li key={`${sn.framework}-${sn.label}`} className="snippet-row">
                    <div className="snippet-head">
                      <span className="snippet-fw">
                        {FRAMEWORK_LABELS[sn.framework] ?? sn.framework}
                      </span>
                      <span className="snippet-label">{sn.label}</span>
                      <CopyButton text={sn.code} />
                    </div>
                    <code className="snippet-code">{sn.code}</code>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
