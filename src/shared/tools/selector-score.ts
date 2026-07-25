import { isStableId } from '@/shared/locators';
import type { LocatorKind, LocatorQuality } from '@/shared/types';

/**
 * Pure robustness scoring for the Selector Hardener. Given a CSS selector or an
 * XPath string, it names the reasons the selector is fragile (positional
 * `nth-child`, build-hashed classes, framework-generated ids, absolute paths,
 * text dependence, deep chains) and produces a 0–100 stability score.
 *
 * Chrome-free and DOM-free — it reasons about the selector STRING. Resolving the
 * selector to the element it should have targeted, and building the hardened
 * replacement, is the content script's job (it reuses `buildLocatorSet`).
 */

/** One named reason a selector is fragile, shown as a chip with a tooltip. */
export interface BrittlenessFlag {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
}

export interface SelectorScore {
  /** 0 (throwaway) … 100 (rock-solid). */
  readonly score: number;
  readonly quality: LocatorQuality;
  readonly flags: BrittlenessFlag[];
}

const PENALTY: Readonly<Record<string, number>> = {
  positional: 25,
  'hashed-class': 22,
  'utility-class': 12,
  'generated-id': 18,
  'deep-chain': 15,
  structural: 12,
  'absolute-xpath': 26,
  'xpath-index': 22,
  'text-dependence': 18,
};

const FLAG_TEXT: Readonly<Record<string, { label: string; detail: string }>> = {
  positional: {
    label: 'Positional (nth-child)',
    detail:
      'Depends on the element’s position among its siblings — reordering or inserting a node breaks it.',
  },
  'hashed-class': {
    label: 'Hashed / CSS-in-JS class',
    detail:
      'Classes like `css-1a2b3c` or `sc-hAxRer` are build-generated and change on every deploy.',
  },
  'utility-class': {
    label: 'Utility class',
    detail:
      'Utility classes (Tailwind-style) are shared by many elements and describe style, not identity.',
  },
  'generated-id': {
    label: 'Framework-generated id',
    detail:
      'This id looks auto-generated (Angular/Ember/React useId), so it changes on the next render.',
  },
  'deep-chain': {
    label: 'Deep descendant chain',
    detail: 'A long ancestor chain breaks when any wrapper in the middle changes.',
  },
  structural: {
    label: 'Structure-only',
    detail:
      'No id, test id, or semantic attribute — the selector leans entirely on document structure.',
  },
  'absolute-xpath': {
    label: 'Absolute XPath',
    detail: 'An absolute path from the document root breaks the moment any ancestor changes.',
  },
  'xpath-index': {
    label: 'Positional index',
    detail: 'A positional `[n]` index depends on sibling order.',
  },
  'text-dependence': {
    label: 'Text-dependent',
    detail: 'Matching on visible text breaks with copy edits or localisation.',
  },
};

function flag(id: string): BrittlenessFlag {
  const text = FLAG_TEXT[id] ?? { label: id, detail: '' };
  return { id, label: text.label, detail: text.detail };
}

/** Extract (CSS-unescaped) id tokens from a CSS selector. */
function cssIds(sel: string): string[] {
  const out: string[] = [];
  for (const m of sel.matchAll(/#((?:\\.|[\w-])+)/g)) {
    out.push((m[1] ?? '').replace(/\\(.)/g, '$1'));
  }
  return out;
}

/** Extract (CSS-unescaped) class tokens from a CSS selector. */
function cssClasses(sel: string): string[] {
  const out: string[] = [];
  for (const m of sel.matchAll(/\.((?:\\.|[\w-])+)/g)) {
    out.push((m[1] ?? '').replace(/\\(.)/g, '$1'));
  }
  return out;
}

/** Build-hashed or CSS-in-JS class (emotion, styled-components, CSS modules). */
function isHashedClass(token: string): boolean {
  if (/^(css|sc|jsx|emotion)-[A-Za-z0-9]{4,}$/i.test(token)) return true; // emotion / styled
  if (/__[A-Za-z0-9]{5,}$/.test(token)) return true; // CSS modules Button__root_aB3xY
  if (/_[A-Za-z0-9]{6,}$/.test(token) && /\d/.test(token)) return true;
  return /-[a-z0-9]{6,}$/.test(token) && /\d/.test(token) && /[a-f]/i.test(token);
}

const UTILITY_RE =
  /^(p|m|px|py|pt|pb|pl|pr|mx|my|mt|mb|ml|mr|w|h|min-w|max-w|text|bg|border|rounded|flex|grid|gap|space-[xy]|items|justify|self|order|col|row|font|leading|tracking|top|left|right|bottom|inset|z|opacity|shadow|ring|divide|overflow|cursor)-/;
const UTILITY_WORDS = new Set([
  'flex',
  'grid',
  'block',
  'inline',
  'hidden',
  'absolute',
  'relative',
  'fixed',
  'sticky',
  'container',
  'truncate',
  'sr-only',
  'antialiased',
  'italic',
  'uppercase',
  'lowercase',
  'capitalize',
]);

function isUtilityClass(token: string): boolean {
  return UTILITY_RE.test(token) || UTILITY_WORDS.has(token);
}

/** A plain, author-authored word class (`login-form`, `submit`) — an identity signal. */
function isSemanticClass(token: string): boolean {
  if (isHashedClass(token) || isUtilityClass(token)) return false;
  return /^[a-z][a-z-]{2,}$/i.test(token);
}

const GENERATED_ID_RE =
  /^(ember\d+$|radix-|headlessui-|react-aria-|rc[-_]|mui-\d|:r[0-9a-z]+:?$|downshift-|floating-ui-|aria-|dsq-|yui_)/i;

function isGeneratedId(id: string): boolean {
  return !isStableId(id) || GENERATED_ID_RE.test(id);
}

/** Split a CSS selector into compound selectors, ignoring bracket/paren content. */
function cssCompounds(sel: string): string[] {
  const masked = sel
    .replace(/\[[^\]]*\]/g, (m) => 'x'.repeat(m.length))
    .replace(/\([^)]*\)/g, (m) => 'x'.repeat(m.length));
  const boundaries: number[] = [0];
  for (const m of masked.matchAll(/\s*[>+~]\s*|\s+/g)) {
    if (m.index === undefined) continue;
    boundaries.push(m.index + m[0].length);
  }
  return boundaries
    .map((start, i) => sel.slice(start, boundaries[i + 1] ?? sel.length).trim())
    .map((c) => c.replace(/[>+~]\s*$/, '').trim())
    .filter((c) => c !== '' && !/^[>+~]$/.test(c));
}

