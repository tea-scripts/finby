import { AdminUsersService } from './admin-users.service';

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    user: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    ...prismaOverrides,
  };
  const svc = new AdminUsersService(prisma as never);
  return { svc, prisma };
}

const baseUser = {
  id: 'u1',
  displayName: 'Aisha',
  email: 'aisha@x.com',
  emailVerified: true,
  createdAt: new Date('2026-01-02T03:04:05.000Z'),
  lastLoginAt: new Date('2026-06-01T10:00:00.000Z'),
};

describe('AdminUsersService.list', () => {
  it('maps a paid owner to a subscription row', async () => {
    const { svc, prisma } = makeService();
    (prisma.user.count as jest.Mock).mockResolvedValue(1);
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
      {
        ...baseUser,
        workspaceMemberships: [
          {
            workspace: {
              tier: 'PRO',
              subscription: { tier: 'PRO', status: 'ACTIVE', createdAt: new Date('2026-03-01T00:00:00.000Z') },
            },
          },
        ],
      },
    ]);

    const res = await svc.list({ page: 1 });
    expect(res.users[0]?.subscription).toEqual({
      tier: 'PRO',
      status: 'ACTIVE',
      startedAt: '2026-03-01T00:00:00.000Z',
    });
  });

  it('returns null subscription for a free user', async () => {
    const { svc, prisma } = makeService();
    (prisma.user.count as jest.Mock).mockResolvedValue(1);
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
      {
        ...baseUser,
        workspaceMemberships: [{ workspace: { tier: 'FREE', subscription: null } }],
      },
    ]);

    const res = await svc.list({ page: 1 });
    expect(res.users[0]?.subscription).toBeNull();
  });

  it('builds insensitive OR search filter and pages by 50', async () => {
    const { svc, prisma } = makeService();
    (prisma.user.count as jest.Mock).mockResolvedValue(123);
    (prisma.user.findMany as jest.Mock).mockResolvedValue([]);

    const res = await svc.list({ page: 2, search: 'ai' });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 50,
        take: 50,
        where: {
          OR: [
            { displayName: { contains: 'ai', mode: 'insensitive' } },
            { email: { contains: 'ai', mode: 'insensitive' } },
          ],
        },
      }),
    );
    expect(res.total).toBe(123);
    expect(res.page).toBe(2);
    expect(res.pageSize).toBe(50);
  });

  it('serializes dates to ISO and preserves null lastLoginAt', async () => {
    const { svc, prisma } = makeService();
    (prisma.user.count as jest.Mock).mockResolvedValue(1);
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
      { ...baseUser, lastLoginAt: null, workspaceMemberships: [] },
    ]);

    const res = await svc.list({ page: 1 });
    expect(res.users[0]?.createdAt).toBe('2026-01-02T03:04:05.000Z');
    expect(res.users[0]?.lastLoginAt).toBeNull();
    expect(res.users[0]?.subscription).toBeNull();
  });
});
