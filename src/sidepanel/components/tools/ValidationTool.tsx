import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { browser } from '@/shared/browser-api';
import { MESSAGE_TYPES } from '@/shared/constants';
import { isRuntimeMessage, sendRuntimeMessage } from '@/shared/messages';
import { buildBoundaryChecklist } from '@/shared/tools/validation-contract';
import type { BoundaryCase, FieldContract, ToolPickData } from '@/shared/types';
import { CopyButton } from '@/sidepanel/components/CopyButton';
import { FrameworkChips, LocatorSuggestions } from '@/sidepanel/components/LocatorSuggestions';
import type { FrameworkFilter } from '@/sidepanel/components/LocatorSuggestions';

/** The validation arm of the pick union — the only one this tool handles. */
type ValidationPick = Extract<ToolPickData, { tool: 'validation' }>;

const EXPECT_CLASS: Record<BoundaryCase['expect'], string> = {
  reject: 'badge fail',
  accept: 'badge pass',
  review: 'badge conflict',
};

function checklistText(contract: FieldContract, cases: BoundaryCase[]): string {
  const lines = [`Validation checklist — ${contract.label}`, ''];
  for (const c of cases) {
    const ex = c.example ? `  →  ${JSON.stringify(c.example)}` : '';
    lines.push(`[${c.expect}] ${c.label}${ex}`);
  }
  return lines.join('\n');
}

function ContractView({ contract }: { contract: FieldContract }): ReactElement {
  return (
    <div className="data-list">
      <div className="data-row">
        <span className="data-key">field</span>
        <span className="data-value">{contract.label}</span>
      </div>
      {contract.validity && (
        <div className="data-row">
          <span className="data-key">validity now</span>
          <span className="data-value">
            {contract.validity.valid
              ? 'valid ✓'
              : `invalid — ${contract.validity.failing.join(', ') || 'unknown'}`}
          </span>
        </div>
      )}
      {contract.constraints.map((c) => (
        <div className="data-row" key={c.name}>
          <span className="data-key">{c.name}</span>
          <span className="data-value">
            {c.value}
            {c.detail !== undefined && <span className="dim"> — {c.detail}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ValidationTool(): ReactElement {
  const [picked, setPicked] = useState<ValidationPick | null>(null);
  const [filter, setFilter] = useState<FrameworkFilter>('all');

  useEffect(() => {
    void sendRuntimeMessage({
      type: MESSAGE_TYPES.START_TOOL_MODE,
      payload: { mode: 'validation' },
    });
  }, []);

  useEffect(() => {
    function onMessage(message: unknown): void {
      if (!isRuntimeMessage(message)) return;
      if (message.type === MESSAGE_TYPES.TOOL_PICKED && message.payload.tool === 'validation') {
        setPicked(message.payload);
      }
    }
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, []);

  const contract = picked?.data ?? null;
  const cases = useMemo(() => (contract ? buildBoundaryChecklist(contract) : []), [contract]);

  return (
    <>
      <p className="hint">
        Click a form field (input, select, textarea) to read every validation rule it enforces — and
        a suggested boundary-test checklist. Client-side, declared constraints only; the server can
        still enforce more.
      </p>
      {contract === null ? (
        <p className="hint dim">No field picked yet.</p>
      ) : (
        <>
          {!contract.isFormField && (
            <p className="hint">
              This isn’t a form field, so it declares no constraints — pick an input, select or
              textarea.
            </p>
          )}
          <ContractView contract={contract} />

          {cases.length > 0 && (
            <>
              <div className="row">
                <h3 className="section-title" style={{ margin: 0 }}>
                  Boundary checklist
                </h3>
                <CopyButton text={checklistText(contract, cases)} label="Copy checklist" />
              </div>
              <ul className="stack-list">
                {cases.map((c, i) => (
                  <li key={i} className="stack-layer">
                    <div className="stack-head">
                      <span className={EXPECT_CLASS[c.expect]}>{c.expect}</span>
                      <span>{c.label}</span>
                      {c.example ? <CopyButton text={c.example} label="Copy value" /> : null}
                    </div>
                    {c.example ? <code className="stack-meta">{c.example}</code> : null}
                  </li>
                ))}
              </ul>
            </>
          )}

          {picked?.locators && (
            <>
              <h3 className="section-title">Locators</h3>
              <FrameworkChips filter={filter} onChange={setFilter} />
              <LocatorSuggestions suggestions={picked.locators.suggestions} filter={filter} />
            </>
          )}
        </>
      )}
    </>
  );
}
