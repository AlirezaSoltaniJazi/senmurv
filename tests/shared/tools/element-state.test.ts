import { describe, expect, it } from 'vitest';
import { isInteractive, readElementState } from '@/shared/tools/element-state';
import type { StateEnv } from '@/shared/tools/element-state';

const VISIBLE: StateEnv = { isVisible: () => true };
const HIDDEN: StateEnv = { isVisible: () => false };

function el(html: string): Element {
  const host = document.createElement('div');
  host.innerHTML = html.trim();
  const first = host.firstElementChild;
  if (!first) throw new Error('no element');
  return first;
}

describe('readElementState', () => {
  it('reads a button’s text and enabled/visible state', () => {
    const s = readElementState(el('<button type="button">Save now</button>'), VISIBLE);
    expect(s.tag).toBe('button');
    expect(s.text).toBe('Save now');
    expect(s.value).toBe(null);
    expect(s.checked).toBe(null);
    expect(s.disabled).toBe(false);
    expect(s.visible).toBe(true);
    expect(s.attributes).toContainEqual({ name: 'type', value: 'button' });
  });

  it('reads a checked checkbox as checked, not valued', () => {
    const s = readElementState(el('<input type="checkbox" name="agree" checked>'), VISIBLE);
    expect(s.checked).toBe(true);
    expect(s.value).toBe(null);
    expect(s.inputType).toBe('checkbox');
    expect(s.attributes).toContainEqual({ name: 'name', value: 'agree' });
  });

  it('reads a text input’s value', () => {
    const s = readElementState(el('<input type="text" name="email" value="a@b.com">'), VISIBLE);
    expect(s.value).toBe('a@b.com');
    expect(s.checked).toBe(null);
    expect(s.inputType).toBe('text');
  });

  it('detects disabled via property and aria-disabled', () => {
    expect(readElementState(el('<input disabled>'), VISIBLE).disabled).toBe(true);
    expect(readElementState(el('<div aria-disabled="true">x</div>'), VISIBLE).disabled).toBe(true);
  });

  it('detects readonly', () => {
    expect(readElementState(el('<input readonly value="x">'), VISIBLE).readOnly).toBe(true);
  });

  it('curates attributes: keeps semantic/aria/data, drops class/style/id', () => {
    const s = readElementState(
      el('<a href="/x" id="y" class="z" data-testid="t" aria-label="go">Go</a>'),
      VISIBLE
    );
    const names = s.attributes.map((a) => a.name);
    expect(names).toContain('href');
    expect(names).toContain('data-testid');
    expect(names).toContain('aria-label');
    expect(names).not.toContain('id');
    expect(names).not.toContain('class');
    expect(s.text).toBe('Go');
  });

  it('collapses whitespace in text', () => {
    expect(readElementState(el('<p>  hello   world  </p>'), VISIBLE).text).toBe('hello world');
  });

  it('reflects the injected visibility', () => {
    expect(readElementState(el('<span>x</span>'), HIDDEN).visible).toBe(false);
  });
});

describe('isInteractive', () => {
  it('is true for form controls and links, false for a plain div', () => {
    expect(isInteractive(readElementState(el('<button>x</button>'), VISIBLE))).toBe(true);
    expect(isInteractive(readElementState(el('<a href="/">x</a>'), VISIBLE))).toBe(true);
    expect(isInteractive(readElementState(el('<div>x</div>'), VISIBLE))).toBe(false);
  });

  it('is true for a disabled non-interactive element (state matters)', () => {
    expect(isInteractive(readElementState(el('<div aria-disabled="true">x</div>'), VISIBLE))).toBe(
      true
    );
  });
});
