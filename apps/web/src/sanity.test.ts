import { describe, it, expect } from 'vitest';
import { DEFAULT_CATEGORIES } from '@budgy/shared';

describe('workspace wiring', () => {
  it('resolves the shared package', () => {
    expect(DEFAULT_CATEGORIES).toHaveLength(10);
    expect(DEFAULT_CATEGORIES[0]?.name).toBe('Groceries');
  });
});
