import { describe, expect, it } from 'vitest';
import { csvField } from '@/shared/csv';

// csvField is a security control: exported reports carry page-derived text, and
// a cell starting with = + - @ is executed as a formula by Excel and Sheets.
describe('csvField — formula injection', () => {
  it('prefixes an apostrophe onto every formula-triggering lead character', () => {
    expect(csvField('=1+1')).toBe("'=1+1");
    expect(csvField('+SUM(A1)')).toBe("'+SUM(A1)");
    expect(csvField('-2+3')).toBe("'-2+3");
    expect(csvField('@import')).toBe("'@import");
    expect(csvField('\tlead-tab')).toBe("'\tlead-tab");
  });

  it('quotes and prefixes when the value both triggers and needs quoting', () => {
    expect(csvField('=HYPERLINK("http://x"),1')).toBe('"\'=HYPERLINK(""http://x""),1"');
  });

  it('leaves an ordinary value untouched', () => {
    expect(csvField('Login page')).toBe('Login page');
    expect(csvField(42)).toBe('42');
  });
});

describe('csvField — quoting', () => {
  it('quotes values containing a comma, quote or newline', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('line1\nline2')).toBe('"line1\nline2"');
    expect(csvField('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it('doubles every inner quote, not just the first', () => {
    expect(csvField('"a" and "b"')).toBe('"""a"" and ""b"""');
  });
});
