import { describe, expect, it } from 'vitest';
import { formatJson, jsonKind, minifyJson, parseJson } from '@/shared/tools/json-format';

describe('parseJson', () => {
  it('parses valid JSON', () => {
    const res = parseJson('{"a":1,"b":[2,3]}');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toEqual({ a: 1, b: [2, 3] });
  });

  it('reports empty input distinctly', () => {
    const res = parseJson('   ');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('Nothing to parse');
  });

  it('returns a human-readable error for invalid JSON (never throws)', () => {
    const res = parseJson('{not: json,}');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.length).toBeGreaterThan(0);
  });
});

describe('formatJson', () => {
  it('pretty-prints with 2-space indentation', () => {
    const res = formatJson('{"a":1}');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toBe('{\n  "a": 1\n}');
  });

  it('honours a custom indent width', () => {
    const res = formatJson('{"a":1}', 4);
    if (res.ok) expect(res.value).toBe('{\n    "a": 1\n}');
  });

  it('propagates a parse error', () => {
    expect(formatJson('nope').ok).toBe(false);
  });
});

describe('minifyJson', () => {
  it('strips all insignificant whitespace', () => {
    const res = minifyJson('{\n  "a": 1,\n  "b": [ 2, 3 ]\n}');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toBe('{"a":1,"b":[2,3]}');
  });

  it('round-trips format → minify to the original compact form', () => {
    const compact = '{"x":[1,2],"y":{"z":true}}';
    const pretty = formatJson(compact);
    expect(pretty.ok).toBe(true);
    if (pretty.ok) {
      const back = minifyJson(pretty.value);
      if (back.ok) expect(back.value).toBe(compact);
    }
  });
});

describe('jsonKind', () => {
  it('classifies every JSON value kind', () => {
    expect(jsonKind(null)).toBe('null');
    expect(jsonKind([1])).toBe('array');
    expect(jsonKind({})).toBe('object');
    expect(jsonKind('s')).toBe('string');
    expect(jsonKind(7)).toBe('number');
    expect(jsonKind(true)).toBe('boolean');
  });
});
