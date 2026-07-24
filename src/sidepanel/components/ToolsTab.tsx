import type { ReactElement } from 'react';
import { findTool, TOOLS } from '@/shared/tools';
import type { ToolKey } from '@/shared/tools';
import { ToolShell } from './tools/ToolShell';
import { UnlockTool } from './tools/UnlockTool';

interface Props {
  /** The open tool, or null for the launcher. Lifted into App so it survives tab switches. */
  tool: ToolKey | null;
  setTool: (tool: ToolKey | null) => void;
  /** Hand a generated script to the Scripts tab. */
  onSaveScript: (name: string, code: string) => void;
}

/**
 * Launcher ⇄ detail. One tool at a time gets the panel's full height, which the
 * long findings lists (tab order, accessibility) need — a persistent chip row
 * would eat two lines of it at side-panel widths.
 */
export function ToolsTab({ tool, setTool, onSaveScript }: Props): ReactElement {
  if (tool === null) {
    return (
      <div className="tab">
        <p className="hint">Inspect and unblock the page. Pick a tool to start.</p>
        <ul className="tool-list">
          {TOOLS.map((t) => (
            <li key={t.key}>
              <button type="button" className="tool-row" onClick={() => setTool(t.key)}>
                <span className="tool-row-name">{t.label}</span>
                <span className="tool-row-blurb">{t.blurb}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="tab">
      {/* Keyed on the tool so switching remounts the shell: fresh probe state, and
          the outgoing tool's stop-on-unmount effect actually fires. */}
      <ToolShell key={tool} tool={findTool(tool)} onBack={() => setTool(null)}>
        {tool === 'unlock' && <UnlockTool onSaveScript={onSaveScript} />}
      </ToolShell>
    </div>
  );
}
