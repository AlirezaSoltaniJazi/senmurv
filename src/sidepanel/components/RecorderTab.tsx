import { useEffect, useRef, useState } from 'react';
import type { Dispatch, ReactElement, SetStateAction } from 'react';
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
} from '@/shared/generators';
import { isRuntimeMessage, sendRuntimeMessage } from '@/shared/messages';
import { uniqueName } from '@/shared/script-io';
import {
  buildWorkflowScript,
  describeStep,
  fieldToStep,
  newStep,
  STEP_KIND_LABELS,
  STEP_KINDS,
} from '@/shared/workflow';
import type { RecorderSeed, SelectMode, StepKind, WorkflowStep } from '@/shared/workflow';
import type {
  FieldType,
  GeneratorId,
  Locale,
  PickedField,
  Result,
  SavedScript,
} from '@/shared/types';
import { newId } from '@/utils/id';

interface Props {
  seed: RecorderSeed | null;
  onSeedConsumed: () => void;
  /** Steps are held in App so they survive switching tabs (this tab unmounts). */
  steps: WorkflowStep[];
  setSteps: Dispatch<SetStateAction<WorkflowStep[]>>;
}

type PickTarget = { mode: 'step'; id: string } | { mode: 'adhoc' } | null;

const TARGET_KINDS: StepKind[] = ['fill', 'select', 'check', 'radio', 'clickEl', 'waitEl'];

/** Current epoch ms — wrapped so clock reads stay outside render-purity analysis. */
function nowMs(): number {
  return Date.now();
}

