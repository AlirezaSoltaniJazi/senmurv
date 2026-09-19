import { Fragment, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { sendRuntimeMessage } from '@/shared/messages';
import {
  addCategory,
  CATEGORY_MAX_UPPER,
  CATEGORY_MAX_MIN,
  categoriesFromStarter,
  clampCategoryMax,
  clampScore,
  formatScorecardText,
  groupScorecardsByTemplate,
  newScorecard,
  newScorecardTemplate,
  removeCategory,
  STARTER_TEMPLATES,
  totalMax,
  totalScore,
  updateCategory,
} from '@/shared/tools/scorecard';
import type { Scorecard, ScorecardCategory, ScorecardTemplate } from '@/shared/tools/scorecard';
import type { Result } from '@/shared/types';
import { CopyButton } from '@/sidepanel/components/CopyButton';

/** Current epoch ms — wrapped so clock reads stay outside render-purity analysis. */
function nowMs(): number {
  return Date.now();
}

export function ScorecardTool(): ReactElement {
  const [categories, setCategories] = useState<ScorecardCategory[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [name, setName] = useState('');
  // The saved scorecard currently loaded into the working area, or null when
  // the working area is a fresh/unsaved one.
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [saved, setSaved] = useState<Scorecard[]>([]);
  const [templates, setTemplates] = useState<ScorecardTemplate[]>([]);
  // The template the working categories came from (so a saved scorecard links
  // back to it, "Update template" has something to update, and it carries
  // over through "New" to the next candidate under the same rubric).
  const [loadedTemplateId, setLoadedTemplateId] = useState<string | null>(null);
  const [loadedTemplateName, setLoadedTemplateName] = useState<string | null>(null);
  // null = the "+ Save as template" button; a string = the naming input is open.
  const [savingTemplateName, setSavingTemplateName] = useState<string | null>(null);
  const [starterKey, setStarterKey] = useState(STARTER_TEMPLATES[0]?.key ?? '');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await sendRuntimeMessage<Result<Scorecard[]>>({
        type: MESSAGE_TYPES.GET_SCORECARDS,
      });
      if (res.ok) setSaved(res.value);
    })();
    void (async () => {
      const res = await sendRuntimeMessage<Result<ScorecardTemplate[]>>({
        type: MESSAGE_TYPES.GET_SCORECARD_TEMPLATES,
      });
      if (res.ok) setTemplates(res.value);
    })();
  }, []);

  const total = totalScore(categories, scores);
  const max = totalMax(categories);
  const reportText = formatScorecardText(categories, scores, name, loadedTemplateName ?? '');
  const groups = groupScorecardsByTemplate(saved);

  function setScore(categoryId: string, raw: string, categoryMax: number): void {
    const n = clampScore(Number(raw), categoryMax);
    setScores((prev) => ({ ...prev, [categoryId]: n }));
  }

  function changeCategoryMax(index: number, categoryId: string, raw: string): void {
    const n = clampCategoryMax(Number(raw));
    setCategories((prev) => updateCategory(prev, index, { max: n }));
    // Re-clamp this category's existing score to the new max.
    setScores((prev) => ({ ...prev, [categoryId]: clampScore(prev[categoryId] ?? 0, n) }));
  }

  // Keep the current categories (and template link) but clear the
  // per-evaluation state, so the next candidate reuses the same rubric.
  function startNew(): void {
    setScores({});
    setName('');
    setWorkingId(null);
    setStatus(null);
    setError(null);
  }

  function clearCategories(): void {
    setCategories([]);
    setScores({});
    setName('');
    setWorkingId(null);
    setLoadedTemplateId(null);
    setLoadedTemplateName(null);
    setSavingTemplateName(null);
    setStatus(null);
    setError(null);
  }

  /** Load a saved template's categories only — a fresh start for a new evaluation. */
  function loadTemplate(t: ScorecardTemplate): void {
    setCategories(t.categories);
    setScores({});
    setName('');
    setWorkingId(null);
    setLoadedTemplateId(t.id);
    setLoadedTemplateName(t.name);
    setError(null);
    setStatus(`Loaded template "${t.name}".`);
  }

  /** Generate + save a built-in starter rubric, then load it as the working template. */
  async function generateStarterTemplate(): Promise<void> {
    const starter = STARTER_TEMPLATES.find((s) => s.key === starterKey);
    if (!starter) return;
    setError(null);
    const cats = categoriesFromStarter(starter);
    const template = newScorecardTemplate(starter.label, cats, nowMs());
    const res = await sendRuntimeMessage<Result<ScorecardTemplate[]>>({
      type: MESSAGE_TYPES.SAVE_SCORECARD_TEMPLATE,
      payload: { template },
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setTemplates(res.value);
    setCategories(cats);
    setScores({});
    setName('');
    setWorkingId(null);
    setLoadedTemplateId(template.id);
    setLoadedTemplateName(template.name);
    setStatus(`Generated template "${starter.label}" — rename or adjust it freely below.`);
  }

  /**
   * Save the working categories as a template. `categoriesToSave` is passed
   * explicitly (not read off `categories` state) so a caller that just set
   * new categories via `setCategories` doesn't race React's state batching.
   */
  async function saveTemplate(
    templateName: string,
    categoriesToSave: ScorecardCategory[],
    asNew: boolean
  ): Promise<void> {
    const trimmed = templateName.trim();
    if (trimmed === '') {
      setError('Name this template first.');
      return;
    }
    if (categoriesToSave.length === 0) {
      setError('Add at least one category before saving a template.');
      return;
    }
    setError(null);
    const existing =
      !asNew && loadedTemplateId !== null
        ? templates.find((t) => t.id === loadedTemplateId)
        : undefined;
    const template: ScorecardTemplate = existing
      ? { ...existing, name: trimmed, categories: categoriesToSave, updatedAt: nowMs() }
      : newScorecardTemplate(trimmed, categoriesToSave, nowMs());
    const res = await sendRuntimeMessage<Result<ScorecardTemplate[]>>({
      type: MESSAGE_TYPES.SAVE_SCORECARD_TEMPLATE,
      payload: { template },
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setTemplates(res.value);
    setLoadedTemplateId(template.id);
    setLoadedTemplateName(template.name);
    setSavingTemplateName(null);
    setStatus(existing ? `Updated template "${trimmed}".` : `Saved template "${trimmed}".`);
  }

  async function removeTemplate(t: ScorecardTemplate): Promise<void> {
    if (
      !window.confirm(
        `Delete the template "${t.name}"? Candidates already scored against it keep their own copy of its categories.`
      )
    ) {
      return;
    }
    const res = await sendRuntimeMessage<Result<ScorecardTemplate[]>>({
      type: MESSAGE_TYPES.DELETE_SCORECARD_TEMPLATE,
      payload: { id: t.id },
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setTemplates(res.value);
    if (loadedTemplateId === t.id) setLoadedTemplateId(null);
  }

  function loadScorecard(sc: Scorecard): void {
    setCategories(sc.categories);
    setScores(sc.scores);
    setName(sc.name);
    setWorkingId(sc.id);
    setLoadedTemplateId(sc.templateId ?? null);
    setLoadedTemplateName(sc.templateName ?? null);
    setError(null);
    setStatus(`Loaded "${sc.name}".`);
  }

  async function save(asNew: boolean): Promise<void> {
    const trimmed = name.trim();
    if (trimmed === '') {
      setError('Name this scorecard first.');
      return;
    }
    setError(null);
    const existing =
      !asNew && workingId !== null ? saved.find((s) => s.id === workingId) : undefined;
    const scorecard: Scorecard = existing
      ? { ...existing, name: trimmed, categories, scores, updatedAt: nowMs() }
      : newScorecard(
          trimmed,
          categories,
          scores,
          nowMs(),
          loadedTemplateId ?? undefined,
          loadedTemplateName ?? undefined
        );
    const res = await sendRuntimeMessage<Result<Scorecard[]>>({
      type: MESSAGE_TYPES.SAVE_SCORECARD,
      payload: { scorecard },
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSaved(res.value);
    setWorkingId(scorecard.id);
    setStatus(`Saved "${trimmed}".`);
  }

  async function removeScorecard(sc: Scorecard): Promise<void> {
    if (!window.confirm(`Delete the saved scorecard "${sc.name}"?`)) return;
    const res = await sendRuntimeMessage<Result<Scorecard[]>>({
      type: MESSAGE_TYPES.DELETE_SCORECARD,
      payload: { id: sc.id },
    });
    if (res.ok) {
      setSaved(res.value);
      if (workingId === sc.id) setWorkingId(null);
    } else {
      setError(res.error);
    }
  }

  return (
    <>
      <p className="hint">
        Start with "+ Add category", or generate a starter rubric below. Fill in a score per row,
        then Save. "New" keeps the current categories and template link for the next candidate.
      </p>

      <div className="row">
        <select
          aria-label="Starter template"
          value={starterKey}
          onChange={(e) => setStarterKey(e.target.value)}
        >
          {STARTER_TEMPLATES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void generateStarterTemplate()}
          title="Create and save a ready-made template you can then rename or adjust freely"
        >
          Generate template
        </button>
      </div>

      {templates.length > 0 && (
        <>
          <h3 className="section-title">Templates</h3>
          <div className="chips">
            {templates.map((t) => (
              <Fragment key={t.id}>
                <button
                  type="button"
                  className={loadedTemplateId === t.id ? 'chip active' : 'chip'}
                  title={`Load "${t.name}" (${t.categories.length} categor${t.categories.length === 1 ? 'y' : 'ies'})`}
                  onClick={() => loadTemplate(t)}
                >
                  {t.name}
                </button>
                <button
                  type="button"
                  className="chip danger"
                  title={`Delete template "${t.name}"`}
                  aria-label={`Delete template ${t.name}`}
                  onClick={() => void removeTemplate(t)}
                >
                  ✕
                </button>
              </Fragment>
            ))}
          </div>
        </>
      )}

      <input
        className="name-input"
        placeholder="Candidate / scorecard name, e.g. Jane Doe — 2026-09-03"
        aria-label="Scorecard name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      {categories.length === 0 && (
        <p className="hint dim">No categories yet — click "+ Add category" to start.</p>
      )}

      <ul className="kv-list">
        {categories.map((c, i) => (
          <li key={c.id} className="kv-row">
            <div className="kv-head">
              <input
                className="name-input sc-name"
                placeholder="Category name"
                aria-label={`Category ${i + 1} name`}
                value={c.name}
                onChange={(e) =>
                  setCategories((prev) => updateCategory(prev, i, { name: e.target.value }))
                }
              />
              <input
                className="name-input sc-score"
                type="number"
                min={0}
                max={c.max}
                aria-label={`${c.name || `Category ${i + 1}`} score`}
                value={scores[c.id] ?? 0}
                onChange={(e) => setScore(c.id, e.target.value, c.max)}
              />
              <span className="sc-slash">/</span>
              <input
                className="name-input sc-max"
                type="number"
                min={CATEGORY_MAX_MIN}
                max={CATEGORY_MAX_UPPER}
                aria-label={`${c.name || `Category ${i + 1}`} max score`}
                value={c.max}
                onChange={(e) => changeCategoryMax(i, c.id, e.target.value)}
              />
              <span className="kv-actions">
                <button
                  type="button"
                  className="danger"
                  title="Remove this category"
                  aria-label={`Remove category ${i + 1}`}
                  onClick={() => setCategories((prev) => removeCategory(prev, i))}
                >
                  ✕
                </button>
              </span>
            </div>
          </li>
        ))}
      </ul>

      <div className="row">
        <button type="button" onClick={() => setCategories((prev) => addCategory(prev))}>
          + Add category
        </button>
        <button
          type="button"
          onClick={clearCategories}
          disabled={categories.length === 0}
          title="Empty the category list and drop the template link to start over"
        >
          Clear categories
        </button>
      </div>

      <div className="row">
        {loadedTemplateId !== null && (
          <button
            type="button"
            disabled={categories.length === 0}
            onClick={() => void saveTemplate(loadedTemplateName ?? '', categories, false)}
            title={`Overwrite the "${loadedTemplateName}" template with the current categories`}
          >
            Update template
          </button>
        )}
        {savingTemplateName === null ? (
          <button
            type="button"
            onClick={() => setSavingTemplateName('')}
            disabled={categories.length === 0}
            title="Save the current categories (no scores) as a reusable template"
          >
            {loadedTemplateId === null ? '+ Save as template' : 'Save as new template'}
          </button>
        ) : (
          <>
            <input
              className="name-input"
              placeholder="Template name, e.g. QA Interview"
              aria-label="Template name"
              autoFocus
              value={savingTemplateName}
              onChange={(e) => setSavingTemplateName(e.target.value)}
            />
            <button
              type="button"
              className="primary"
              onClick={() => void saveTemplate(savingTemplateName, categories, true)}
            >
              Save
            </button>
            <button type="button" onClick={() => setSavingTemplateName(null)}>
              Cancel
            </button>
          </>
        )}
      </div>

      <div className="row">
        <strong>
          Total: {total} / {max}
        </strong>
        <button type="button" className="primary" onClick={() => void save(false)}>
          {workingId === null ? 'Save' : 'Update'}
        </button>
        {workingId !== null && (
          <button type="button" onClick={() => void save(true)}>
            Save as new
          </button>
        )}
        <button type="button" onClick={startNew}>
          New
        </button>
      </div>

      {status !== null && <p className="status">{status}</p>}
      {error !== null && <p className="error">{error}</p>}

      {categories.length > 0 && (
        <div className="snippet-row">
          <div className="snippet-head">
            <span className="snippet-fw">report</span>
            <CopyButton text={reportText} />
          </div>
          <code className="snippet-code">{reportText}</code>
        </div>
      )}

      {groups.length > 0 && (
        <>
          <h3 className="section-title">Saved scorecards</h3>
          {groups.map((group) => (
            <div key={group.templateName ?? '__none__'}>
              <p className="hint dim">
                {group.templateName === null
                  ? 'Not tied to a template'
                  : `Under "${group.templateName}"`}
              </p>
              <div className="chips">
                {group.scorecards.map((sc) => (
                  <Fragment key={sc.id}>
                    <button
                      type="button"
                      className={workingId === sc.id ? 'chip active' : 'chip'}
                      title={`Load "${sc.name}"`}
                      onClick={() => loadScorecard(sc)}
                    >
                      {sc.name} — {totalScore(sc.categories, sc.scores)}/{totalMax(sc.categories)}
                    </button>
                    <button
                      type="button"
                      className="chip danger"
                      title={`Delete "${sc.name}"`}
                      aria-label={`Delete saved scorecard ${sc.name}`}
                      onClick={() => void removeScorecard(sc)}
                    >
                      ✕
                    </button>
                  </Fragment>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}
