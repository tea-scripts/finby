import { TIER_PRICING, TIER_HIGHLIGHTS } from '@finby/shared';
import { PlansController } from './plans.controller';

describe('PlansController', () => {
  let controller: PlansController;

  beforeEach(() => {
    controller = new PlansController();
  });

  it('returns exactly 3 plans', () => {
    const { plans } = controller.getPlans();
    expect(plans).toHaveLength(3);
  });

  it('PRO plan has correct priceDisplay, name, highlights, and pricing data', () => {
    const { plans } = controller.getPlans();
    const pro = plans.find((p) => p.tier === 'PRO');
    expect(pro).toBeDefined();
    expect(pro!.priceDisplay).toBe('$4.99');
    expect(pro!.name).toBe('Pro');
    expect(pro!.highlights).toHaveLength(3);
    expect(pro!.highlights).toEqual(TIER_HIGHLIGHTS.PRO);
    expect(pro!.amountMinor).toBe(TIER_PRICING.PRO.amountMinor);
    expect(pro!.currency).toBe(TIER_PRICING.PRO.currency);
    expect(pro!.interval).toBe(TIER_PRICING.PRO.interval);
  });

  it('PREMIUM plan has correct priceDisplay, name, highlights, and pricing data', () => {
    const { plans } = controller.getPlans();
    const premium = plans.find((p) => p.tier === 'PREMIUM');
    expect(premium).toBeDefined();
    expect(premium!.priceDisplay).toBe('$9.99');
    expect(premium!.name).toBe('Premium');
    expect(premium!.highlights).toHaveLength(3);
    expect(premium!.highlights).toEqual(TIER_HIGHLIGHTS.PREMIUM);
    expect(premium!.amountMinor).toBe(TIER_PRICING.PREMIUM.amountMinor);
    expect(premium!.currency).toBe(TIER_PRICING.PREMIUM.currency);
    expect(premium!.interval).toBe(TIER_PRICING.PREMIUM.interval);
  });

  it('FAMILY plan has correct priceDisplay, name, highlights, and pricing data', () => {
    const { plans } = controller.getPlans();
    const family = plans.find((p) => p.tier === 'FAMILY');
    expect(family).toBeDefined();
    expect(family!.priceDisplay).toBe('$14.99');
    expect(family!.name).toBe('Family');
    expect(family!.highlights).toHaveLength(3);
    expect(family!.highlights).toEqual(TIER_HIGHLIGHTS.FAMILY);
    expect(family!.amountMinor).toBe(TIER_PRICING.FAMILY.amountMinor);
    expect(family!.currency).toBe(TIER_PRICING.FAMILY.currency);
    expect(family!.interval).toBe(TIER_PRICING.FAMILY.interval);
  });

  it('plans are in PRO, PREMIUM, FAMILY order', () => {
    const { plans } = controller.getPlans();
    expect(plans.map((p) => p.tier)).toEqual(['PRO', 'PREMIUM', 'FAMILY']);
  });
});
