import { Controller, Get } from '@nestjs/common';
import { TIER_PRICING, TIER_HIGHLIGHTS, formatTierPrice, type SubscriptionTier } from '@finby/shared';
import { Public } from '../../common/decorators/public.decorator';

type PaidTier = Exclude<SubscriptionTier, 'FREE'>;
const TIER_NAMES: Record<PaidTier, string> = { PRO: 'Pro', PREMIUM: 'Premium', FAMILY: 'Family' };
const PAID_TIERS: PaidTier[] = ['PRO', 'PREMIUM', 'FAMILY'];

export interface BillingPlan {
  tier: PaidTier;
  name: string;
  priceDisplay: string;
  amountMinor: number;
  currency: string;
  interval: string;
  highlights: string[];
}

@Public()
@Controller('billing')
export class PlansController {
  @Get('plans')
  getPlans(): { plans: BillingPlan[] } {
    const plans = PAID_TIERS.map((tier) => {
      const price = TIER_PRICING[tier];
      return {
        tier,
        name: TIER_NAMES[tier],
        priceDisplay: formatTierPrice(tier),
        amountMinor: price.amountMinor,
        currency: price.currency,
        interval: price.interval,
        highlights: TIER_HIGHLIGHTS[tier],
      };
    });
    return { plans };
  }
}
