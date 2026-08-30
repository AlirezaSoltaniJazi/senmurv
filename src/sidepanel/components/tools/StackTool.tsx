import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { browser } from '@/shared/browser-api';
import { MESSAGE_TYPES } from '@/shared/constants';
import { isRuntimeMessage, sendRuntimeMessage } from '@/shared/messages';
import type { StackLayer, StackReport, ToolPickData } from '@/shared/types';
import { CopyButton } from '@/sidepanel/components/CopyButton';

/** The stack arm of the pick union — the only one this tool handles. */
type StackPick = Extract<ToolPickData, { tool: 'stack' }>;

function relBadge(layer: StackLayer): { cls: string; text: string } {
  if (layer.relation === 'hit') return { cls: 'badge hit', text: 'hit' };
  if (layer.relation === 'above') return { cls: 'badge dim', text: 'click-through' };
  return layer.interactive
    ? { cls: 'badge fail', text: 'blocked ✕' }
    : { cls: 'badge dim', text: 'below' };
}

function Layer({ layer }: { layer: StackLayer }): ReactElement {
  const badge = relBadge(layer);
  return (
    <li className={`stack-layer${layer.relation === 'hit' ? ' hit' : ''}`}>
      <div className="stack-head">
        <span className={badge.cls}>{badge.text}</span>
        <code className="stack-tag">{layer.tag}</code>
        {layer.interactive && <span className="dim">clickable</span>}
      </div>
      <div className="stack-meta dim">
        z-index: {layer.zIndex} · {layer.position} · opacity {layer.opacity} · pointer-events:{' '}
        {layer.pointerEvents} · {layer.width}×{layer.height}
      </div>
      {layer.locator && (
        <div className="snippet-row">
          <div className="snippet-head">
            <span className="snippet-fw">{layer.locator.label}</span>
            <span className={`quality q-${layer.locator.quality}`}>{layer.locator.quality}</span>
            <CopyButton text={layer.locator.value} />
          </div>
          <code className="snippet-code">{layer.locator.value}</code>
        </div>
      )}
    </li>
  );
}

function Report({ report }: { report: StackReport }): ReactElement {
  return (
    <>
      {report.interceptsInteractive && (
        <div className="stack-warn">
          The click lands on a non-interactive overlay that is <strong>blocking</strong> a clickable
          element below it — the usual cause of an “element click intercepted / not clickable at
          point” failure. The interceptor is marked <span className="badge hit">hit</span>.
        </div>
      )}
      <p className="hint dim">
        {report.layers.length} element{report.layers.length === 1 ? '' : 's'} at ({report.point.x},{' '}
        {report.point.y}), top first.
      </p>
      <ul className="stack-list">
        {report.layers.map((layer, i) => (
          <Layer key={i} layer={layer} />
        ))}
      </ul>
    </>
  );
}

export function StackTool(): ReactElement {
  const [picked, setPicked] = useState<StackPick | null>(null);

  useEffect(() => {
    void sendRuntimeMessage({ type: MESSAGE_TYPES.START_TOOL_MODE, payload: { mode: 'stack' } });
  }, []);

  useEffect(() => {
    function onMessage(message: unknown): void {
      if (!isRuntimeMessage(message)) return;
      if (message.type === MESSAGE_TYPES.TOOL_PICKED && message.payload.tool === 'stack') {
        setPicked(message.payload);
      }
    }
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, []);

  return (
    <>
      <p className="hint">
        Click a point to see every element stacked under it, top to bottom, and which one actually
        receives the click — so you can find the overlay intercepting a click your test expects to
        land elsewhere.
      </p>
      {picked === null ? (
        <p className="hint dim">No point inspected yet.</p>
      ) : (
        <Report report={picked.data} />
      )}
    </>
  );
}
