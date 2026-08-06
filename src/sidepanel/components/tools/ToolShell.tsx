import { useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { sendRuntimeMessage } from '@/shared/messages';
import type { ToolDescriptor } from '@/shared/tools';
import type { Result } from '@/shared/types';

interface Props {
  tool: ToolDescriptor;
  onBack: () => void;
  children?: ReactNode;
}

/** Outcome of the page-reachability probe. One state, so the effect sets it once. */
type Probe = { status: 'checking' } | { status: 'ok' } | { status: 'error'; message: string };

/**
 * The frame every Tools sub-tool renders inside: title, standing limits, the
 * unreachable-page gate, and — the part that matters — the ONE place an
 * in-page mode is torn down. Switching tool, switching tab and closing the
 * panel all unmount this component, so a mode can never be left running.
 */
export function ToolShell({ tool, onBack, children }: Props): ReactElement {
  const [probe, setProbe] = useState<Probe>(() =>
    tool.requiresPage ? { status: 'checking' } : { status: 'ok' }
  );

  // Reachability probe. It doubles as the loader for the lazy in-page tools
  // chunk, so a tool never starts a mode only to find the page can't host it.
  useEffect(() => {
    if (!tool.requiresPage) return undefined;
    let cancelled = false;
    void (async () => {
      const res = await sendRuntimeMessage<Result<{ ready: boolean }>>({
        type: MESSAGE_TYPES.TOOL_PING,
      });
      if (cancelled) return;
      setProbe(res.ok ? { status: 'ok' } : { status: 'error', message: res.error });
    })();
    return () => {
      cancelled = true;
    };
  }, [tool.requiresPage]);

  const mode = tool.mode;
  useEffect(() => {
    if (mode === null) return undefined;
    return () => {
      void sendRuntimeMessage({ type: MESSAGE_TYPES.STOP_TOOL_MODE, payload: { mode } });
    };
  }, [mode]);

  return (
    <>
      <div className="row">
        <button type="button" onClick={onBack}>
          ← Tools
        </button>
      </div>
      <h2 className="section-title">
        {tool.icon} {tool.label}
      </h2>
      <p className="hint">{tool.blurb}</p>
      {probe.status === 'checking' && <p className="hint">Checking the page…</p>}
      {probe.status === 'error' && <p className="error">{probe.message}</p>}
      {probe.status === 'ok' &&
        (tool.isReady ? (
          children
        ) : (
          <p className="hint">Not built yet — coming in a later release.</p>
        ))}
    </>
  );
}
