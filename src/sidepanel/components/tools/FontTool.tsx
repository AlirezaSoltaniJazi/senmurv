import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { isRuntimeMessage, sendRuntimeMessage } from '@/shared/messages';
import type { FontInfo, FontSource, ToolPickData } from '@/shared/types';
import { CopyButton } from '@/sidepanel/components/CopyButton';
import { FrameworkChips, LocatorSuggestions } from '@/sidepanel/components/LocatorSuggestions';
import type { FrameworkFilter } from '@/sidepanel/components/LocatorSuggestions';

type FontPick = Extract<ToolPickData, { tool: 'font' }>;

const SOURCE_LABEL: Record<FontSource, string> = {
  web: 'web font',
  local: 'local / system',
  generic: 'generic fallback',
  unknown: 'fallback (unavailable)',
};

function Row({
  label,
  value,
  copy,
}: {
  label: string;
  value: string;
  copy?: boolean;
}): ReactElement {
  return (
    <div className="data-row">
      <span className="data-key">{label}</span>
      <span className="data-value">{value}</span>
      {copy === true && <CopyButton text={value} />}
    </div>
  );
}

function Report({ info }: { info: FontInfo }): ReactElement {
  const lh =
    info.lineHeight.px !== null
      ? `${info.lineHeight.px}px${info.lineHeight.ratio !== null ? ` (${info.lineHeight.ratio}×)` : ''}`
      : info.lineHeight.raw;
  return (
    <>
      <div className="swatch-row">
        <span className="badge">{SOURCE_LABEL[info.rendered.source]}</span>
        <span className="contrast-ratio" style={{ fontSize: '18px' }}>
          {info.rendered.family}
        </span>
        <CopyButton text={info.rendered.family} label="Copy name" />
      </div>
      {info.rendered.src !== null && <p className="hint">@font-face src: {info.rendered.src}</p>}

      <div className="data-list">
        <Row label="stack" value={info.stack.join(', ')} copy />
        <Row label="size" value={`${info.size.px}px · ${info.size.pt}pt · ${info.size.rem}rem`} />
        <Row label="weight" value={`${info.weight.value} — ${info.weight.name}`} />
        <Row label="style" value={info.style} />
        <Row label="line height" value={lh} />
        {info.letterSpacing !== 'normal' && (
          <Row label="letter spacing" value={info.letterSpacing} />
        )}
        {info.wordSpacing !== 'normal' && <Row label="word spacing" value={info.wordSpacing} />}
        {info.textTransform !== 'none' && <Row label="text transform" value={info.textTransform} />}
        {info.fontVariant !== 'normal' && <Row label="font variant" value={info.fontVariant} />}
        <Row label="colour" value={info.color} copy />
      </div>

      <h3 className="section-title">CSS shorthand</h3>
      <div className="snippet-row">
        <div className="snippet-head">
          <span className="snippet-fw">font</span>
          <CopyButton text={info.shorthand} />
        </div>
        <code className="snippet-code">font: {info.shorthand};</code>
      </div>
    </>
  );
}

export function FontTool(): ReactElement {
  const [live, setLive] = useState<FontInfo | null>(null);
  const [picked, setPicked] = useState<FontPick | null>(null);
  const [filter, setFilter] = useState<FrameworkFilter>('all');

  useEffect(() => {
    void sendRuntimeMessage({
      type: MESSAGE_TYPES.START_TOOL_MODE,
      payload: { mode: 'font' },
    });
  }, []);

  useEffect(() => {
    function onMessage(message: unknown): void {
      if (!isRuntimeMessage(message)) return;
      if (message.type === MESSAGE_TYPES.TOOL_STREAM && message.payload.tool === 'font') {
        setLive(message.payload.data);
      } else if (message.type === MESSAGE_TYPES.TOOL_PICKED && message.payload.tool === 'font') {
        setPicked(message.payload);
        setLive(message.payload.data);
      }
    }
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  const info = picked?.data ?? live;

  return (
    <>
      <p className="hint">
        Hover text to read its typography and the typeface that actually renders; click to pin it.
      </p>
      {info === null ? <p className="hint dim">No text inspected yet.</p> : <Report info={info} />}

      {picked?.locators && (
        <>
          <h3 className="section-title">Locators</h3>
          <FrameworkChips filter={filter} onChange={setFilter} />
          <LocatorSuggestions suggestions={picked.locators.suggestions} filter={filter} />
        </>
      )}
    </>
  );
}