export function RecorderTab({ seed, onSeedConsumed, steps, setSteps }: Props): ReactElement {
  const [picking, setPicking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adhocOpen, setAdhocOpen] = useState(false);
  const [adhocFields, setAdhocFields] = useState<PickedField[]>([]);
  const [pickMode, setPickMode] = useState<'step' | 'adhoc' | null>(null);
  // Name for "Save to Scripts" — pre-filled when opened via Scripts → Customize.
  const [flowName, setFlowName] = useState('');
  // Id of a just-added/duplicated step — scrolled into view and briefly flashed.
  const [flashId, setFlashId] = useState<string | null>(null);

  const stepListRef = useRef<HTMLOListElement>(null);

  const pickTargetRef = useRef<PickTarget>(null);
  const recordingRef = useRef(false);

  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  useEffect(() => {
    function onMessage(message: unknown): void {
      if (!isRuntimeMessage(message)) return;
      if (message.type === MESSAGE_TYPES.FIELD_PICKED) {
        const d = message.payload.field;
        const target = pickTargetRef.current;
        if (target?.mode === 'step') {
          const stepId = target.id;
          pickTargetRef.current = null;
          setSteps((prev) =>
            prev.map((s) => (s.id === stepId ? { ...s, label: d.label, selector: d.selector } : s))
          );
          setPicking(false);
          setPickMode(null);
          void sendRuntimeMessage({ type: MESSAGE_TYPES.CANCEL_PICK });
        } else if (target?.mode === 'adhoc') {
          setAdhocFields((prev) => [
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
        setPickMode(null);
      } else if (message.type === MESSAGE_TYPES.ACTION_RECORDED) {
        const step = message.payload.step;
        setSteps((prev) => {
          const last = prev[prev.length - 1];
          // Coalesce consecutive edits of the same field into one Fill step.
          if (
            step.kind === 'fill' &&
            last &&
            last.kind === 'fill' &&
            last.selector &&
            last.selector === step.selector
          ) {
            return prev.map((s, i) =>
              i === prev.length - 1 ? { ...last, ...step, id: last.id } : s
            );
          }
          return [...prev, { id: newId('stp_'), ...step }];
        });
      }
    }
    chrome.runtime.onMessage.addListener(onMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(onMessage);
      if (recordingRef.current) void sendRuntimeMessage({ type: MESSAGE_TYPES.STOP_RECORD });
    };
  }, [setSteps]);

  // One-shot seed from Scripts → Customize (syncs into local state, then clears).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!seed) return;
    setSteps(seed.steps);
    setFlowName(seed.name ?? '');
    setStatus(`Loaded ${seed.steps.length} step(s) — customize, then Run or Save.`);
    onSeedConsumed();
  }, [seed, onSeedConsumed, setSteps]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Scroll a newly added/duplicated step into view and flash it, then clear.
  useEffect(() => {
    if (!flashId) return undefined;
    stepListRef.current
      ?.querySelector(`[data-step-id="${flashId}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const t = setTimeout(() => setFlashId(null), 1200);
    return () => clearTimeout(t);
  }, [flashId]);

  // ── Record ────────────────────────────────────────────────────────────────
  async function toggleRecord(): Promise<void> {
    setError(null);
    if (recording) {
      await sendRuntimeMessage({ type: MESSAGE_TYPES.STOP_RECORD });
      setRecording(false);
      setStatus(`Recorded ${steps.length} step(s). Edit, then Run or Save.`);
      return;
    }
    const res = await sendRuntimeMessage<Result<void>>({ type: MESSAGE_TYPES.START_RECORD });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setRecording(true);
    setStatus('Recording — interact with the page. Click Stop when done.');
  }

  // ── Picking ───────────────────────────────────────────────────────────────
  async function startPick(target: PickTarget): Promise<void> {
    setError(null);
    pickTargetRef.current = target;
    const res = await sendRuntimeMessage<Result<void>>({ type: MESSAGE_TYPES.START_PICK_FIELDS });
    if (!res.ok) {
      setError(res.error);
      pickTargetRef.current = null;
      return;
    }
    setPicking(true);
    setPickMode(target ? target.mode : null);
  }

  async function donePicking(): Promise<void> {
    await sendRuntimeMessage<Result<void>>({ type: MESSAGE_TYPES.CANCEL_PICK });
    pickTargetRef.current = null;
    setPicking(false);
    setPickMode(null);
  }

  // ── Steps ─────────────────────────────────────────────────────────────────
  function addStep(kind: StepKind): void {
    const step = newStep(kind);
    setSteps((prev) => [...prev, step]);
    setFlashId(step.id);
  }
  // Insert an exact copy of a step (new id) right after it, then flash it.
  function duplicateStep(id: string): void {
    const copyId = newId('stp_');
    setSteps((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      if (i < 0) return prev;
      const next = [...prev];
      next.splice(i + 1, 0, { ...prev[i]!, id: copyId });
      return next;
    });
    setFlashId(copyId);
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
  // Toggle a step on/off: a disabled step stays in the flow (and in a saved
  // script) but is skipped at run time. The key is deleted when re-enabling.
  function toggleStep(id: string): void {
    setSteps((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const next: WorkflowStep = { ...s };
        if (next.disabled) delete next.disabled;
        else next.disabled = true;
        return next;
      })
    );
  }

  // Fill generators are emitted as in-page `{random:…}` tokens (see workflow.ts),
  // so a saved/copied flow re-randomizes on every run — no faker needed in the page.
  function buildScriptFor(list: WorkflowStep[]): string {
    return buildWorkflowScript(list);
  }
  function buildFlow(): string {
    return buildScriptFor(steps);
  }
  async function runSteps(list: WorkflowStep[], done: string): Promise<void> {
    setError(null);
    setStatus(null);
    if (!list.length) {
      setError('Add or record some steps first.');
      return;
    }
    const res = await sendRuntimeMessage<Result<void>>({
      type: MESSAGE_TYPES.RUN_SCRIPT,
      payload: { code: buildScriptFor(list) },
    });
    if (res.ok) setStatus(done);
    else setError(res.error);
  }
  async function runFlow(): Promise<void> {
    await runSteps(steps, `Ran ${steps.length} step(s). Check the page (console has details).`);
  }
  async function runFrom(index: number): Promise<void> {
    const list = steps.slice(index);
    await runSteps(list, `Ran ${list.length} step(s) from step ${index + 1}.`);
  }
  async function copyFlow(): Promise<void> {
    if (!steps.length) return;
    try {
      await navigator.clipboard.writeText(buildFlow());
      setStatus('Flow script copied to clipboard.');
    } catch {
      setError('Could not access the clipboard.');
    }
  }
  async function saveFlow(): Promise<void> {
    setError(null);
    setStatus(null);
    if (!steps.length) return;
    const name = flowName.trim();
    if (!name) {
      setError('Give the flow a name before saving.');
      return;
    }
    // Pull the live list so a duplicate name can be detected (case-insensitive).
    const listRes = await sendRuntimeMessage<Result<SavedScript[]>>({
      type: MESSAGE_TYPES.GET_SCRIPTS,
    });
    const existing = listRes.ok ? listRes.value : [];
    const clash = existing.find((s) => s.name.trim().toLowerCase() === name.toLowerCase());
    const code = buildFlow();
    const now = nowMs();

    if (clash) {
      const overwrite = window.confirm(
        `A script named “${clash.name}” already exists.\n\n` +
          `OK = Overwrite it\nCancel = Save as a copy`
      );
      if (overwrite) {
        await persistScript({ ...clash, name, code, updatedAt: now });
        return;
      }
      const copy = uniqueName(name, new Set(existing.map((s) => s.name)));
      setFlowName(copy);
      await persistScript({ id: newId('scr_'), name: copy, code, createdAt: now, updatedAt: now });
      return;
    }
    await persistScript({ id: newId('scr_'), name, code, createdAt: now, updatedAt: now });
  }

  // Upsert (by id) into Scripts and report the result.
  async function persistScript(script: SavedScript): Promise<void> {
    const res = await sendRuntimeMessage<Result<SavedScript[]>>({
      type: MESSAGE_TYPES.SAVE_SCRIPT,
      payload: { script },
    });
    if (res.ok) setStatus(`Saved “${script.name}” to Scripts.`);
    else setError(res.error);
  }

  // ── Ad-hoc Insert (fast multi-field fill) ──────────────────────────────────
  function patchAdhoc(id: string, patch: Partial<PickedField>): void {
    setAdhocFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }
  function changeAdhocType(id: string, fieldType: FieldType): void {
    setAdhocFields((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, fieldType, generator: defaultGenerator(fieldType, f.hint) } : f
      )
    );
  }
  function removeAdhoc(id: string): void {
    setAdhocFields((prev) => prev.filter((f) => f.id !== id));
  }
  async function adhocFillNow(): Promise<void> {
    setError(null);
    if (!adhocFields.length) {
      setError('Pick some fields first.');
      return;
    }
    await ensureFaker(locale);
    const code = buildScript(adhocFields.map((f) => buildInstruction(f, locale)));
    const res = await sendRuntimeMessage<Result<void>>({
      type: MESSAGE_TYPES.RUN_SCRIPT,
      payload: { code },
    });
    if (res.ok) setStatus(`Filled ${adhocFields.length} field(s).`);
    else setError(res.error);
  }
  function adhocAddAsSteps(): void {
    if (!adhocFields.length) return;
    setSteps((prev) => [...prev, ...adhocFields.map(fieldToStep)]);
    setStatus(`Added ${adhocFields.length} field(s) as steps.`);
    setAdhocFields([]);
  }

  const busy = picking || recording;

  return (
    <div className="tab">
      <div className="row">
        <button
          type="button"
          className={recording ? 'danger' : 'primary'}
          disabled={picking}
          onClick={() => void toggleRecord()}
        >
          {recording ? '■ Stop recording' : '● Record'}
        </button>
        <button
          type="button"
          onClick={() => setAdhocOpen((v) => !v)}
          disabled={recording}
          aria-expanded={adhocOpen}
        >
          Ad-hoc Insert {adhocOpen ? '▾' : '▸'}
        </button>
        <label className="field-label" htmlFor="recorder-locale">
          Locale
        </label>
        <select
          id="recorder-locale"
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
          title="Locale used by random-value generators"
        >
          {SUPPORTED_LOCALES.map((l) => (
            <option key={l} value={l}>
              {LOCALE_LABELS[l] ?? l}
            </option>
          ))}
        </select>
      </div>

      {recording && (
        <p className="hint">
          Recording your clicks, inputs and selects. Top frame only (not inside iframes); a full
          page navigation ends recording.
        </p>
      )}

      {adhocOpen && (
        <div className="adhoc-panel">
          <div className="row">
            {picking && pickMode === 'adhoc' ? (
              <button type="button" className="primary" onClick={() => void donePicking()}>
                Done picking (Esc)
              </button>
            ) : (
              <button
                type="button"
                className="primary"
                disabled={recording}
                onClick={() => void startPick({ mode: 'adhoc' })}
              >
                Pick fields
              </button>
            )}
            <span className="hint">Click each field on the page; Done to finish.</span>
          </div>
          <ul className="field-list">
            {adhocFields.map((f) => (
              <li key={f.id} className="field-card">
                <div className="field-head">
                  <span className="field-label-text" title={f.selector}>
                    {f.label}
                  </span>
                  <button type="button" className="danger remove" onClick={() => removeAdhoc(f.id)}>
                    ✕
                  </button>
                </div>
                <div className="field-controls">
                  <select
                    value={f.fieldType}
                    onChange={(e) => changeAdhocType(f.id, e.target.value as FieldType)}
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
                    onChange={(e) => patchAdhoc(f.id, { generator: e.target.value as GeneratorId })}
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
                    onChange={(e) => patchAdhoc(f.id, { customValue: e.target.value })}
                  />
                )}
              </li>
            ))}
          </ul>
          {adhocFields.length > 0 && (
            <div className="row">
              <button type="button" className="primary" onClick={() => void adhocFillNow()}>
                Fill now
              </button>
              <button type="button" onClick={adhocAddAsSteps}>
                Add as steps
              </button>
              <button type="button" onClick={() => setAdhocFields([])}>
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      <div className="row">
        {STEP_KINDS.map((k) => (
          <button key={k} type="button" onClick={() => addStep(k)}>
            + {STEP_KIND_LABELS[k]}
          </button>
        ))}
      </div>

      {picking && pickMode === 'step' && (
        <p className="hint">Click the target element on the page (Esc to cancel).</p>
      )}
      {steps.length === 0 && !recording && (
        <p className="hint">Record a flow, add steps, or use Ad-hoc Insert — then Run or Save.</p>
      )}

      <ol className="step-list" ref={stepListRef}>
        {steps.map((s, i) => (
          <li
            key={s.id}
            data-step-id={s.id}
            className={
              'step-card' + (s.disabled ? ' disabled' : '') + (s.id === flashId ? ' flash' : '')
            }
          >
            <div className="step-head">
              <span className="step-kind">{STEP_KIND_LABELS[s.kind]}</span>
              <span className="step-desc" title={s.selector ?? ''}>
                {describeStep(s)}
              </span>
              <span className="step-actions">
                <button
                  type="button"
                  className={s.disabled ? 'toggle-step' : 'toggle-step on'}
                  title={
                    s.disabled ? 'Enable step (currently skipped)' : 'Disable step (skip on run)'
                  }
                  aria-label={s.disabled ? 'Enable step' : 'Disable step'}
                  aria-pressed={!s.disabled}
                  onClick={() => toggleStep(s.id)}
                >
                  ⏻
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={busy || s.disabled}
                  title="Run the flow from this step to the end"
                  aria-label="Run from this step"
                  onClick={() => void runFrom(i)}
                >
                  ▶
                </button>
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
                <button
                  type="button"
                  title="Duplicate step"
                  aria-label="Duplicate step"
                  onClick={() => duplicateStep(s.id)}
                >
                  ⧉
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
            {s.kind === 'press' && (
              <div className="step-target">
                <input
                  className="name-input"
                  placeholder="Key, e.g. Enter / Escape / Tab"
                  value={s.key ?? ''}
                  onChange={(e) => updateStep(s.id, { key: e.target.value })}
                />
                <input
                  className="name-input"
                  placeholder="Target selector (optional; else focused element)"
                  value={s.selector ?? ''}
                  onChange={(e) => updateStep(s.id, { selector: e.target.value })}
                />
              </div>
            )}
            {s.kind === 'runjs' && (
              <textarea
                className="code-input"
                spellCheck={false}
                placeholder="// JS to run in the page, e.g. window.scrollTo(0, 0);"
                value={s.code ?? ''}
                onChange={(e) => updateStep(s.id, { code: e.target.value })}
              />
            )}

            {TARGET_KINDS.includes(s.kind) && (
              <>
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
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void startPick({ mode: 'step', id: s.id })}
                  >
                    Pick
                  </button>
                </div>
                <input
                  className="name-input"
                  placeholder="CSS selector (optional, overrides label), e.g. #email"
                  value={s.selector ?? ''}
                  onChange={(e) => updateStep(s.id, { selector: e.target.value })}
                />
              </>
            )}
            {s.kind === 'waitEl' && (
              <input
                className="name-input"
                type="number"
                placeholder="Timeout ms (default 15000)"
                value={s.ms ?? ''}
                onChange={(e) => updateStep(s.id, { ms: Number(e.target.value) || 0 })}
              />
            )}
            {s.kind === 'fill' && (
              <div className="step-target">
                <select
                  value={s.generator ?? 'custom'}
                  onChange={(e) => updateStep(s.id, { generator: e.target.value as GeneratorId })}
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
                    placeholder="Value or token, e.g. John Smith · {today+1} · {random:email}"
                    title="Tokens resolve at run time: {today}, {today+1}, {random:email}, {random:number:1-99}"
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
                  onChange={(e) => updateStep(s.id, { optionMode: e.target.value as SelectMode })}
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
        <>
          <input
            className="name-input"
            placeholder="Flow name (required to save)"
            aria-label="Flow name"
            value={flowName}
            onChange={(e) => setFlowName(e.target.value)}
          />
          <div className="row">
            <button type="button" className="primary" onClick={() => void runFlow()}>
              Run flow
            </button>
            <button type="button" onClick={() => void copyFlow()}>
              Copy as script
            </button>
            <button
              type="button"
              disabled={!flowName.trim()}
              title={flowName.trim() ? 'Save this flow to Scripts' : 'Enter a flow name first'}
              onClick={() => void saveFlow()}
            >
              Save to Scripts
            </button>
            <button
              type="button"
              onClick={() => {
                setSteps([]);
                setFlowName('');
              }}
            >
              Clear
            </button>
          </div>
        </>
      )}

      {status && <p className="status">{status}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
