import { ConflictException, ForbiddenException } from '@nestjs/common';
import { MembersService } from './members.service';

function buildPrisma(overrides: Record<string, unknown> = {}) {
  return {
    workspace: {
      findUnique: jest.fn().mockResolvedValue({ name: 'The Johnson Family', tier: 'FAMILY', maxMembers: 5 }),
    },
    workspaceMember: {
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    workspaceInvite: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'inv1', ...data }),
      ),
    },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    ...overrides,
  };
}

function build(prisma = buildPrisma(), email = { sendMemberInvite: jest.fn().mockResolvedValue(undefined) }, config = { get: () => 'https://app' }) {
  const service = new MembersService(prisma as never, email as never, config as never);
  return { service, prisma, email };
}

const INVITER = { userId: 'u1', name: 'Bola' };

describe('MembersService.inviteMember', () => {
  it('rejects when the workspace is not on FAMILY', async () => {
    const prisma = buildPrisma();
    prisma.workspace.findUnique = jest.fn().mockResolvedValue({ name: 'w', tier: 'PRO', maxMembers: 1 });
    const { service } = build(prisma);
    await expect(
      service.inviteMember('ws1', INVITER, { email: 'a@x.com', role: 'VIEWER' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects when seats are full (members + pending invites >= maxMembers)', async () => {
    const prisma = buildPrisma();
    prisma.workspaceMember.count = jest.fn().mockResolvedValue(3);
    prisma.workspaceInvite.count = jest.fn().mockResolvedValue(2); // 3 + 2 = 5 = max
    const { service } = build(prisma);
    await expect(
      service.inviteMember('ws1', INVITER, { email: 'a@x.com', role: 'VIEWER' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects when the email already belongs to a member', async () => {
    const prisma = buildPrisma();
    prisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'u2' });
    prisma.workspaceMember.findFirst = jest.fn().mockResolvedValue({ id: 'm2' });
    const { service } = build(prisma);
    await expect(
      service.inviteMember('ws1', INVITER, { email: 'a@x.com', role: 'VIEWER' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects when a pending invite already exists for the email', async () => {
    const prisma = buildPrisma();
    prisma.workspaceInvite.findFirst = jest.fn().mockResolvedValue({ id: 'inv0' });
    const { service } = build(prisma);
    await expect(
      service.inviteMember('ws1', INVITER, { email: 'a@x.com', role: 'VIEWER' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a hashed-token invite and sends the email on the happy path', async () => {
    const { service, prisma, email } = build();
    const result = await service.inviteMember('ws1', INVITER, { email: 'a@x.com', role: 'CO_MANAGER' });
    const createArg = prisma.workspaceInvite.create.mock.calls[0][0].data;
    expect(createArg.email).toBe('a@x.com');
    expect(createArg.role).toBe('CO_MANAGER');
    expect(createArg.status).toBe('PENDING');
    expect(createArg.tokenHash).toMatch(/^[a-f0-9]{64}$/); // sha256 hex
    expect(createArg.workspaceId).toBe('ws1');
    expect(createArg.invitedByUserId).toBe('u1');
    expect(email.sendMemberInvite).toHaveBeenCalledTimes(1);
    const acceptUrl = email.sendMemberInvite.mock.calls[0][3];
    expect(acceptUrl).toContain('/invite/'); // raw token in URL, not the hash
    expect(result).toEqual(expect.objectContaining({ id: 'inv1', email: 'a@x.com', role: 'CO_MANAGER' }));
  });
});

describe('MembersService.listMembers', () => {
  it('maps members and flags the acting user as self', async () => {
    const prisma = buildPrisma({
      workspaceMember: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'm1', userId: 'u1', role: 'OWNER', joinedAt: new Date('2026-01-01'), user: { displayName: 'Bola', email: 'b@x.com' } },
          { id: 'm2', userId: 'u2', role: 'VIEWER', joinedAt: new Date('2026-02-01'), user: { displayName: 'Ada', email: 'a@x.com' } },
        ]),
      },
    });
    const { service } = build(prisma);
    const members = await service.listMembers('ws1', 'u2');
    expect(members).toHaveLength(2);
    expect(members[0]).toEqual(expect.objectContaining({ id: 'm1', displayName: 'Bola', role: 'OWNER', isSelf: false }));
    expect(members[1]).toEqual(expect.objectContaining({ id: 'm2', displayName: 'Ada', isSelf: true }));
  });
});

describe('MembersService.listInvites', () => {
  it('returns pending invites mapped to views', async () => {
    const prisma = buildPrisma({
      workspaceInvite: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'inv1', email: 'a@x.com', role: 'VIEWER', invitedByUserId: 'u1', expiresAt: new Date(), createdAt: new Date() },
        ]),
      },
    });
    const { service } = build(prisma);
    const invites = await service.listInvites('ws1');
    expect(invites).toEqual([expect.objectContaining({ id: 'inv1', email: 'a@x.com', role: 'VIEWER' })]);
  });
});
