import { useState } from 'react';
import type { ReactElement } from 'react';

interface Props {
  text: string;
  label?: string;
  /**
   * Extra class(es) on the button. `.copy-btn` is compact by default (for use
   * inline next to a value); pass `copy-btn-lg` to size it like a standard action
   * button when it sits in a row alongside them.
   */
  className?: string;
}

export function CopyButton({ text, label = 'Copy', className }: Props): ReactElement {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard can be unavailable without focus; ignore silently.
    }
  }

  return (
    <button
      type="button"
      className={className ? `copy-btn ${className}` : 'copy-btn'}
      onClick={() => void copy()}
    >
      {copied ? 'Copied' : label}
    </button>
  );
}
