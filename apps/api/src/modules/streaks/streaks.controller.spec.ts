import 'reflect-metadata'; // so Reflect.getMetadata can read the @RequireTier decorator
import { REQUIRED_TIER_KEY } from '../../common/decorators/require-tier.decorator';
import { StreaksController } from './streaks.controller';
import type { StreaksService } from './streaks.service';
import type { StreakStatusView } from './streaks.types';
import type { WorkspaceContext } from '../../common/context';
import type { AuthUser } from '../auth/auth.types';

const VIEW: StreakStatusView = {
  currentStreak: 12,
  longestStreak: 12,
  atRisk: true,
  repairEligible: true,
  repairUsedThisMonth: false,
};

const workspace = { id: 'w1', tier: 'PRO' } as WorkspaceContext;
const user = { userId: 'u1', email: 'a@b.c' } as AuthUser;

function make() {
  const service = {
    getStatus: jest.fn().mockResolvedValue(VIEW),
    repair: jest.fn().mockResolvedValue(VIEW),
  };
  const controller = new StreaksController(service as unknown as StreaksService);
  return { controller, service };
}

describe('StreaksController', () => {
  it('getStatus delegates with the user id and workspace tier', async () => {
    const { controller, service } = make();
    await expect(controller.getStatus(workspace, user)).resolves.toBe(VIEW);
    expect(service.getStatus).toHaveBeenCalledWith('u1', 'PRO');
  });

  it('repair delegates with the user id', async () => {
    const { controller, service } = make();
    await expect(controller.repair(user)).resolves.toBe(VIEW);
    expect(service.repair).toHaveBeenCalledWith('u1');
  });

  it('the repair endpoint is gated to PRO and above', () => {
    const tier = Reflect.getMetadata(REQUIRED_TIER_KEY, StreaksController.prototype.repair);
    expect(tier).toBe('PRO');
  });

  it('getStatus is not tier-gated', () => {
    const tier = Reflect.getMetadata(REQUIRED_TIER_KEY, StreaksController.prototype.getStatus);
    expect(tier).toBeUndefined();
  });

  it('the calendar endpoint is not tier-gated', () => {
    const tier = Reflect.getMetadata(REQUIRED_TIER_KEY, StreaksController.prototype.getCalendar);
    expect(tier).toBeUndefined();
  });

  it('GET calendar delegates to the service for the current user', async () => {
    const calendar = { from: '2025-12-15', to: '2026-06-15', activeDays: [], repairedDays: [] };
    const streaks = { getCalendar: jest.fn().mockResolvedValue(calendar) };
    const controller = new StreaksController(streaks as unknown as StreaksService);

    await expect(
      controller.getCalendar({ userId: 'u1' } as unknown as AuthUser),
    ).resolves.toBe(calendar);
    expect(streaks.getCalendar).toHaveBeenCalledWith('u1');
  });
});
