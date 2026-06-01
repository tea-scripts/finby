import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkspaceMemberGuard } from './workspace-member.guard';
import { RolesGuard } from './roles.guard';
import { TierGuard } from './tier.guard';

function mockContext(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function mockReflector(value: unknown): Reflector {
  return { getAllAndOverride: jest.fn().mockReturnValue(value) } as unknown as Reflector;
}

describe('WorkspaceMemberGuard', () => {
  it('attaches workspace + membership when the user is a member', async () => {
    const prisma = {
      workspaceMember: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'm1',
          role: 'OWNER',
          workspace: { id: 'w1', name: 'W', slug: 'w', tier: 'FREE', baseCurrency: 'USD' },
        }),
      },
    };
    const guard = new WorkspaceMemberGuard(prisma as unknown as PrismaService);
    const req: Record<string, unknown> = {
      user: { userId: 'u1', email: 'e@x.com' },
      params: { workspaceId: 'w1' },
    };

    await expect(guard.canActivate(mockContext(req))).resolves.toBe(true);
    expect(req.workspace).toEqual({ id: 'w1', name: 'W', slug: 'w', tier: 'FREE', baseCurrency: 'USD' });
    expect(req.membership).toEqual({ id: 'm1', role: 'OWNER' });
    expect(prisma.workspaceMember.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId_userId: { workspaceId: 'w1', userId: 'u1' } },
      }),
    );
  });

  it('throws NotFound when the user is not a member', async () => {
    const prisma = { workspaceMember: { findUnique: jest.fn().mockResolvedValue(null) } };
    const guard = new WorkspaceMemberGuard(prisma as unknown as PrismaService);
    const req = { user: { userId: 'u1', email: 'e@x.com' }, params: { workspaceId: 'w1' } };
    await expect(guard.canActivate(mockContext(req))).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('RolesGuard', () => {
  it('allows when the member role is permitted', () => {
    const guard = new RolesGuard(mockReflector(['OWNER', 'CO_MANAGER']));
    expect(guard.canActivate(mockContext({ membership: { id: 'm1', role: 'OWNER' } }))).toBe(true);
  });

  it('forbids when the member role is not permitted', () => {
    const guard = new RolesGuard(mockReflector(['OWNER']));
    expect(() => guard.canActivate(mockContext({ membership: { id: 'm1', role: 'VIEWER' } }))).toThrow(
      ForbiddenException,
    );
  });

  it('allows when no roles are required', () => {
    const guard = new RolesGuard(mockReflector(undefined));
    expect(guard.canActivate(mockContext({}))).toBe(true);
  });
});

describe('TierGuard', () => {
  it('allows when the workspace tier meets the requirement', () => {
    const guard = new TierGuard(mockReflector('PRO'));
    expect(guard.canActivate(mockContext({ workspace: { tier: 'PREMIUM' } }))).toBe(true);
  });

  it('blocks with a TIER_LIMIT error when the tier is too low', () => {
    const guard = new TierGuard(mockReflector('PRO'));
    expect.assertions(2);
    try {
      guard.canActivate(mockContext({ workspace: { tier: 'FREE' } }));
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({ error: 'TIER_LIMIT' });
    }
  });

  it('blocks a FAMILY-only feature for a PREMIUM workspace', () => {
    const guard = new TierGuard(mockReflector('FAMILY'));
    expect(() => guard.canActivate(mockContext({ workspace: { tier: 'PREMIUM' } }))).toThrow(
      ForbiddenException,
    );
  });

  it('allows when no tier is required', () => {
    const guard = new TierGuard(mockReflector(undefined));
    expect(guard.canActivate(mockContext({}))).toBe(true);
  });
});
