import { describe, expect, it } from 'vitest';
import { CASE_OPTIONS, convertCase } from '@/shared/tools/case-convert';
import type { CaseKind } from '@/shared/tools/case-convert';

describe('CASE_OPTIONS', () => {
  it('covers every CaseKind exactly once', () => {
    const keys = CASE_OPTIONS.map((o) => o.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual([
      'upper',
      'lower',
      'capitalized',
      'title',
      'sentence',
      'alternating',
      'inverse',
      'camel',
      'pascal',
      'snake',
      'constant',
      'kebab',
    ] satisfies CaseKind[]);
  });

  it('gives every option a non-empty label', () => {
    for (const opt of CASE_OPTIONS) expect(opt.label.length).toBeGreaterThan(0);
  });
});

describe('convertCase', () => {
  it('upper cases without touching word boundaries', () => {
    expect(convertCase('Hello World!', 'upper')).toBe('HELLO WORLD!');
  });

  it('lower cases without touching word boundaries', () => {
    expect(convertCase('Hello World!', 'lower')).toBe('hello world!');
  });

  it('capitalizes every word, lowercasing the rest of each', () => {
    expect(convertCase('hello WORLD of tests', 'capitalized')).toBe('Hello World Of Tests');
  });

  it('title-cases, lowercasing minor words except first/last', () => {
    expect(convertCase('the lord of the rings', 'title')).toBe('The Lord of the Rings');
    expect(convertCase('a tale of two cities', 'title')).toBe('A Tale of Two Cities');
  });

  it('sentence-cases: only the first letter is capitalized', () => {
    expect(convertCase('HELLO there WORLD', 'sentence')).toBe('Hello there world');
  });

  it('alternates case by character position, ignoring original casing', () => {
    expect(convertCase('alternating case', 'alternating')).toBe('aLtErNaTiNg cAsE');
  });

  it('inverts each letter’s own case', () => {
    expect(convertCase('Hello World', 'inverse')).toBe('hELLO wORLD');
    expect(convertCase('already INVERTED', 'inverse')).toBe('ALREADY inverted');
  });

  it('converts to camelCase from spaced or snake input', () => {
    expect(convertCase('hello world test', 'camel')).toBe('helloWorldTest');
    expect(convertCase('hello_world_test', 'camel')).toBe('helloWorldTest');
  });

  it('converts to PascalCase', () => {
    expect(convertCase('hello world test', 'pascal')).toBe('HelloWorldTest');
  });

  it('converts to snake_case', () => {
    expect(convertCase('Hello World Test', 'snake')).toBe('hello_world_test');
  });

  it('converts to CONSTANT_CASE', () => {
    expect(convertCase('Hello World Test', 'constant')).toBe('HELLO_WORLD_TEST');
  });

  it('converts to kebab-case', () => {
    expect(convertCase('Hello World Test', 'kebab')).toBe('hello-world-test');
  });

  it('splits camelCase/PascalCase/acronym input on word boundaries', () => {
    expect(convertCase('fooBar', 'snake')).toBe('foo_bar');
    expect(convertCase('XMLHttpRequest', 'kebab')).toBe('xml-http-request');
  });

  it('returns "" for blank input on every word-based style', () => {
    for (const opt of CASE_OPTIONS) {
      if (opt.key === 'upper' || opt.key === 'lower') continue;
      if (opt.key === 'alternating' || opt.key === 'inverse') continue;
      expect(convertCase('   ', opt.key)).toBe('');
    }
  });

  it('leaves non-letters untouched by alternating/inverse case', () => {
    expect(convertCase('foo 123 bar!', 'alternating')).toBe('fOo 123 bAr!');
    expect(convertCase('foo 123 bar!', 'inverse')).toBe('FOO 123 BAR!');
  });
});