function hasTestId(fragment: string): boolean {
  return /\[\s*data-(testid|test|test-id|cy|qa)\b/i.test(fragment);
}
function hasSemanticAttr(fragment: string): boolean {
  return /\[\s*(role|aria-label|aria-labelledby|name|placeholder|title|alt|type|href|for|value)\b/i.test(
    fragment
  );
}

/** Score a CSS selector by its target compound, with a small ancestor-anchor bonus. */
function scoreCss(sel: string): SelectorScore {
  const compounds = cssCompounds(sel);
  const target = compounds[compounds.length - 1] ?? sel;
  const ancestors = compounds.slice(0, -1).join(' ');
  const flagIds = new Set<string>();

  // Positive anchor on the TARGET compound sets the base.
  let base: number;
  const targetIds = cssIds(target);
  if (hasTestId(target)) base = 95;
  else if (targetIds.some((id) => !isGeneratedId(id))) base = 88;
  else if (hasSemanticAttr(target)) base = 76;
  else if (cssClasses(target).some(isSemanticClass)) base = 66;
  else base = 56;

  // A stable id / test id on an ancestor is a modest help.
  if (base < 88 && (hasTestId(ancestors) || cssIds(ancestors).some((id) => !isGeneratedId(id)))) {
    base += 6;
  }

  // Brittleness anywhere in the selector.
  if (
    /:nth-(child|of-type|last-child|last-of-type)\(|:(first|last|only)-child|:(first|last)-of-type/.test(
      sel
    )
  ) {
    flagIds.add('positional');
  }
  // Tokenize the full selector once — these lists are invariant for `sel`.
  const selClasses = cssClasses(sel);
  const selIds = cssIds(sel);
  if (selClasses.some(isHashedClass)) flagIds.add('hashed-class');
  if (selClasses.some(isUtilityClass)) flagIds.add('utility-class');
  if (selIds.some(isGeneratedId)) flagIds.add('generated-id');
  if (compounds.length >= 4) flagIds.add('deep-chain');
  const hasAnchor =
    hasTestId(sel) || selIds.some((id) => !isGeneratedId(id)) || hasSemanticAttr(sel);
  if (!hasAnchor && !selClasses.some(isSemanticClass)) flagIds.add('structural');

  return finalize(base, flagIds);
}

/** Number of location steps in an XPath (ignoring predicate content). */
function xpathSteps(sel: string): number {
  const masked = sel.replace(/\[[^\]]*\]/g, '');
  return masked.split('/').filter((s) => s.trim() !== '' && s.trim() !== '.').length;
}

function scoreXPath(sel: string): SelectorScore {
  const trimmed = sel.trim();
  const flagIds = new Set<string>();
  const lastStep = trimmed.split('/').filter(Boolean).pop() ?? trimmed;

  let base: number;
  if (/@data-(testid|test|cy|qa)\b/i.test(lastStep)) base = 92;
  else if (/@id\s*=/.test(lastStep)) base = 85;
  else if (/@(aria-label|name|role|placeholder|title|type|href)\s*=/.test(lastStep)) base = 72;
  else if (trimmed.startsWith('//')) base = 58;
  else base = 50;

  if (/^\/(?!\/)/.test(trimmed)) flagIds.add('absolute-xpath');
  if (/\[\s*\d+\s*\]|\[\s*(position\(\)|last\()/.test(sel)) flagIds.add('xpath-index');
  if (xpathSteps(sel) >= 5) flagIds.add('deep-chain');

  return finalize(base, flagIds);
}

function finalize(base: number, flagIds: Set<string>): SelectorScore {
  let score = base;
  for (const id of flagIds) score -= PENALTY[id] ?? 0;
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, quality: scoreQuality(score), flags: [...flagIds].map(flag) };
}

/** Map a 0–100 score to the same quality bands the locator list uses. */
export function scoreQuality(score: number): LocatorQuality {
  if (score >= 70) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

/** Score a selector's robustness and name why it is fragile. */
export function scoreSelector(selector: string, kind: LocatorKind): SelectorScore {
  const sel = selector.trim();
  const withText = kind === 'xpath' ? scoreXPath(sel) : scoreCss(sel);
  // Text dependence applies to either kind.
  if (/:contains\(|\btext\(\)\s*=|contains\(\s*(\.|text\(\))/.test(sel)) {
    const flags = [...withText.flags];
    if (!flags.some((f) => f.id === 'text-dependence')) flags.push(flag('text-dependence'));
    const score = Math.max(0, withText.score - PENALTY['text-dependence']!);
    return { score, quality: scoreQuality(score), flags };
  }
  return withText;
}
