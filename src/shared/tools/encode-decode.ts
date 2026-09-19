import type { Result } from '@/shared/types';

/**
 * Pure encode/decode helpers for the Encode / Decode tool. Chrome-free and
 * DOM-free (only `atob`/`btoa`, `TextEncoder`/`TextDecoder` and `JSON`), so
 * it unit-tests cleanly and needs no in-page mode — like the JWT decoder and
 * JSON Formatter, this tool never touches the page.
 */

export type EncodingKind = 'base64' | 'url' | 'hex' | 'html';

export interface EncodingOption {
  readonly key: EncodingKind;
  readonly label: string;
}

/** Shown as the format chip row, in this order. */
export const ENCODING_OPTIONS: readonly EncodingOption[] = [
  { key: 'base64', label: 'Base64' },
  { key: 'url', label: 'URL / URI' },
  { key: 'hex', label: 'Hex' },
  { key: 'html', label: 'HTML entities' },
];

const HTML_NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  trade: '™',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  euro: '€',
  pound: '£',
  cent: '¢',
  deg: '°',
};

function base64Encode(input: string): Result<string> {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return { ok: true, value: btoa(binary) };
}

function base64Decode(input: string): Result<string> {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, error: 'Nothing to decode — paste some Base64.' };
  let binary: string;
  try {
    binary = atob(trimmed);
  } catch {
    return { ok: false, error: 'Invalid Base64 input.' };
  }
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return { ok: true, value: new TextDecoder().decode(bytes) };
}

function urlEncode(input: string): Result<string> {
  try {
    return { ok: true, value: encodeURIComponent(input) };
  } catch {
    return { ok: false, error: 'Could not URL-encode this text — it has an unpaired surrogate.' };
  }
}

function urlDecode(input: string): Result<string> {
  try {
    return { ok: true, value: decodeURIComponent(input) };
  } catch {
    return {
      ok: false,
      error: 'Invalid percent-encoding — a "%" is not followed by two hex digits.',
    };
  }
}

function hexEncode(input: string): Result<string> {
  const bytes = new TextEncoder().encode(input);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return { ok: true, value: hex };
}

function hexDecode(input: string): Result<string> {
  const cleaned = input.trim().replace(/\s+/g, '').replace(/^0x/i, '');
  if (cleaned === '') return { ok: false, error: 'Nothing to decode — paste some hex.' };
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
    return { ok: false, error: 'Not valid hex — only 0-9 and a-f are allowed.' };
  }
  if (cleaned.length % 2 !== 0) {
    return { ok: false, error: 'Hex input must have an even number of digits.' };
  }
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return { ok: true, value: new TextDecoder().decode(bytes) };
}

function htmlEncode(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

/** Decodes named (`&amp;`), decimal (`&#65;`) and hex (`&#x41;`) entities; an unknown named entity is left as-is. */
function htmlDecode(input: string): Result<string> {
  const value = input.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, ref: string) => {
    if (/^#x/i.test(ref)) {
      const code = parseInt(ref.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (ref.startsWith('#')) {
      const code = parseInt(ref.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return HTML_NAMED_ENTITIES[ref] ?? match;
  });
  return { ok: true, value };
}

/** Encode `input` as the given format. */
export function encodeText(input: string, kind: EncodingKind): Result<string> {
  switch (kind) {
    case 'base64':
      return base64Encode(input);
    case 'url':
      return urlEncode(input);
    case 'hex':
      return hexEncode(input);
    case 'html':
      return { ok: true, value: htmlEncode(input) };
  }
}

/** Decode `input` from the given format, or a human-readable error (never throws). */
export function decodeText(input: string, kind: EncodingKind): Result<string> {
  switch (kind) {
    case 'base64':
      return base64Decode(input);
    case 'url':
      return urlDecode(input);
    case 'hex':
      return hexDecode(input);
    case 'html':
      return htmlDecode(input);
  }
}
