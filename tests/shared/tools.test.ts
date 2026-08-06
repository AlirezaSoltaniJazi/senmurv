import { describe, expect, it } from 'vitest';
import { findTool, matchesToolQuery, togglePinned, TOOLS } from '@/shared/tools';
import type { ToolKey } from '@/shared/tools';

describe('TOOLS registry', () => {
  it('covers every ToolKey exactly once', () => {
    const keys = TOOLS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual([
      'bypass',
      'sitedata',
      'measure',
      'color',
      'taborder',
      'a11y',
      'font',
      'assert',
      'stack',
      'validation',
      'region',
      'harden',
      'jwt',
      'json',
      'queryparams',
      'logicalnames',
      'webapi',
      'autorefresh',
    ] satisfies ToolKey[]);
  });

  it('gives every tool a label and a blurb naming its limits', () => {
    for (const tool of TOOLS) {
      expect(tool.label.length).toBeGreaterThan(0);
      expect(tool.blurb.length).toBeGreaterThan(20);
    }
  });

  it('gives every tool its own non-empty icon — no two tools share one', () => {
    const icons = TOOLS.map((t) => t.icon);
    for (const icon of icons) expect(icon.length).toBeGreaterThan(0);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('only assigns an in-page mode to tools that actually enter one', () => {
    const withMode = TOOLS.filter((t) => t.mode !== null).map((t) => t.key);
    expect(withMode).toEqual([
      'measure',
      'color',
      'taborder',
      'font',
      'assert',
      'stack',
      'validation',
      'logicalnames',
    ]);
  });
});

describe('findTool', () => {
  it('resolves a known key', () => {
    expect(findTool('measure').key).toBe('measure');
    expect(findTool('a11y').label).toBe('Accessibility');
  });

  it('falls back to the first tool rather than returning undefined', () => {
    expect(findTool('nope' as ToolKey)).toBe(TOOLS[0]);
  });
});

describe('matchesToolQuery', () => {
  it('matches a blank query against everything', () => {
    expect(matchesToolQuery({ label: 'Bypass', blurb: 'x' }, '')).toBe(true);
    expect(matchesToolQuery({ label: 'Bypass', blurb: 'x' }, '   ')).toBe(true);
  });

  it('matches the label case-insensitively', () => {
    expect(matchesToolQuery({ label: 'Accessibility', blurb: 'x' }, 'access')).toBe(true);
    expect(matchesToolQuery({ label: 'Accessibility', blurb: 'x' }, 'ACCESS')).toBe(true);
    expect(matchesToolQuery({ label: 'Accessibility', blurb: 'x' }, 'nope')).toBe(false);
  });

  it('also matches the blurb, so searching by what a tool does works', () => {
    expect(
      matchesToolQuery({ label: 'Open in Web API', blurb: 'Dataverse Web API URL' }, 'dataverse')
    ).toBe(true);
  });

  it('finds every real tool by a distinctive word in its own label', () => {
    for (const tool of TOOLS) {
      const word = tool.label.split(' ')[0]!;
      expect(matchesToolQuery(tool, word)).toBe(true);
    }
  });
});

describe('togglePinned', () => {
  it('pins a new key by appending it', () => {
    expect(togglePinned(['bypass'], 'measure', 5)).toEqual(['bypass', 'measure']);
  });

  it('unpins an already-pinned key', () => {
    expect(togglePinned(['bypass', 'measure'], 'bypass', 5)).toEqual(['measure']);
  });

  it('is a no-op (same array reference) when adding past the cap', () => {
    const pinned: ToolKey[] = ['bypass', 'measure', 'color', 'a11y', 'font'];
    expect(togglePinned(pinned, 'stack', 5)).toBe(pinned);
  });

  it('still allows unpinning while at the cap', () => {
    const pinned: ToolKey[] = ['bypass', 'measure', 'color', 'a11y', 'font'];
    expect(togglePinned(pinned, 'font', 5)).toEqual(['bypass', 'measure', 'color', 'a11y']);
  });

  it('does not mutate the input array', () => {
    const pinned: ToolKey[] = ['bypass'];
    togglePinned(pinned, 'measure', 5);
    expect(pinned).toEqual(['bypass']);
  });
});
