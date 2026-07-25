import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { isRuntimeMessage, sendRuntimeMessage } from '@/shared/messages';
import { buildStateAssertions } from '@/shared/tools/state-assertions';
import type { ElementState, LocatorSet, ToolPickData } from '@/shared/types';
import { CopyButton } from '@/sidepanel/components/CopyButton';
import { FrameworkChips, LocatorSuggestions } from '@/sidepanel/components/LocatorSuggestions';
import type { FrameworkFilter } from '@/sidepanel/components/LocatorSuggestions';

/** The assert arm of the pick union — the only one this tool handles. */
type AssertPick = Extract<ToolPickData, { tool: 'assert' }>;

/** Best CSS-usable selector for assertions (mirrors MeasureTool). */
function pickSelector(locators: LocatorSet): string {
  const css = locators.suggestions.find((s) => s.strategy === 'css');
  const rec = locators.suggestions.find((s) => s.recommended);
  return css?.value ?? rec?.value ?? '#selector';
}

function Row({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="data-row">
      <span className="data-key">{label}</span>
      <span className="data-value">{value}</span>
    </div>
  );
}

function StateView({ state }: { state: ElementState }): ReactElement {
  return (
    <div className="data-list">
      <Row label="element" value={`<${state.tag}>`} />
      <Row label="visible" value={state.visible ? 'yes' : 'no'} />
      {state.text !== null && <Row label="text" value={state.text} />}
      {state.value !== null && <Row label="value" value={state.value} />}
      {state.checked !== null && <Row label="checked" value={state.checked ? 'yes' : 'no'} />}
      <Row label="enabled" value={state.disabled ? 'no (disabled)' : 'yes'} />
      {state.readOnly && <Row label="readonly" value="yes" />}
      {state.attributes.map((a) => (
        <Row key={a.name} label={`@${a.name}`} value={a.value} />
      ))}
    </div>
  );
}

export function AssertTool(): ReactElement {
  const [picked, setPicked] = useState<AssertPick | null>(null);
  const [filter, setFilter] = useState<FrameworkFilter>('playwright');

  useEffect(() => {
    void sendRuntimeMessage({
      type: MESSAGE_TYPES.START_TOOL_MODE,
      payload: { mode: 'assert' },
    });
  }, []);

  useEffect(() => {
    function onMessage(message: unknown): void {
      if (!isRuntimeMessage(message)) return;
      if (message.type === MESSAGE_TYPES.TOOL_PICKED && message.payload.tool === 'assert') {
        setPicked(message.payload);
      }
    }
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  const assertions =
    picked?.locators !== undefined
      ? buildStateAssertions(picked.data, pickSelector(picked.locators))
      : [];
  const shown = filter === 'all' ? assertions : assertions.filter((a) => a.framework === filter);

  return (
    <>
      <p className="hint">
        Hover an element and click it to snapshot its state — text, value, checked, enabled, visible
        — and get copy-ready assertions for your framework, targeted by its recommended locator. A
        natively <code>disabled</code> control can’t be clicked to pick (the browser suppresses its
        events) — pick its label, or use Bypass first.
      </p>

      {picked === null ? (
        <p className="hint dim">No element picked yet.</p>
      ) : (
        <>
          <StateView state={picked.data} />

          <h3 className="section-title">Assertions</h3>
          <FrameworkChips filter={filter} onChange={setFilter} />
          <ul className="snippet-list">
            {shown.map((a) => (
              <li key={`${a.framework}-${a.label}`} className="snippet-row">
                <div className="snippet-head">
                  <span className="snippet-fw">{a.label}</span>
                  <CopyButton text={a.code} />
                </div>
                <code className="snippet-code">{a.code}</code>
              </li>
            ))}
          </ul>

          {picked.locators !== undefined && (
            <>
              <h3 className="section-title">Locators</h3>
              <LocatorSuggestions suggestions={picked.locators.suggestions} filter={filter} />
            </>
          )}
        </>
      )}
    </>
  );
}
