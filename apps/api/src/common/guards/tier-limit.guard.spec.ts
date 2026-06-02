import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { TierLimitGuard } from './tier-limit.guard';
import type { TierLimitMeta } from '../decorators/tier-limit.decorator';

function mockContext(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function mockReflector(meta: TierLimitMeta | undefined): Reflector {
  return { getAllAndOverride: jest.fn().mockReturnValue(meta) } as unknown as Reflector;
}

function prismaWithCount(count: number): PrismaService {
  return { category: { count: jest.fn().mockResolvedValue(count) } } as unknown as PrismaService;
}

describe('TierLimitGuard — currencies', () => {
  const meta: TierLimitMeta = { key: 'currencies' };

  it('blocks a non-base currency on a FREE workspace', async () => {
    const guard = new TierLimitGuard(mockReflector(meta), prismaWithCount(0));
    const req = { workspace: { id: 'w1', tier: 'FREE', baseCurrency: 'USD' }, body: { currency: 'PHP' } };
    await expect(guard.canActivate(mockContext(req))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows the base currency on a FREE workspace', async () => {
    const guard = new TierLimitGuard(mockReflector(meta), prismaWithCount(0));
    const req = { workspace: { id: 'w1', tier: 'FREE', baseCurrency: 'USD' }, body: { currency: 'usd' } };
    await expect(guard.canActivate(mockContext(req))).resolves.toBe(true);
  });

  it('allows any currency on a PRO workspace', async () => {
    const guard = new TierLimitGuard(mockReflector(meta), prismaWithCount(0));
    const req = { workspace: { id: 'w1', tier: 'PRO', baseCurrency: 'USD' }, body: { currency: 'PHP' } };
    await expect(guard.canActivate(mockContext(req))).resolves.toBe(true);
  });
});

describe('TierLimitGuard — customCategories', () => {
  const meta: TierLimitMeta = { key: 'customCategories' };

  it('blocks creating a 6th custom category on FREE', async () => {
    const guard = new TierLimitGuard(mockReflector(meta), prismaWithCount(5));
    const req = { workspace: { id: 'w1', tier: 'FREE', baseCurrency: 'USD' }, body: {} };
    await expect(guard.canActivate(mockContext(req))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows creating under the FREE limit', async () => {
    const guard = new TierLimitGuard(mockReflector(meta), prismaWithCount(4));
    const req = { workspace: { id: 'w1', tier: 'FREE', baseCurrency: 'USD' }, body: {} };
    await expect(guard.canActivate(mockContext(req))).resolves.toBe(true);
  });

  it('allows unlimited custom categories on PRO', async () => {
    const guard = new TierLimitGuard(mockReflector(meta), prismaWithCount(99));
    const req = { workspace: { id: 'w1', tier: 'PRO', baseCurrency: 'USD' }, body: {} };
    await expect(guard.canActivate(mockContext(req))).resolves.toBe(true);
  });
});

describe('TierLimitGuard — no metadata', () => {
  it('passes through when no limit is declared', async () => {
    const guard = new TierLimitGuard(mockReflector(undefined), prismaWithCount(0));
    await expect(guard.canActivate(mockContext({}))).resolves.toBe(true);
  });
});
