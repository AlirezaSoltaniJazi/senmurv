import { useState } from 'react';
import type { ReactElement } from 'react';

interface Props {
  text: string;
  label?: string;
}

export function CopyButton({ text, label = 'Copy' }: Props): ReactElement {
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
    <button type="button" className="copy-btn" onClick={() => void copy()}>
      {copied ? 'Copied' : label}
    </button>
  );
}
