import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';
import { filterSuggestions } from '@/shared/tasks';

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Candidate strings to suggest from (e.g. existing titles or tags). */
  options: string[];
  placeholder?: string;
  /** Class applied to the inner `<input>`. */
  className?: string;
  /** Class applied to the positioning wrapper (for flex/layout in a row). */
  wrapperClassName?: string;
  ariaLabel?: string;
  /** Fired on Enter when no suggestion is highlighted — e.g. to submit the form. */
  onEnter?: () => void;
  /** Maximum suggestions shown. */
  limit?: number;
}

/**
 * A controlled text input with a case-insensitive typeahead dropdown built from
 * `options` (see {@link filterSuggestions}). Prefix matches rank first; the list
 * is keyboard-navigable (↑/↓ to move, Enter to accept, Esc to dismiss) and
 * mouse-selectable. When nothing is highlighted, Enter falls through to
 * `onEnter` so the surrounding form can still submit on Enter.
 */
export function AutocompleteInput({
  value,
  onChange,
  options,
  placeholder,
  className,
  wrapperClassName,
  ariaLabel,
  onEnter,
  limit = 8,
}: Props): ReactElement {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // Pending blur-close timer, cancelled on refocus so a fast blur→refocus within
  // the delay can't collapse a dropdown the user just reopened.
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelBlurClose(): void {
    if (blurTimer.current !== null) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  }

  useEffect(() => cancelBlurClose, []);

  const suggestions = filterSuggestions(options, value, limit);
  // Hide the dropdown when the only suggestion already equals the typed value —
  // there is nothing new to pick.
  const redundant =
    suggestions.length === 1 && suggestions[0]!.toLowerCase() === value.trim().toLowerCase();
  const visible = open && suggestions.length > 0 && !redundant;
  const activeIndex = active < suggestions.length ? active : -1;

  function choose(next: string): void {
    onChange(next);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (visible) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => (a + 1 >= suggestions.length ? 0 : a + 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => (a <= 0 ? suggestions.length - 1 : a - 1));
        return;
      }
      if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        choose(suggestions[activeIndex]!);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
        return;
      }
      if (e.key === 'Tab') {
        setOpen(false);
        return;
      }
    }
    if (e.key === 'Enter') {
      setOpen(false);
      onEnter?.();
    }
  }

  return (
    <div className={wrapperClassName ? `autocomplete ${wrapperClassName}` : 'autocomplete'}>
      <input
        className={className}
        type="text"
        role="combobox"
        aria-expanded={visible}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          visible && activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined
        }
        autoComplete="off"
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => {
          cancelBlurClose();
          setOpen(true);
        }}
        // Delay close so a click on a suggestion (which blurs the input) still lands.
        onBlur={() => {
          cancelBlurClose();
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={onKeyDown}
      />
      {visible && (
        <ul className="autocomplete-list" id={listId} role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={i === activeIndex ? 'autocomplete-option active' : 'autocomplete-option'}
              // Keep focus on the input so onBlur→close doesn't beat the click.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(s)}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
