/**
 * Pure text case-conversion for the Case Converter tool. Chrome-free and
 * DOM-free, so it unit-tests cleanly and needs no in-page mode — like the
 * JWT decoder and JSON Formatter, this tool never touches the page.
 */

export type CaseKind =
  | 'upper'
  | 'lower'
  | 'capitalized'
  | 'title'
  | 'sentence'
  | 'alternating'
  | 'inverse'
  | 'camel'
  | 'pascal'
  | 'snake'
  | 'constant'
  | 'kebab';

export interface CaseOption {
  readonly key: CaseKind;
  readonly label: string;
}

/** Shown as the chip row, in this order. */
export const CASE_OPTIONS: readonly CaseOption[] = [
  { key: 'upper', label: 'UPPER CASE' },
  { key: 'lower', label: 'lower case' },
  { key: 'capitalized', label: 'Capitalized Case' },
  { key: 'title', label: 'Title Case' },
  { key: 'sentence', label: 'Sentence case' },
  { key: 'alternating', label: 'aLtErNaTiNg cAsE' },
  { key: 'inverse', label: 'InVeRsE CaSe' },
  { key: 'camel', label: 'camelCase' },
  { key: 'pascal', label: 'PascalCase' },
  { key: 'snake', label: 'snake_case' },
  { key: 'constant', label: 'CONSTANT_CASE' },
  { key: 'kebab', label: 'kebab-case' },
];

/** Minor words Title Case lowercases unless they open or close the text. */
const SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'from',
  'in',
  'into',
  'nor',
  'of',
  'off',
  'on',
  'onto',
  'or',
  'over',
  'per',
  'so',
  'than',
  'that',
  'the',
  'to',
  'up',
  'via',
  'with',
  'yet',
]);

function capitalize(word: string): string {
  return word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Split arbitrary text into words: on whitespace/underscore/hyphen, and on a
 * lower-to-upper or acronym-to-word boundary (so "fooBar", "FooBar" and
 * "XMLHttpRequest" all split the way a human would read them). Punctuation
 * glued to a word (e.g. "hello," or "world!") is not stripped — it stays
 * attached to that word in the output.
 */
function toWords(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter((w) => w.length > 0);
}

/**
 * Proper Title Case: capitalizes every word except minor words (articles,
 * conjunctions, short prepositions), which are lowercased unless they open
 * or close the text — "the" in "Beauty and the Beast" stays lowercase, but
 * "The Lord of the Rings" keeps its leading "The" capitalized.
 */
function titleCase(words: string[]): string {
  return words
    .map((w, i) => {
      const lw = w.toLowerCase();
      if (i !== 0 && i !== words.length - 1 && SMALL_WORDS.has(lw)) return lw;
      return capitalize(lw);
    })
    .join(' ');
}

/**
 * Imposes a strict lower/upper pattern by character position — starting
 * lowercase — regardless of the input's original casing. Non-letters (e.g.
 * spaces) still occupy a position but are left untouched.
 */
function alternatingCase(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    out += /[a-zA-Z]/.test(ch) ? (i % 2 === 0 ? ch.toLowerCase() : ch.toUpperCase()) : ch;
  }
  return out;
}

/** Swaps each letter's own case — uppercase becomes lowercase and vice versa. */
function swapCase(ch: string): string {
  const lower = ch.toLowerCase();
  const upper = ch.toUpperCase();
  if (ch === upper && ch !== lower) return lower;
  if (ch === lower && ch !== upper) return upper;
  return ch;
}

function inverseCase(input: string): string {
  return Array.from(input).map(swapCase).join('');
}

/**
 * Convert `input` to the given case style. UPPER/lower/alternating/inverse
 * preserve the original text exactly (only letter case changes); every
 * other style re-splits into words and rejoins with that style's own
 * separator, so mixed input (spaces, underscores, camelCase, …) converts
 * sensibly between any two styles. Returns '' for blank/whitespace-only
 * input on every word-based style.
 */
export function convertCase(input: string, kind: CaseKind): string {
  if (kind === 'upper') return input.toUpperCase();
  if (kind === 'lower') return input.toLowerCase();
  if (kind === 'alternating') return alternatingCase(input);
  if (kind === 'inverse') return inverseCase(input);

  const words = toWords(input);
  if (words.length === 0) return '';
  const lowerWords = words.map((w) => w.toLowerCase());

  switch (kind) {
    case 'capitalized':
      return words.map((w) => capitalize(w.toLowerCase())).join(' ');
    case 'title':
      return titleCase(words);
    case 'sentence': {
      const joined = lowerWords.join(' ');
      return capitalize(joined);
    }
    case 'camel':
      return lowerWords.map((w, i) => (i === 0 ? w : capitalize(w))).join('');
    case 'pascal':
      return lowerWords.map((w) => capitalize(w)).join('');
    case 'snake':
      return lowerWords.join('_');
    case 'constant':
      return words.map((w) => w.toUpperCase()).join('_');
    case 'kebab':
      return lowerWords.join('-');
  }
}
