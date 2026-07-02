import { describe, it, expect } from 'vitest';
import type { Category } from '@finby/shared';
import { resolveCategoryId } from './receipt-category';

const cats: Category[] = [
  { id: 'c-dining', name: 'Dining', isArchived: false },
  { id: 'c-other', name: 'Other', isArchived: false },
  { id: 'c-old', name: 'Groceries', isArchived: true },
];

describe('resolveCategoryId', () => {
  it('matches an active category by name, case-insensitively', () => {
    expect(resolveCategoryId(cats, 'dining')).toBe('c-dining');
  });

  it('falls back to "Other" for an unknown name', () => {
    expect(resolveCategoryId(cats, 'Spaceship Parts')).toBe('c-other');
  });

  it('ignores archived categories when matching', () => {
    // "Groceries" exists but is archived → no match → falls back to Other.
    expect(resolveCategoryId(cats, 'Groceries')).toBe('c-other');
  });

  it('returns "" (uncategorized) when neither a match nor "Other" exists', () => {
    expect(resolveCategoryId([{ id: 'c-dining', name: 'Dining', isArchived: false }], 'Nope')).toBe('');
  });
});
