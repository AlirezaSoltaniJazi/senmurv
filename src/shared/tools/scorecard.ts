import { newId } from '@/utils/id';

/**
 * Pure scorecard logic for the Scorecard tool — an editable rubric (category
 * name + max score each) filled in per evaluation, with the total computed
 * live. Chrome-free and DOM-free, so it unit-tests cleanly; saving/loading
 * named snapshots lives in shared/storage.ts, the same shape as Query param
 * sets (shared/tools/query-params.ts).
 */

/** One rubric row: a category name and its max score. */
export interface ScorecardCategory {
  readonly id: string;
  readonly name: string;
  readonly max: number;
}

/**
 * A saved scorecard: its own category snapshot — so customizing the rubric
 * for a later evaluation never reshapes an earlier one — plus a score per
 * category.
 */
export interface Scorecard {
  readonly id: string;
  readonly name: string;
  /** The template this was scored against, if any (a candidate under a rubric). */
  readonly templateId?: string;
  /**
   * The template's name AT THE TIME this was saved — kept even if the
   * template is later renamed or deleted, so grouping candidates by template
   * never breaks.
   */
  readonly templateName?: string;
  readonly categories: ScorecardCategory[];
  /** category id → score (0..that category's max). */
  readonly scores: Record<string, number>;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/**
 * A reusable named rubric (categories only, no scores) — e.g. "QA Interview".
 * There is no built-in template: the user builds each one from scratch, saves
 * it here, and loads it to start a new scorecard without re-typing categories.
 */
export interface ScorecardTemplate {
  readonly id: string;
  readonly name: string;
  readonly categories: ScorecardCategory[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** A single blank-ish category, ready to be renamed. */
export function newCategory(name = '', max = 10): ScorecardCategory {
  return { id: newId('cat_'), name, max };
}

/** Append a new category row; immutable. */
export function addCategory(categories: readonly ScorecardCategory[]): ScorecardCategory[] {
  return [...categories, newCategory()];
}

/** Drop the category at `index`; immutable, and a no-op for an out-of-range index. */
export function removeCategory(
  categories: readonly ScorecardCategory[],
  index: number
): ScorecardCategory[] {
  if (index < 0 || index >= categories.length) return [...categories];
  return categories.filter((_, i) => i !== index);
}

/** Replace one category row's name and/or max, edited independently; immutable. */
export function updateCategory(
  categories: readonly ScorecardCategory[],
  index: number,
  patch: Partial<Omit<ScorecardCategory, 'id'>>
): ScorecardCategory[] {
  return categories.map((c, i) => (i === index ? { ...c, ...patch } : c));
}

/** Clamp a score into [0, max], rounding to the nearest whole number. */
export function clampScore(score: number, max: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(max, Math.max(0, Math.round(score)));
}

/** Sane bounds for one category's own max score. */
export const CATEGORY_MAX_MIN = 1;
export const CATEGORY_MAX_UPPER = 1000;

/** Clamp a category's max score into sane bounds, rounding to a whole number. */
export function clampCategoryMax(value: number): number {
  if (!Number.isFinite(value)) return CATEGORY_MAX_MIN;
  return Math.min(CATEGORY_MAX_UPPER, Math.max(CATEGORY_MAX_MIN, Math.round(value)));
}

/** Sum of every category's max. */
export function totalMax(categories: readonly ScorecardCategory[]): number {
  return categories.reduce((sum, c) => sum + c.max, 0);
}

/** Sum of every category's score, each clamped to its own max first. */
export function totalScore(
  categories: readonly ScorecardCategory[],
  scores: Readonly<Record<string, number>>
): number {
  return categories.reduce((sum, c) => sum + clampScore(scores[c.id] ?? 0, c.max), 0);
}

/**
 * The candidate/report header, the template it was scored against (when
 * any), one "Category: score/max" line per category, and a trailing
 * "Total: score/max" — a copy-ready interview report for pasting into an
 * email, chat, or doc.
 */
export function formatScorecardText(
  categories: readonly ScorecardCategory[],
  scores: Readonly<Record<string, number>>,
  name = '',
  templateName = ''
): string {
  const header = [
    name.trim() === '' ? null : name.trim(),
    templateName.trim() === '' ? null : `Template: ${templateName.trim()}`,
  ].filter((line): line is string => line !== null);
  const lines = categories.map(
    (c) => `${c.name}: ${clampScore(scores[c.id] ?? 0, c.max)}/${c.max}`
  );
  lines.push(`Total: ${totalScore(categories, scores)}/${totalMax(categories)}`);
  return (header.length === 0 ? '' : `${header.join('\n')}\n`) + lines.join('\n');
}

/**
 * A new named scorecard, snapshotting `categories` and `scores` as given.
 * `templateId`/`templateName` link it to the template it was scored against,
 * when it was started from one.
 */
export function newScorecard(
  name: string,
  categories: readonly ScorecardCategory[],
  scores: Readonly<Record<string, number>>,
  now: number,
  templateId?: string,
  templateName?: string
): Scorecard {
  return {
    id: newId('scc_'),
    name,
    ...(templateId !== undefined ? { templateId } : {}),
    ...(templateName !== undefined ? { templateName } : {}),
    categories: [...categories],
    scores: { ...scores },
    createdAt: now,
    updatedAt: now,
  };
}

/** A new named template, snapshotting `categories` as given. */
export function newScorecardTemplate(
  name: string,
  categories: readonly ScorecardCategory[],
  now: number
): ScorecardTemplate {
  return {
    id: newId('tpl_'),
    name,
    categories: [...categories],
    createdAt: now,
    updatedAt: now,
  };
}

/** One group of scorecards sharing a template (or none). */
export interface ScorecardGroup {
  /** null groups the candidates who were never scored against a template. */
  readonly templateName: string | null;
  readonly scorecards: Scorecard[];
}

/**
 * Group scorecards by the template they were scored against (its NAME, so a
 * later-renamed template still groups its earlier candidates with its newer
 * ones — grouping by id would split them). Preserves each scorecard's
 * original relative order within its group, and orders groups by each
 * group's first appearance in `scorecards`.
 */
export function groupScorecardsByTemplate(scorecards: readonly Scorecard[]): ScorecardGroup[] {
  const order: (string | null)[] = [];
  const byName = new Map<string | null, Scorecard[]>();
  for (const sc of scorecards) {
    const key = sc.templateName ?? null;
    let list = byName.get(key);
    if (!list) {
      list = [];
      byName.set(key, list);
      order.push(key);
    }
    list.push(sc);
  }
  return order.map((templateName) => ({ templateName, scorecards: byName.get(templateName)! }));
}

/** A built-in starter rubric the user can generate on demand — never auto-loaded. */
export interface StarterTemplate {
  readonly key: string;
  readonly label: string;
  readonly categories: readonly { readonly name: string; readonly max: number }[];
}

/**
 * Ready-made rubrics offered behind an explicit "Generate template" action.
 * Nothing here is ever loaded automatically — the working area starts empty,
 * and picking one still produces an ordinary, fully editable saved template.
 */
export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
  {
    key: 'qa',
    label: 'QA Testing',
    categories: [
      { name: 'Manual & Exploratory Testing', max: 10 },
      { name: 'API & Contract Testing', max: 10 },
      { name: 'Test Data Management Strategy', max: 5 },
      { name: 'Debugging & Monitoring (Web)', max: 7 },
      { name: 'Debugging & Monitoring (Mobile)', max: 7 },
      { name: 'Debugging & Monitoring (Server/Logs)', max: 6 },
      { name: 'CI/CD, Containers & Parallelization', max: 10 },
      { name: 'Communication & Collaboration', max: 10 },
      { name: 'Online Coding & Refactoring', max: 10 },
      { name: 'Vibe Coding & AI Tooling', max: 10 },
      { name: 'Automated Testing & Framework Architecture', max: 15 },
    ],
  },
];

/** Build a fresh category list (each with a new id) from a starter template. */
export function categoriesFromStarter(starter: StarterTemplate): ScorecardCategory[] {
  return starter.categories.map((c) => ({ ...c, id: newId('cat_') }));
}
