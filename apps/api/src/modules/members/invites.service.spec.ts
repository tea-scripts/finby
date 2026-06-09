import { ConflictException, ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import { InvitesService } from './invites.service';

function activeInvite(over: Record<string, unknown> = {}) {
  return {
    id: 'inv1', workspaceId: 'ws1', email: 'a@x.com', role: 'VIEWER',
    status: 'PENDING', expiresAt: new Date(Date.now() + 60_000), acceptedAt: null,
    invitedByUserId: 'u1',
    workspace: { name: 'The Johnson Family', maxMembers: 5 },
    ...over,
  };
}

function createPrismaMock() {
  const client = {
    workspaceInvite: {
      findUnique: jest.fn().mockResolvedValue(activeInvite()),
      update: jest.fn().mockResolvedValue({}),
    },
    workspaceMember: {
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'm9' }),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'u2', email: 'a@x.com', displayName: 'Ada' }) },
    $transaction: jest.fn(),
  };
  client.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(client));
  return client;
}

type PrismaMock = ReturnType<typeof createPrismaMock>;

function build(
  prisma: PrismaMock = createPrismaMock(),
  auth: { provisionInvitedUser: jest.Mock } = { provisionInvitedUser: jest.fn() },
) {
  const service = new InvitesService(prisma as never, auth as never);
  return { service, prisma, auth };
}

describe('InvitesService.preview', () => {
  it('returns valid state for an active invite', async () => {
    const { service } = build();
    const p = await service.preview('rawtoken');
    expect(p).toEqual(expect.objectContaining({ workspaceName: 'The Johnson Family', email: 'a@x.com', role: 'VIEWER', state: 'valid' }));
  });

  it('404s for an unknown token', async () => {
    const prisma = createPrismaMock();
    prisma.workspaceInvite.findUnique.mockResolvedValue(null);
    const { service } = build(prisma);
    await expect(service.preview('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reports expired state for a past-due pending invite', async () => {
    const prisma = createPrismaMock();
    prisma.workspaceInvite.findUnique.mockResolvedValue(activeInvite({ expiresAt: new Date(Date.now() - 1000) }));
    const { service } = build(prisma);
    const p = await service.preview('rawtoken');
    expect(p.state).toBe('expired');
  });
});

describe('InvitesService.accept (existing user)', () => {
  it('rejects when the user email does not match the invite', async () => {
    const prisma = createPrismaMock();
    prisma.user.findUnique.mockResolvedValue({ id: 'u2', email: 'other@x.com', displayName: 'X' });
    const { service } = build(prisma);
    await expect(service.accept('rawtoken', 'u2')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates membership + marks invite accepted on the happy path', async () => {
    const { service, prisma } = build();
    await service.accept('rawtoken', 'u2');
    expect(prisma.workspaceMember.create).toHaveBeenCalled();
  });

  it('409s when seats are full at accept time', async () => {
    const prisma = createPrismaMock();
    prisma.workspaceMember.count.mockResolvedValue(5);
    const { service } = build(prisma);
    await expect(service.accept('rawtoken', 'u2')).rejects.toBeInstanceOf(ConflictException);
  });

  it('410s for an expired invite', async () => {
    const prisma = createPrismaMock();
    prisma.workspaceInvite.findUnique.mockResolvedValue(activeInvite({ expiresAt: new Date(Date.now() - 1000) }));
    const { service } = build(prisma);
    await expect(service.accept('rawtoken', 'u2')).rejects.toBeInstanceOf(GoneException);
  });
});

describe('InvitesService.acceptSignup (new user)', () => {
  it('provisions the account then links family membership', async () => {
    const prisma = createPrismaMock();
    prisma.user.findUnique.mockResolvedValue(null);
    const auth = { provisionInvitedUser: jest.fn().mockResolvedValue({ user: { id: 'u3' }, accessToken: 'a', refreshToken: 'r', workspace: {} }) };
    const { service } = build(prisma, auth);
    const res = await service.acceptSignup('rawtoken', { displayName: 'Ada', password: 'password123', baseCurrency: 'USD', timezone: 'UTC' });
    expect(auth.provisionInvitedUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'a@x.com', displayName: 'Ada' }));
    expect(prisma.workspaceMember.create).toHaveBeenCalled();
    expect(res.accessToken).toBe('a');
  });

  it('409s when an account with the invite email already exists', async () => {
    const prisma = createPrismaMock();
    prisma.user.findUnique.mockResolvedValue({ id: 'u2', email: 'a@x.com' });
    const { service } = build(prisma);
    await expect(service.acceptSignup('rawtoken', { displayName: 'Ada', password: 'password123', baseCurrency: 'USD', timezone: 'UTC' })).rejects.toBeInstanceOf(ConflictException);
  });
});
