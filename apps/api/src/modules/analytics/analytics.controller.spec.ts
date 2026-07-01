import { ForbiddenException } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';

function ctrl() {
  const analytics = {
    summary: jest.fn().mockResolvedValue({ ok: true }),
    byCategory: jest.fn().mockResolvedValue({ ok: true }),
  } as never;
  const insights = { insight: jest.fn().mockResolvedValue({ ok: true }) } as never;
  return new AnalyticsController(analytics, insights);
}

const FREE = { id: 'ws1', baseCurrency: 'USD', tier: 'FREE' } as never;
const PRO = { id: 'ws1', baseCurrency: 'USD', tier: 'PRO' } as never;

describe('AnalyticsController history gating', () => {
  it('rejects a FREE request for a month older than the 3-month window', async () => {
    // Far past date is guaranteed outside FREE's window regardless of "now".
    await expect(
      ctrl().summary(FREE, { from: '2000-01-01', to: '2000-01-31' } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a PRO request for an old month (unlimited)', async () => {
    await expect(
      ctrl().summary(PRO, { from: '2000-01-01', to: '2000-01-31' } as never),
    ).resolves.toEqual({ ok: true });
  });
});
