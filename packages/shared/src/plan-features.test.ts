import { describe, expect, it } from 'vitest';
import { PLAN_FEATURES, condensedFeatures } from './plan-features';

describe('plan-features', () => {
  it('exposes a feature set per tier with the Free limitation note', () => {
    expect(PLAN_FEATURES.FREE.features.length).toBeGreaterThan(0);
    expect(PLAN_FEATURES.FREE.limitation).toContain('20-message memory window');
    expect(PLAN_FEATURES.PRO.features.some((f) => f.label.includes('90-day'))).toBe(true);
  });

  it('condensedFeatures returns up to 3, skipping the "Everything in" roll-up', () => {
    const pro = condensedFeatures('PRO');
    expect(pro.length).toBeLessThanOrEqual(3);
    expect(pro.every((f) => !f.label.startsWith('Everything in'))).toBe(true);
  });
});
