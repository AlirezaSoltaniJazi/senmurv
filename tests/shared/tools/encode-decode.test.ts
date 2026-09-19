import { describe, expect, it } from 'vitest';
import { decodeText, encodeText, ENCODING_OPTIONS } from '@/shared/tools/encode-decode';
import type { EncodingKind } from '@/shared/tools/encode-decode';

function ok(result: ReturnType<typeof encodeText>): string {
  if (!result.ok) throw new Error(`expected ok, got error: ${result.error}`);
  return result.value;
}

describe('ENCODING_OPTIONS', () => {
  it('covers every EncodingKind exactly once', () => {
    const keys = ENCODING_OPTIONS.map((o) => o.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(['base64', 'url', 'hex', 'html'] satisfies EncodingKind[]);
  });

  it('gives every option a non-empty label', () => {
    for (const opt of ENCODING_OPTIONS) expect(opt.label.length).toBeGreaterThan(0);
  });
});

describe('Base64', () => {
  it('encodes a known ASCII string', () => {
    expect(ok(encodeText('hello', 'base64'))).toBe('aGVsbG8=');
  });

  it('decodes a known ASCII string', () => {
    expect(ok(decodeText('aGVsbG8=', 'base64'))).toBe('hello');
  });

  it('round-trips unicode text (multi-byte UTF-8)', () => {
    const original = 'café ☕ 😀';
    const encoded = ok(encodeText(original, 'base64'));
    expect(ok(decodeText(encoded, 'base64'))).toBe(original);
  });

  it('reports an error for invalid Base64 rather than throwing', () => {
    const res = decodeText('not!!valid==base64', 'base64');
    expect(res.ok).toBe(false);
  });

  it('reports a distinct error for blank input', () => {
    const res = decodeText('   ', 'base64');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('Nothing to decode');
  });
});

describe('URL / URI', () => {
  it('percent-encodes reserved characters', () => {
    expect(ok(encodeText(' a+b?c=d&e', 'url'))).toBe('%20a%2Bb%3Fc%3Dd%26e');
  });

  it('decodes percent-encoded text back to the original', () => {
    expect(ok(decodeText('%20a%2Bb%3Fc%3Dd%26e', 'url'))).toBe(' a+b?c=d&e');
  });

  it('reports an error for malformed percent-encoding rather than throwing', () => {
    const res = decodeText('100% off', 'url');
    expect(res.ok).toBe(false);
  });
});

describe('Hex', () => {
  it('encodes ASCII text to lowercase hex byte pairs', () => {
    expect(ok(encodeText('AB', 'hex'))).toBe('4142');
  });

  it('decodes hex back to text', () => {
    expect(ok(decodeText('4142', 'hex'))).toBe('AB');
  });

  it('tolerates whitespace between byte pairs', () => {
    expect(ok(decodeText('41 42', 'hex'))).toBe('AB');
  });

  it('round-trips unicode text (multi-byte UTF-8)', () => {
    const original = 'café ☕';
    const encoded = ok(encodeText(original, 'hex'));
    expect(ok(decodeText(encoded, 'hex'))).toBe(original);
  });

  it('rejects an odd number of hex digits', () => {
    const res = decodeText('414', 'hex');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('even number');
  });

  it('rejects non-hex characters', () => {
    const res = decodeText('41zz', 'hex');
    expect(res.ok).toBe(false);
  });

  it('reports a distinct error for blank input', () => {
    const res = decodeText('   ', 'hex');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('Nothing to decode');
  });
});

describe('HTML entities', () => {
  it('escapes the reserved characters', () => {
    expect(ok(encodeText(`<b>a & b</b> "quote" 'apos'`, 'html'))).toBe(
      '&lt;b&gt;a &amp; b&lt;/b&gt; &quot;quote&quot; &#39;apos&#39;'
    );
  });

  it('unescapes named entities back to the original', () => {
    const original = `<b>a & b</b> "quote" 'apos'`;
    expect(ok(decodeText(ok(encodeText(original, 'html')), 'html'))).toBe(original);
  });

  it('decodes decimal and hex numeric character references', () => {
    expect(ok(decodeText('&#65;&#x42;', 'html'))).toBe('AB');
  });

  it('leaves an unrecognized named entity untouched rather than failing', () => {
    expect(ok(decodeText('&notreal;', 'html'))).toBe('&notreal;');
  });
});
