import { describe, expect, it } from 'vitest';
import {
  addCategory,
  categoriesFromStarter,
  clampCategoryMax,
  clampScore,
  formatScorecardText,
  groupScorecardsByTemplate,
  newCategory,
  newScorecard,
  newScorecardTemplate,
  removeCategory,
  STARTER_TEMPLATES,
  totalMax,
  totalScore,
  updateCategory,
} from '@/shared/tools/scorecard';

describe('newCategory / addCategory / removeCategory / updateCategory', () => {
  it('creates a category with a fresh id and the given defaults', () => {
    const c = newCategory('Foo', 7);
    expect(c.name).toBe('Foo');
    expect(c.max).toBe(7);
    expect(c.id.length).toBeGreaterThan(0);
  });

  it('appends a category immutably', () => {
    const cats = [newCategory('A', 5)];
    const next = addCategory(cats);
    expect(next).toHaveLength(2);
    expect(cats).toHaveLength(1); // original untouched
  });

  it('removes a category by index, no-op out of range', () => {
    const cats = [newCategory('A', 5), newCategory('B', 5)];
    expect(removeCategory(cats, 0).map((c) => c.name)).toEqual(['B']);
    expect(removeCategory(cats, 99)).toHaveLength(2);
  });

  it('updates a category name/max independently, immutably', () => {
    const cats = [newCategory('A', 5)];
    const renamed = updateCategory(cats, 0, { name: 'Renamed' });
    expect(renamed[0]?.name).toBe('Renamed');
    expect(renamed[0]?.max).toBe(5);
    expect(cats[0]?.name).toBe('A'); // original untouched

    const rescaled = updateCategory(cats, 0, { max: 20 });
    expect(rescaled[0]?.max).toBe(20);
  });
});

describe('clampScore', () => {
  it('clamps into [0, max]', () => {
    expect(clampScore(5, 10)).toBe(5);
    expect(clampScore(-3, 10)).toBe(0);
    expect(clampScore(999, 10)).toBe(10);
  });

  it('rounds to the nearest whole number', () => {
    expect(clampScore(4.6, 10)).toBe(5);
    expect(clampScore(4.4, 10)).toBe(4);
  });

  it('treats non-finite input as 0', () => {
    expect(clampScore(NaN, 10)).toBe(0);
    expect(clampScore(Infinity, 10)).toBe(0);
    expect(clampScore(-Infinity, 10)).toBe(0);
  });
});

describe('clampCategoryMax', () => {
  it('clamps into the sane bounds and rounds', () => {
    expect(clampCategoryMax(0)).toBe(1); // CATEGORY_MAX_MIN
    expect(clampCategoryMax(-5)).toBe(1);
    expect(clampCategoryMax(5000)).toBe(1000); // CATEGORY_MAX_UPPER
    expect(clampCategoryMax(7.6)).toBe(8);
  });

  it('treats non-finite input as the minimum', () => {
    expect(clampCategoryMax(NaN)).toBe(1);
  });
});

describe('totalMax / totalScore', () => {
  const cats = [newCategory('A', 10), newCategory('B', 5)];

  it('sums every category max', () => {
    expect(totalMax(cats)).toBe(15);
  });

  it('sums clamped scores, defaulting an absent score to 0', () => {
    const [a, b] = cats;
    expect(totalScore(cats, {})).toBe(0);
    expect(totalScore(cats, { [a!.id]: 4 })).toBe(4);
    expect(totalScore(cats, { [a!.id]: 4, [b!.id]: 3 })).toBe(7);
    // A score beyond its own category's max is clamped before summing.
    expect(totalScore(cats, { [a!.id]: 999, [b!.id]: 3 })).toBe(13);
  });

  it('ignores scores keyed to a category that no longer exists', () => {
    expect(totalScore(cats, { cat_nonexistent: 5 })).toBe(0);
  });
});

describe('formatScorecardText', () => {
  const cats = [newCategory('Alpha', 10), newCategory('Beta', 5)];
  const [alpha, beta] = cats;

  it('formats one "Category: score/max" line per category plus a Total line', () => {
    const text = formatScorecardText(cats, { [alpha!.id]: 7, [beta!.id]: 2 });
    expect(text).toBe('Alpha: 7/10\nBeta: 2/5\nTotal: 9/15');
  });

  it('prefixes an optional name as its own leading line', () => {
    const text = formatScorecardText(cats, { [alpha!.id]: 7, [beta!.id]: 2 }, 'Jane Doe');
    expect(text).toBe('Jane Doe\nAlpha: 7/10\nBeta: 2/5\nTotal: 9/15');
  });

  it('omits the name line for a blank/whitespace-only name', () => {
    const text = formatScorecardText(cats, {}, '   ');
    expect(text.startsWith('Alpha:')).toBe(true);
  });

  it('adds a "Template: X" line under the name when a template name is given', () => {
    const text = formatScorecardText(
      cats,
      { [alpha!.id]: 7, [beta!.id]: 2 },
      'Jane Doe',
      'QA Interview'
    );
    expect(text).toBe('Jane Doe\nTemplate: QA Interview\nAlpha: 7/10\nBeta: 2/5\nTotal: 9/15');
  });

  it('includes the template line even without a candidate name', () => {
    const text = formatScorecardText(cats, {}, '', 'QA Interview');
    expect(text.startsWith('Template: QA Interview\nAlpha:')).toBe(true);
  });
});

