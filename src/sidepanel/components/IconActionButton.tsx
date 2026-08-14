import type { ReactElement } from 'react';

interface Props {
  /** A short glyph shown alongside (wide) or instead of (narrow) the label. */
  icon: string;
  /** The button's name — its accessible name, label text, and (unless `title` overrides it) tooltip. */
  label: string;
  onClick: () => void;
  /** Extra class(es), e.g. 'primary' or 'danger'. */
  className?: string;
  disabled?: boolean;
  /** Override the native hover tooltip (defaults to `label`). */
  title?: string;
}

/**
 * An action button that adapts to available space: icon + label when there's
 * room to spare, just the label at normal panel widths, and icon-only (with a
 * hover tooltip) when space is tight. See `.icon-collapse` in styles.css.
 */
export function IconActionButton({
  icon,
  label,
  onClick,
  className,
  disabled,
  title,
}: Props): ReactElement {
  return (
    <button
      type="button"
      className={className ? `icon-collapse ${className}` : 'icon-collapse'}
      aria-label={label}
      title={title ?? label}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="ico" aria-hidden="true">
        {icon}
      </span>
      <span className="lbl">{label}</span>
    </button>
  );
}
