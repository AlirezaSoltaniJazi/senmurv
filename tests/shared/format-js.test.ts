import { describe, expect, it } from 'vitest';
import { formatJs } from '@/shared/format-js';

describe('formatJs', () => {
  it('expands a one-line snippet into multiple indented lines', () => {
    const out = formatJs('function f(){return 1;}');
    expect(out.split('\n').length).toBeGreaterThan(1);
    expect(out).toContain('return 1;');
  });

  it('uses 2-space indentation', () => {
    const out = formatJs('if(a){b();}');
    expect(out).toContain('\n  ');
  });
});
