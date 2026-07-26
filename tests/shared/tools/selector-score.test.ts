import { describe, expect, it } from 'vitest';
import { scoreQuality, scoreSelector } from '@/shared/tools/selector-score';

function flagIds(selector: string, kind: 'css' | 'xpath'): string[] {
  return scoreSelector(selector, kind)
    .flags.map((f) => f.id)
    .sort();
}

describe('scoreSelector — robust anchors score high', () => {
  it('rewards a data-testid', () => {
    const r = scoreSelector('[data-testid="submit"]', 'css');
    expect(r.score).toBe(95);
    expect(r.quality).toBe('high');
    expect(r.flags).toEqual([]);
  });

  it('rewards a stable id', () => {
    expect(scoreSelector('#login-form', 'css').score).toBe(88);
  });

  it('rewards a semantic attribute (aria-label)', () => {
    const r = scoreSelector('button[aria-label="Close"]', 'css');
    expect(r.score).toBe(76);
    expect(r.flags).toEqual([]);
  });

  it('rewards a testid in XPath', () => {
    const r = scoreSelector('//button[@data-testid="save"]', 'xpath');
    expect(r.score).toBe(92);
    expect(r.quality).toBe('high');
  });
});

describe('scoreSelector — fragile patterns score low and are named', () => {
  it('flags a positional nth-child chain', () => {
    const sel = '#app > div:nth-child(2) > ul > li:nth-child(3)';
    const r = scoreSelector(sel, 'css');
    expect(r.quality).toBe('low');
    expect(flagIds(sel, 'css')).toEqual(['deep-chain', 'positional']);
  });

  it('flags a hashed / CSS-in-JS class', () => {
    expect(flagIds('.css-1a2b3c', 'css')).toContain('hashed-class');
    expect(scoreSelector('.css-1a2b3c', 'css').quality).toBe('low');
  });

  it('flags Tailwind-style utility classes', () => {
    const r = scoreSelector('div.btn.px-4.text-sm', 'css');
    expect(r.flags.map((f) => f.id)).toContain('utility-class');
    expect(r.quality).toBe('medium');
  });

  it('flags a framework-generated id', () => {
    expect(flagIds('#ember123', 'css')).toContain('generated-id');
    expect(scoreSelector('#ember123', 'css').quality).toBe('low');
  });

  it('flags an absolute, index-heavy XPath', () => {
    const sel = '/html/body/div[2]/div[1]/button';
    expect(flagIds(sel, 'xpath')).toEqual(['absolute-xpath', 'deep-chain', 'xpath-index']);
    expect(scoreSelector(sel, 'xpath').score).toBe(0);
  });

  it('flags text dependence for either kind', () => {
    expect(flagIds('//button[text()="Submit"]', 'xpath')).toContain('text-dependence');
    expect(flagIds('button:contains("Save")', 'css')).toContain('text-dependence');
  });

  it('flags a structure-only selector', () => {
    expect(flagIds('div > span', 'css')).toContain('structural');
  });
});

describe('scoreQuality bands', () => {
  it('maps score to high/medium/low with the expected boundaries', () => {
    expect(scoreQuality(100)).toBe('high');
    expect(scoreQuality(70)).toBe('high');
    expect(scoreQuality(69)).toBe('medium');
    expect(scoreQuality(45)).toBe('medium');
    expect(scoreQuality(44)).toBe('low');
    expect(scoreQuality(0)).toBe('low');
  });
});
