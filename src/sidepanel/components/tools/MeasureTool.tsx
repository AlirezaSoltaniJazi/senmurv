import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { isRuntimeMessage, sendRuntimeMessage } from '@/shared/messages';
import { buildSizeAssertions } from '@/shared/tools/assertions';
import { round } from '@/shared/tools/measure';
import type {
  BoxModel,
  BoxSides,
  LocatorSet,
  MeasureData,
  MeasureMode,
  ToolPickData,
} from '@/shared/types';

/** The measure arm of the pick union — the only one this tool handles. */
type MeasurePick = Extract<ToolPickData, { tool: 'measure' }>;
import { CopyButton } from '@/sidepanel/components/CopyButton';
import { FrameworkChips, LocatorSuggestions } from '@/sidepanel/components/LocatorSuggestions';
import type { FrameworkFilter } from '@/sidepanel/components/LocatorSuggestions';

const MODES: { key: MeasureMode; label: string }[] = [
  { key: 'element', label: 'Element' },
  { key: 'region', label: 'Region' },
  { key: 'distance', label: 'Distance' },
];

const HINTS: Record<MeasureMode, string> = {
  element:
    'Hover an element for its box model; click to pin it and get copy-ready size assertions.',
  region: 'Drag a rectangle over the page to measure it in pixels.',
  distance: 'Click one element, then another, for the gap and centre-to-centre distance.',
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

const sides = (s: BoxSides): string =>
  `${round(s.top)} · ${round(s.right)} · ${round(s.bottom)} · ${round(s.left)}`;

function BoxModelView({ box, tag }: { box: BoxModel; tag: string }): ReactElement {
  return (
    <div className="data-list">
      <Row label="element" value={`<${tag}>`} />
      <Row label="content" value={`${box.content.width} × ${box.content.height}`} copy />
      <Row label="border box" value={`${box.borderBox.width} × ${box.borderBox.height}`} copy />
      <Row label="margin box" value={`${box.marginBox.width} × ${box.marginBox.height}`} />
      <Row label="padding (t·r·b·l)" value={sides(box.padding)} />
      <Row label="border (t·r·b·l)" value={sides(box.border)} />
      <Row label="margin (t·r·b·l)" value={sides(box.margin)} />
      {box.transform !== null && <Row label="transform" value={box.transform} />}
    </div>
  );
}

function ReadingView({ data }: { data: MeasureData }): ReactElement {
  if (data.mode === 'region') {
    const r = data.region;
    return (
      <div className="data-list">
        <Row label="size" value={`${r.width} × ${r.height}`} copy />
        <Row label="viewport xy" value={`${r.viewport.left}, ${r.viewport.top}`} />
        <Row label="page xy" value={`${r.page.left}, ${r.page.top}`} />
      </div>
    );
  }
  if (data.mode === 'distance') {
    const d = data.distance;
    return (
      <div className="data-list">
        <Row label="horizontal gap" value={`${d.horizontal}`} copy />
        <Row label="vertical gap" value={`${d.vertical}`} copy />
        <Row label="centre-to-centre" value={`${d.centerToCenter}`} />
        <Row label="centre delta" value={`${d.dx}, ${d.dy}`} />
      </div>
    );
  }
  return <BoxModelView box={data.box} tag={data.tag} />;
}

/** Best CSS-usable selector for size assertions. */
function pickSelector(locators: LocatorSet): string {
  const css = locators.suggestions.find((s) => s.strategy === 'css');
  const rec = locators.suggestions.find((s) => s.recommended);
  return css?.value ?? rec?.value ?? '#selector';
}

export function MeasureTool(): ReactElement {
  const [mode, setMode] = useState<MeasureMode>('element');
  const [live, setLive] = useState<MeasureData | null>(null);
  const [picked, setPicked] = useState<MeasurePick | null>(null);
  const [filter, setFilter] = useState<FrameworkFilter>('all');

  // (Re)start the in-page mode on mount and whenever the sub-mode changes.
  // ToolShell sends STOP_TOOL_MODE on unmount, so there is nothing to tear down
  // here. startMeasure() is idempotent, so re-sending START just re-configures.
  // The reading reset lives in selectMode (an event handler), not here, so the
  // effect stays free of synchronous setState.
  useEffect(() => {
    void sendRuntimeMessage({
      type: MESSAGE_TYPES.START_TOOL_MODE,
      payload: { mode: 'measure', measureMode: mode },
    });
  }, [mode]);

  function selectMode(next: MeasureMode): void {
    setLive(null);
    setPicked(null);
    setMode(next);
  }

  useEffect(() => {
    function onMessage(message: unknown): void {
      if (!isRuntimeMessage(message)) return;
      if (message.type === MESSAGE_TYPES.TOOL_STREAM && message.payload.tool === 'measure') {
        setLive(message.payload.data);
      } else if (message.type === MESSAGE_TYPES.TOOL_PICKED && message.payload.tool === 'measure') {
        setPicked(message.payload);
        setLive(message.payload.data);
      }
    }
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  const reading = picked?.data ?? live;
  const pickedElement = picked?.data.mode === 'element' && picked.locators ? picked.locators : null;
  const assertions =
    picked?.data.mode === 'element' && picked.locators
      ? buildSizeAssertions(picked.data.box, pickSelector(picked.locators))
      : [];
  const shownAssertions =
    filter === 'all' ? assertions : assertions.filter((a) => a.framework === filter);

  return (
    <>
      <div className="chips">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            className={mode === m.key ? 'chip active' : 'chip'}
            onClick={() => selectMode(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="hint">{HINTS[mode]}</p>

      {reading === null ? (
        <p className="hint dim">No measurement yet.</p>
      ) : (
        <ReadingView data={reading} />
      )}

      {pickedElement !== null && (
        <>
          <h3 className="section-title">Locators</h3>
          <FrameworkChips filter={filter} onChange={setFilter} />
          <LocatorSuggestions suggestions={pickedElement.suggestions} filter={filter} />

          <h3 className="section-title">Size assertions</h3>
          <ul className="snippet-list">
            {shownAssertions.map((a) => (
              <li key={`${a.framework}-${a.label}`} className="snippet-row">
                <div className="snippet-head">
                  <span className="snippet-fw">{a.label}</span>
                  <CopyButton text={a.code} />
                </div>
                <code className="snippet-code">{a.code}</code>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