describe('newScorecard', () => {
  it('snapshots categories and scores independently of the source arrays/objects', () => {
    const cats = [newCategory('A', 10)];
    const scores = { [cats[0]!.id]: 5 };
    const sc = newScorecard('My scorecard', cats, scores, 1000);

    expect(sc.name).toBe('My scorecard');
    expect(sc.categories).toEqual(cats);
    expect(sc.scores).toEqual(scores);
    expect(sc.createdAt).toBe(1000);
    expect(sc.updatedAt).toBe(1000);
    expect(sc.id.length).toBeGreaterThan(0);

    // Mutating the inputs afterwards must not affect the saved snapshot.
    cats.push(newCategory('B', 5));
    scores[cats[0]!.id] = 999;
    expect(sc.categories).toHaveLength(1);
    expect(sc.scores[cats[0]!.id]).toBe(5);
  });

  it('omits templateId/templateName entirely when not given (no template link)', () => {
    const sc = newScorecard('Freeform', [], {}, 1000);
    expect('templateId' in sc).toBe(false);
    expect('templateName' in sc).toBe(false);
  });

  it('links to a template when templateId/templateName are given', () => {
    const sc = newScorecard('Jane Doe', [], {}, 1000, 'tpl_1', 'QA Interview');
    expect(sc.templateId).toBe('tpl_1');
    expect(sc.templateName).toBe('QA Interview');
  });
});

describe('newScorecardTemplate', () => {
  it('snapshots categories independently of the source array (no scores)', () => {
    const cats = [newCategory('A', 10)];
    const tpl = newScorecardTemplate('QA Interview', cats, 1000);

    expect(tpl.name).toBe('QA Interview');
    expect(tpl.categories).toEqual(cats);
    expect(tpl.createdAt).toBe(1000);
    expect(tpl.updatedAt).toBe(1000);
    expect(tpl.id.length).toBeGreaterThan(0);
    expect('scores' in tpl).toBe(false);

    // Mutating the input afterwards must not affect the saved snapshot.
    cats.push(newCategory('B', 5));
    expect(tpl.categories).toHaveLength(1);
  });
});

describe('groupScorecardsByTemplate', () => {
  it('groups candidates by templateName, preserving first-appearance order', () => {
    const scorecards = [
      newScorecard('A1', [], {}, 1, 'tpl_1', 'QA Interview'),
      newScorecard('Freeform', [], {}, 2),
      newScorecard('A2', [], {}, 3, 'tpl_1', 'QA Interview'),
      newScorecard('B1', [], {}, 4, 'tpl_2', 'Frontend Interview'),
    ];
    const groups = groupScorecardsByTemplate(scorecards);

    expect(groups.map((g) => g.templateName)).toEqual(['QA Interview', null, 'Frontend Interview']);
    expect(groups[0]!.scorecards.map((s) => s.name)).toEqual(['A1', 'A2']);
    expect(groups[1]!.scorecards.map((s) => s.name)).toEqual(['Freeform']);
    expect(groups[2]!.scorecards.map((s) => s.name)).toEqual(['B1']);
  });

  it('returns [] for an empty list', () => {
    expect(groupScorecardsByTemplate([])).toEqual([]);
  });
});

describe('STARTER_TEMPLATES / categoriesFromStarter', () => {
  it('ships at least the QA Testing starter', () => {
    const qa = STARTER_TEMPLATES.find((s) => s.key === 'qa');
    expect(qa).toBeDefined();
    expect(qa!.label).toBe('QA Testing');
    expect(qa!.categories.length).toBeGreaterThan(0);
  });

  it('builds a fresh category list with unique ids from a starter', () => {
    const qa = STARTER_TEMPLATES.find((s) => s.key === 'qa')!;
    const cats = categoriesFromStarter(qa);

    expect(cats).toHaveLength(qa.categories.length);
    expect(cats.map((c) => c.name)).toEqual(qa.categories.map((c) => c.name));
    expect(cats.map((c) => c.max)).toEqual(qa.categories.map((c) => c.max));
    const ids = cats.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);

    // Calling it again produces distinct ids (a fresh set of categories).
    const cats2 = categoriesFromStarter(qa);
    expect(cats2[0]!.id).not.toBe(cats[0]!.id);
  });
});
