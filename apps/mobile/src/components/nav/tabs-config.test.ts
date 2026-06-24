import { describe, expect, it } from 'vitest';
import { TABS } from './tabs-config';

describe('TABS', () => {
  it('defines the four tabs in order', () => {
    expect(TABS.map((t) => t.name)).toEqual(['index', 'dashboard', 'transactions', 'settings']);
  });

  it('each tab has an outline and a filled icon', () => {
    for (const t of TABS) {
      expect(typeof t.outline).toBe('string');
      expect(typeof t.filled).toBe('string');
    }
  });
});
