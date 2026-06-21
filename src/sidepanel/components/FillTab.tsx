import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import {
  DEFAULT_LOCALE,
  LOCALE_LABELS,
  MESSAGE_TYPES,
  SUPPORTED_LOCALES,
} from '@/shared/constants';
import {
  buildInstruction,
  buildScript,
  defaultGenerator,
  FIELD_TYPE_LABELS,
  FIELD_TYPES,
  GENERATOR_LABELS,
  generatorsFor,
  instructionPreview,
} from '@/shared/generators';
import { isRuntimeMessage, sendRuntimeMessage } from '@/shared/messages';
import type {
  FieldType,
  FillInstruction,
  GeneratorId,
  Locale,
  PickedField,
  Result,
  SavedScript,
} from '@/shared/types';
import { newId } from '@/utils/id';

export function FillTab(): ReactElement {
  const [fields, setFields] = useState<PickedField[]>([]);
  const [picking, setPicking] = useState(false);
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [lastInstructions, setLastInstructions] = useState<FillInstruction[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onMessage(message: unknown): void {
      if (!isRuntimeMessage(message)) return;
      if (message.type === MESSAGE_TYPES.FIELD_PICKED) {
        const d = message.payload.field;
        setFields((prev) => [
          ...prev,
          {
            id: newId('fld_'),
            selector: d.selector,
            fieldType: d.fieldType,
            label: d.label,
            hint: d.hint,
            generator: defaultGenerator(d.fieldType, d.hint),
          },
        ]);
      } else if (message.type === MESSAGE_TYPES.PICK_CANCELLED) {
        setPicking(false);
      }
    }
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  async function pickFields(): Promise<void> {
    setError(null);
    const res = await sendRuntimeMessage<Result<void>>({ type: MESSAGE_TYPES.START_PICK_FIELDS });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPicking(true);
  }

  async function donePicking(): Promise<void> {
    await sendRuntimeMessage<Result<void>>({ type: MESSAGE_TYPES.CANCEL_PICK });
    setPicking(false);
  }

  function patchField(id: string, patch: Partial<PickedField>): void {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  function changeType(id: string, fieldType: FieldType): void {
    setFields((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, fieldType, generator: defaultGenerator(fieldType, f.hint) } : f
      )
    );
  }

  function removeField(id: string): void {
    setFields((prev) => prev.filter((f) => f.id !== id));
  }

  function instructionsNow(): FillInstruction[] {
    const list = fields.map((f) => buildInstruction(f, locale));
    setFields((prev) => prev.map((f, i) => ({ ...f, preview: instructionPreview(list[i]!) })));
    setLastInstructions(list);
    return list;
  }

  async function generateAndFill(): Promise<void> {
    setError(null);
    setStatus(null);
    if (!fields.length) {
      setError('Pick some fields first.');
      return;
    }
    const res = await sendRuntimeMessage<Result<void>>({
      type: MESSAGE_TYPES.RUN_SCRIPT,
      payload: { code: buildScript(instructionsNow()) },
    });
    if (res.ok)
      setStatus(`Filled ${fields.length} field(s). Check the page (console has details).`);
    else setError(res.error);
  }

  async function copyScript(): Promise<void> {
    if (!fields.length) return;
    const code = buildScript(lastInstructions ?? instructionsNow());
    try {
      await navigator.clipboard.writeText(code);
      setStatus('Script copied to clipboard.');
    } catch {
      setError('Could not access the clipboard.');
    }
  }

  async function saveToScripts(): Promise<void> {
    if (!fields.length) return;
    const now = Date.now();
    const script: SavedScript = {
      id: newId('scr_'),
      name: `Generated fill (${fields.length} fields)`,
      code: buildScript(lastInstructions ?? instructionsNow()),
      createdAt: now,
      updatedAt: now,
    };
    const res = await sendRuntimeMessage<Result<SavedScript[]>>({
      type: MESSAGE_TYPES.SAVE_SCRIPT,
      payload: { script },
    });
    if (res.ok) setStatus(`Saved to Scripts as “${script.name}”.`);
    else setError(res.error);
  }

  return (
    <div className="tab">
      <div className="row">
        {picking ? (
          <button type="button" className="primary" onClick={() => void donePicking()}>
            Done picking (Esc)
          </button>
        ) : (
          <button type="button" className="primary" onClick={() => void pickFields()}>
            Pick fields
          </button>
        )}
        <label className="field-label" htmlFor="fill-locale">
          Locale
        </label>
        <select
          id="fill-locale"
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
        >
          {SUPPORTED_LOCALES.map((l) => (
            <option key={l} value={l}>
              {LOCALE_LABELS[l] ?? l}
            </option>
          ))}
        </select>
      </div>

      {picking && (
        <p className="hint">Click each field on the page; press Esc or Done to finish.</p>
      )}
      {fields.length === 0 && !picking && (
        <p className="hint">
          Pick form fields, choose a generator for each, then Generate &amp; Fill.
        </p>
      )}

      <ul className="field-list">
        {fields.map((f) => (
          <li key={f.id} className="field-card">
            <div className="field-head">
              <span className="field-label-text" title={f.selector}>
                {f.label}
              </span>
              <button type="button" className="danger remove" onClick={() => removeField(f.id)}>
                ✕
              </button>
            </div>
            <div className="field-controls">
              <select
                value={f.fieldType}
                onChange={(e) => changeType(f.id, e.target.value as FieldType)}
                title="Field type (override if detection was wrong)"
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {FIELD_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              <select
                value={f.generator}
                onChange={(e) => patchField(f.id, { generator: e.target.value as GeneratorId })}
                title="Value generator"
              >
                {generatorsFor(f.fieldType).map((g) => (
                  <option key={g} value={g}>
                    {GENERATOR_LABELS[g]}
                  </option>
                ))}
              </select>
            </div>
            {f.generator === 'custom' && (
              <input
                className="name-input"
                placeholder="Custom value"
                value={f.customValue ?? ''}
                onChange={(e) => patchField(f.id, { customValue: e.target.value })}
              />
            )}
            {f.preview && <code className="field-preview">{f.preview}</code>}
          </li>
        ))}
      </ul>

      {fields.length > 0 && (
        <div className="row">
          <button type="button" className="primary" onClick={() => void generateAndFill()}>
            Generate &amp; Fill
          </button>
          <button type="button" onClick={() => void copyScript()}>
            Copy as script
          </button>
          <button type="button" onClick={() => void saveToScripts()}>
            Save to Scripts
          </button>
          <button type="button" onClick={() => setFields([])}>
            Clear
          </button>
        </div>
      )}

      {status && <p className="status">{status}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
