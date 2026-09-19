import { describe, expect, it } from 'vitest';
import { hasUrl, parseBulkUrls } from '@/shared/tools/bulk-open';

describe('parseBulkUrls', () => {
  it('parses one URL per line, trimming whitespace', () => {
    const result = parseBulkUrls('https://a.com\n  https://b.com  \nhttps://c.com');
    expect(result.map((r) => r.url)).toEqual(['https://a.com', 'https://b.com', 'https://c.com']);
  });

  it('drops blank lines', () => {
    const result = parseBulkUrls('https://a.com\n\n   \nhttps://b.com\n');
    expect(result).toHaveLength(2);
  });

  it('prepends https:// to a bare host', () => {
    const result = parseBulkUrls('example.com\napp.example.com/login?x=1');
    expect(result.map((r) => r.url)).toEqual([
      'https://example.com',
      'https://app.example.com/login?x=1',
    ]);
  });

  it('leaves an existing scheme untouched (including non-https)', () => {
    const result = parseBulkUrls('http://a.com\nftp://b.com\nchrome://extensions');
    expect(result.map((r) => r.url)).toEqual([
      'http://a.com',
      'ftp://b.com',
      'chrome://extensions',
    ]);
  });

  it('reports an error for a line that is not a valid URL even with a scheme prefix', () => {
    const result = parseBulkUrls('not a url at all');
    expect(result).toHaveLength(1);
    expect(result[0]?.url).toBeNull();
    expect(result[0]?.error).toBe('Not a valid URL.');
    expect(result[0]?.raw).toBe('not a url at all');
  });

  it('rejects any line containing whitespace, regardless of what new URL() alone would accept', () => {
    // Verified directly against real Chrome (not assumed): Chrome's own
    // `new URL()` is lenient about a space in the host and percent-encodes
    // it instead of throwing (`new URL('https://not a url')` succeeds as
    // `https://not%20a%20url/`) — unlike Node's implementation, which is
    // what this test actually runs under (happy-dom/Vitest). A dedicated
    // whitespace check is what makes rejection work in the real extension.
    expect(parseBulkUrls('not a url')[0]).toEqual({
      raw: 'not a url',
      url: null,
      error: 'Not a valid URL.',
    });
    expect(parseBulkUrls('https://example.com/some path')[0]?.url).toBeNull();
  });

  it('keeps duplicate lines as separate entries', () => {
    const result = parseBulkUrls('https://a.com\nhttps://a.com');
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.url)).toEqual(['https://a.com', 'https://a.com']);
  });

  it('returns [] for blank input', () => {
    expect(parseBulkUrls('')).toEqual([]);
    expect(parseBulkUrls('   \n  \n')).toEqual([]);
  });

  it('validates and normalizes independently of surrounding valid/invalid lines', () => {
    const result = parseBulkUrls('https://a.com\nnot a url\nb.com');
    expect(result[0]).toEqual({ raw: 'https://a.com', url: 'https://a.com', error: null });
    expect(result[1]).toEqual({ raw: 'not a url', url: null, error: 'Not a valid URL.' });
    expect(result[2]).toEqual({ raw: 'b.com', url: 'https://b.com', error: null });
  });
});

describe('hasUrl', () => {
  it('narrows to entries with a real url', () => {
    const entries = parseBulkUrls('https://a.com\nnot a url');
    const valid = entries.filter(hasUrl);
    expect(valid).toHaveLength(1);
    expect(valid[0]?.url).toBe('https://a.com');
  });
});
