import { SubscriptionController } from './subscription.controller';
import type { SubscriptionService } from './subscription.service';

describe('SubscriptionController.changePlan', () => {
  it('delegates to SubscriptionService.changePlan with workspace id and tier', async () => {
    const subscriptions = { changePlan: jest.fn().mockResolvedValue({ tier: 'PREMIUM' }) };
    const controller = new SubscriptionController(subscriptions as unknown as SubscriptionService);

    const result = await controller.changePlan(
      { id: 'w1' } as never,
      { tier: 'PREMIUM' },
    );

    expect(subscriptions.changePlan).toHaveBeenCalledWith('w1', 'PREMIUM');
    expect(result).toEqual({ tier: 'PREMIUM' });
  });
});
