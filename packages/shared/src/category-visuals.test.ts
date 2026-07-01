import { describe, expect, it } from 'vitest';
import { resolveCategoryVisual, type CategoryVisual } from './category-visuals';

function emojiChar(v: CategoryVisual): string {
  if (v.kind !== 'emoji') throw new Error(`expected emoji visual, got ${v.kind}`);
  return v.char;
}

describe('resolveCategoryVisual', () => {
  it('maps a known icon key to a branded icon visual with its default color', () => {
    expect(resolveCategoryVisual({ name: 'Groceries', icon: 'cart' })).toEqual<CategoryVisual>({
      kind: 'icon',
      iconKey: 'cart',
      color: '#1A7A4A',
    });
  });

  it('lets an explicit color override the icon default color', () => {
    const v = resolveCategoryVisual({ name: 'Groceries', icon: 'cart', color: '#123456' });
    expect(v).toEqual({ kind: 'icon', iconKey: 'cart', color: '#123456' });
  });

  it('treats a non-key icon string as a stored emoji override', () => {
    const v = resolveCategoryVisual({ name: 'Whatever', icon: '🎯' });
    expect(v.kind).toBe('emoji');
    expect(v).toMatchObject({ kind: 'emoji', char: '🎯' });
  });

  it('keyword-derives an emoji from the name when there is no icon', () => {
    expect(emojiChar(resolveCategoryVisual({ name: 'Monthly Payroll' }))).toBe('💼');
    expect(emojiChar(resolveCategoryVisual({ name: 'Groceries' }))).toBe('🛒');
    expect(emojiChar(resolveCategoryVisual({ name: 'Uber rides' }))).toBe('🚕');
  });

  it('falls back to a generic emoji for an unrecognized name', () => {
    expect(emojiChar(resolveCategoryVisual({ name: 'Zorblax' }))).toBe('🏷️');
  });

  it('derives a deterministic, palette-bounded color for emoji visuals', () => {
    const a = resolveCategoryVisual({ name: 'Zorblax' });
    const b = resolveCategoryVisual({ name: 'Zorblax' });
    expect(a.color).toBe(b.color);
    expect(a.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});
