import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import {
  DEFAULT_LOCALE,
  LOCALE_LABELS,
  MESSAGE_TYPES,
  SUPPORTED_LOCALES,
} from '@/shared/constants';
import { ensureFaker } from '@/shared/faker-data';
import {
  buildInstruction,
  buildScript,
  defaultGenerator,
  FIELD_TYPE_LABELS,
  FIELD_TYPES,
  GENERATOR_LABELS,
  generatorsFor,
  generateValue,
  instructionPreview,
} from '@/shared/generators';
import { isRuntimeMessage, sendRuntimeMessage } from '@/shared/messages';
import {
  buildWorkflowScript,
  describeStep,
  newStep,
  STEP_KIND_LABELS,
  STEP_KINDS,
} from '@/shared/workflow';
import type { FillSeed, SelectMode, StepKind, WorkflowStep } from '@/shared/workflow';
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

type Mode = 'fields' | 'flow';

interface Props {
  seed: FillSeed | null;
  onSeedConsumed: () => void;
}

export function FillTab({ seed, onSeedConsumed }: Props): ReactElement {
  const [mode, setMode] = useState<Mode>('fields');
  const [fields, setFields] = useState<PickedField[]>([]);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [picking, setPicking] = useState(false);
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [lastInstructions, setLastInstructions] = useState<FillInstruction[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const modeRef = useRef<Mode>(mode);
  const pickStepRef = useRef<string | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    function onMessage(message: unknown): void {
      if (!isRuntimeMessage(message)) return;
      if (message.type === MESSAGE_TYPES.FIELD_PICKED) {
        const d = message.payload.field;
        if (modeRef.current === 'flow' && pickStepRef.current) {
          const stepId = pickStepRef.current;
          pickStepRef.current = null;
          setSteps((prev) =>
            prev.map((s) => (s.id === stepId ? { ...s, label: d.label, selector: d.selector } : s))
          );
          setPicking(false);
          void sendRuntimeMessage({ type: MESSAGE_TYPES.CANCEL_PICK });
        } else if (modeRef.current === 'fields') {
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
        }
      } else if (message.type === MESSAGE_TYPES.PICK_CANCELLED) {
        setPicking(false);
      }
    }
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  // One-shot seed from Scripts → Customize (syncs into local state, then clears).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!seed) return;
    if (seed.mode === 'fields') {
      setMode('fields');
      setFields(seed.fields);
      setStatus(`Loaded ${seed.fields.length} field(s) — customize, then Generate & Fill or Save.`);
    } else {
      setMode('flow');
      setSteps(seed.steps);
      setStatus(`Loaded ${seed.steps.length} step(s) — customize, then Run or Save.`);
    }
    onSeedConsumed();
  }, [seed, onSeedConsumed]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Shared picking ────────────────────────────────────────────────────────
  async function startFieldPick(): Promise<void> {
    setError(null);
    pickStepRef.current = null;
    const res = await sendRuntimeMessage<Result<void>>({ type: MESSAGE_TYPES.START_PICK_FIELDS });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPicking(true);
  }

  async function pickForStep(id: string): Promise<void> {
    setError(null);
    pickStepRef.current = id;
    const res = await sendRuntimeMessage<Result<void>>({ type: MESSAGE_TYPES.START_PICK_FIELDS });
    if (!res.ok) {
      setError(res.error);
      pickStepRef.current = null;
      return;
    }
    setPicking(true);
  }

  async function donePicking(): Promise<void> {
    await sendRuntimeMessage<Result<void>>({ type: MESSAGE_TYPES.CANCEL_PICK });
    pickStepRef.current = null;
    setPicking(false);
  }

  // ── Fields mode ───────────────────────────────────────────────────────────
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
  function fieldInstructions(): FillInstruction[] {
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
    await ensureFaker(locale);
    const res = await sendRuntimeMessage<Result<void>>({
      type: MESSAGE_TYPES.RUN_SCRIPT,
      payload: { code: buildScript(fieldInstructions()) },
    });
    if (res.ok)
      setStatus(`Filled ${fields.length} field(s). Check the page (console has details).`);
    else setError(res.error);
  }
  async function copyFields(): Promise<void> {
    if (!fields.length) return;
    await ensureFaker(locale);
    try {
      await navigator.clipboard.writeText(buildScript(lastInstructions ?? fieldInstructions()));
      setStatus('Script copied to clipboard.');
    } catch {
      setError('Could not access the clipboard.');
    }
  }
  async function saveFields(): Promise<void> {
    if (!fields.length) return;
    await ensureFaker(locale);
    await saveScript(
      `Generated fill (${fields.length} fields)`,
      buildScript(lastInstructions ?? fieldInstructions())
    );
  }

  // ── Flow mode ─────────────────────────────────────────────────────────────
  function addStep(kind: StepKind): void {
    setSteps((prev) => [...prev, newStep(kind)]);
  }
  function updateStep(id: string, patch: Partial<WorkflowStep>): void {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function setStepIndex(id: string, value: string): void {
    setSteps((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const next: WorkflowStep = { ...s };
        if (value === '') delete next.index;
        else next.index = Math.max(0, Number(value) || 0);
        return next;
      })
    );
  }
  function moveStep(id: string, dir: -1 | 1): void {
    setSteps((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }
  function removeStep(id: string): void {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  }
  // Bake any random-value fill generators into concrete values (faker can't run
  // in the page). Fresh each call: "Run flow" re-randomizes; Save/Copy snapshot.
  async function buildFlow(): Promise<string> {
    await ensureFaker(locale);
    const resolved = steps.map((s) =>
      s.kind === 'fill' && s.generator && s.generator !== 'custom'
        ? { ...s, value: generateValue(s.generator, locale, s.value) ?? '' }
        : s
    );
    return buildWorkflowScript(resolved);
  }
  async function runFlow(): Promise<void> {
    setError(null);
    setStatus(null);
    if (!steps.length) {
      setError('Add some steps first.');
      return;
    }
    const res = await sendRuntimeMessage<Result<void>>({
      type: MESSAGE_TYPES.RUN_SCRIPT,
      payload: { code: await buildFlow() },
    });
    if (res.ok) setStatus(`Ran ${steps.length} step(s). Check the page (console has details).`);
    else setError(res.error);
  }
  async function copyFlow(): Promise<void> {
    if (!steps.length) return;
    try {
      await navigator.clipboard.writeText(await buildFlow());
      setStatus('Flow script copied to clipboard.');
    } catch {
      setError('Could not access the clipboard.');
    }
  }
  async function saveFlow(): Promise<void> {
    if (!steps.length) return;
    await saveScript(`Generated flow (${steps.length} steps)`, await buildFlow());
  }

  async function saveScript(name: string, code: string): Promise<void> {
    const now = Date.now();
    const script: SavedScript = { id: newId('scr_'), name, code, createdAt: now, updatedAt: now };
    const res = await sendRuntimeMessage<Result<SavedScript[]>>({
      type: MESSAGE_TYPES.SAVE_SCRIPT,
      payload: { script },
    });
    if (res.ok) setStatus(`Saved to Scripts as “${name}”.`);
    else setError(res.error);
  }

  return (
    <div className="tab">
      <div className="mode-toggle">
        <button
          type="button"
          className={mode === 'fields' ? 'tab-btn active' : 'tab-btn'}
          onClick={() => setMode('fields')}
        >
          Fields
        </button>
        <button
          type="button"
          className={mode === 'flow' ? 'tab-btn active' : 'tab-btn'}
          onClick={() => setMode('flow')}
        >
          Flow
        </button>
      </div>

      {mode === 'fields' ? (
        <>
          <div className="row">
            {picking ? (
              <button type="button" className="primary" onClick={() => void donePicking()}>
                Done picking (Esc)
              </button>
            ) : (
              <button type="button" className="primary" onClick={() => void startFieldPick()}>
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

          {picking && <p className="hint">Click each field on the page; Esc/Done to finish.</p>}
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
                    title="Field type"
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
              <button type="button" onClick={() => void copyFields()}>
                Copy as script
              </button>
              <button type="button" onClick={() => void saveFields()}>
                Save to Scripts
              </button>
              <button type="button" onClick={() => setFields([])}>
                Clear
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="row">
            {STEP_KINDS.map((k) => (
              <button key={k} type="button" onClick={() => addStep(k)}>
                + {STEP_KIND_LABELS[k]}
              </button>
            ))}
          </div>
          <div className="row">
            <label className="field-label" htmlFor="flow-locale">
              Random data locale
            </label>
            <select
              id="flow-locale"
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
              title="Locale used by random-value generators in fill steps"
            >
              {SUPPORTED_LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_LABELS[l] ?? l}
                </option>
              ))}
            </select>
          </div>
          {picking && <p className="hint">Click the target element on the page (Esc to cancel).</p>}
          {steps.length === 0 && !picking && (
            <p className="hint">Add steps (click / wait / fill / select / checkbox), then Run.</p>
          )}

          <ol className="step-list">
            {steps.map((s, i) => (
              <li key={s.id} className="step-card">
                <div className="step-head">
                  <span className="step-kind">{STEP_KIND_LABELS[s.kind]}</span>
                  <span className="step-desc" title={s.selector ?? ''}>
                    {describeStep(s)}
                  </span>
                  <span className="step-actions">
                    <button type="button" disabled={i === 0} onClick={() => moveStep(s.id, -1)}>
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={i === steps.length - 1}
                      onClick={() => moveStep(s.id, 1)}
                    >
                      ▼
                    </button>
                    <button type="button" className="danger" onClick={() => removeStep(s.id)}>
                      ✕
                    </button>
                  </span>
                </div>

                {s.kind === 'click' && (
                  <input
                    className="name-input"
                    placeholder="Button text, e.g. Submit"
                    value={s.text ?? ''}
                    onChange={(e) => updateStep(s.id, { text: e.target.value })}
                  />
                )}
                {s.kind === 'wait' && (
                  <input
                    className="name-input"
                    type="number"
                    placeholder="Milliseconds, e.g. 1000"
                    value={s.ms ?? 0}
                    onChange={(e) => updateStep(s.id, { ms: Number(e.target.value) || 0 })}
                  />
                )}
                {(s.kind === 'fill' ||
                  s.kind === 'select' ||
                  s.kind === 'check' ||
                  s.kind === 'radio') && (
                  <div className="step-target">
                    <input
                      className="name-input"
                      placeholder="Field label shown on the page, e.g. Email"
                      value={s.label ?? ''}
                      onChange={(e) => updateStep(s.id, { label: e.target.value })}
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="nth"
                      title="If the selector matches several elements, which one (0 = first)"
                      style={{ width: '4rem', flex: '0 0 auto' }}
                      value={s.index ?? ''}
                      onChange={(e) => setStepIndex(s.id, e.target.value)}
                    />
                    <button type="button" onClick={() => void pickForStep(s.id)}>
                      Pick
                    </button>
                  </div>
                )}
                {(s.kind === 'fill' ||
                  s.kind === 'select' ||
                  s.kind === 'check' ||
                  s.kind === 'radio') && (
                  <input
                    className="name-input"
                    placeholder="CSS selector (optional, overrides label), e.g. #email"
                    value={s.selector ?? ''}
                    onChange={(e) => updateStep(s.id, { selector: e.target.value })}
                  />
                )}
                {s.kind === 'fill' && (
                  <div className="step-target">
                    <select
                      value={s.generator ?? 'custom'}
                      onChange={(e) =>
                        updateStep(s.id, { generator: e.target.value as GeneratorId })
                      }
                      title="Value source"
                    >
                      {generatorsFor('text').map((g) => (
                        <option key={g} value={g}>
                          {g === 'custom' ? 'Static value' : GENERATOR_LABELS[g]}
                        </option>
                      ))}
                    </select>
                    {(s.generator ?? 'custom') === 'custom' ? (
                      <input
                        className="name-input"
                        placeholder="Value to type, e.g. John Smith"
                        value={s.value ?? ''}
                        onChange={(e) => updateStep(s.id, { value: e.target.value })}
                      />
                    ) : (
                      <span className="hint" style={{ flex: 1, alignSelf: 'center' }}>
                        random {GENERATOR_LABELS[s.generator ?? 'custom'].toLowerCase()} on each run
                      </span>
                    )}
                  </div>
                )}
                {s.kind === 'select' && (
                  <div className="step-target">
                    <select
                      value={s.optionMode ?? 'text'}
                      onChange={(e) =>
                        updateStep(s.id, { optionMode: e.target.value as SelectMode })
                      }
                    >
                      <option value="text">Option text</option>
                      <option value="first">First option</option>
                      <option value="random">Random option</option>
                    </select>
                    {(s.optionMode ?? 'text') === 'text' && (
                      <input
                        className="name-input"
                        placeholder="Option text to match, e.g. United Kingdom"
                        value={s.value ?? ''}
                        onChange={(e) => updateStep(s.id, { value: e.target.value })}
                      />
                    )}
                  </div>
                )}
                {s.kind === 'radio' && (
                  <input
                    className="name-input"
                    placeholder="Option value or text, e.g. Yes"
                    value={s.value ?? ''}
                    onChange={(e) => updateStep(s.id, { value: e.target.value })}
                  />
                )}
                {s.kind === 'check' && (
                  <label className="checkbox-inline">
                    <input
                      type="checkbox"
                      checked={s.checked ?? true}
                      onChange={(e) => updateStep(s.id, { checked: e.target.checked })}
                    />
                    Checked
                  </label>
                )}
              </li>
            ))}
          </ol>

          {steps.length > 0 && (
            <div className="row">
              <button type="button" className="primary" onClick={() => void runFlow()}>
                Run flow
              </button>
              <button type="button" onClick={() => void copyFlow()}>
                Copy as script
              </button>
              <button type="button" onClick={() => void saveFlow()}>
                Save to Scripts
              </button>
              <button type="button" onClick={() => setSteps([])}>
                Clear
              </button>
            </div>
          )}
        </>
      )}

      {status && <p className="status">{status}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
