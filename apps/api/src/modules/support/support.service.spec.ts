import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import type { EmailService } from '../email/email.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SupportService } from './support.service';

function buildPrisma() {
  return {
    supportTicket: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
}

function buildEmail() {
  return {
    sendSupportTicketReceived: jest.fn().mockResolvedValue(undefined),
    sendSupportTicketAck: jest.fn().mockResolvedValue(undefined),
    sendSupportTicketResolved: jest.fn().mockResolvedValue(undefined),
  };
}

function buildConfig(notifyTo = 'support@finby.app') {
  return { get: jest.fn().mockReturnValue(notifyTo) };
}

function buildService(
  prisma: ReturnType<typeof buildPrisma>,
  email: ReturnType<typeof buildEmail> = buildEmail(),
  config: ReturnType<typeof buildConfig> = buildConfig(),
) {
  return new SupportService(
    prisma as unknown as PrismaService,
    email as unknown as EmailService,
    config as unknown as ConfigService<Env, true>,
  );
}

const row = {
  id: 't1',
  category: 'BUG' as const,
  subject: 'App crashes on login',
  message: 'It crashes every time.',
  status: 'OPEN' as const,
  resolvedAt: null,
  createdAt: new Date('2026-06-13T10:00:00.000Z'),
};

describe('SupportService.create', () => {
  it('persists the ticket for the user and returns an ISO view', async () => {
    const prisma = buildPrisma();
    prisma.supportTicket.create.mockResolvedValue(row);
    const service = buildService(prisma);

    const view = await service.create('u1', 'user@finby.app', {
      category: 'BUG',
      subject: 'App crashes on login',
      message: 'It crashes every time.',
    });

    expect(prisma.supportTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          userId: 'u1',
          category: 'BUG',
          subject: 'App crashes on login',
          message: 'It crashes every time.',
        },
      }),
    );
    expect(view).toEqual({
      id: 't1',
      category: 'BUG',
      subject: 'App crashes on login',
      message: 'It crashes every time.',
      status: 'OPEN',
      resolvedAt: null,
      createdAt: '2026-06-13T10:00:00.000Z',
    });
  });

  it('emails the support inbox with the ticket details', async () => {
    const prisma = buildPrisma();
    prisma.supportTicket.create.mockResolvedValue(row);
    const email = buildEmail();
    const service = buildService(prisma, email, buildConfig('help@finby.app'));

    await service.create('u1', 'user@finby.app', {
      category: 'BUG',
      subject: 'App crashes on login',
      message: 'It crashes every time.',
    });

    expect(email.sendSupportTicketReceived).toHaveBeenCalledWith(
      'help@finby.app',
      'user@finby.app',
      'BUG',
      'App crashes on login',
      'It crashes every time.',
      expect.any(String),
    );
  });

  it('emails an acknowledgement to the submitter', async () => {
    const prisma = buildPrisma();
    prisma.supportTicket.create.mockResolvedValue(row);
    const email = buildEmail();
    const service = buildService(prisma, email);

    await service.create('u1', 'user@finby.app', {
      category: 'BUG',
      subject: 'App crashes on login',
      message: 'It crashes every time.',
    });

    expect(email.sendSupportTicketAck).toHaveBeenCalledWith('user@finby.app', 'App crashes on login');
  });

  it('still returns the view when notification emails fail', async () => {
    const prisma = buildPrisma();
    prisma.supportTicket.create.mockResolvedValue(row);
    const email = buildEmail();
    email.sendSupportTicketReceived.mockRejectedValue(new Error('resend down'));
    email.sendSupportTicketAck.mockRejectedValue(new Error('resend down'));
    const service = buildService(prisma, email);

    const view = await service.create('u1', 'user@finby.app', {
      category: 'BUG',
      subject: 'App crashes on login',
      message: 'It crashes every time.',
    });

    expect(view.id).toBe('t1');
  });
});

describe('SupportService.listForUser', () => {
  it("returns the user's tickets as ISO views, newest first", async () => {
    const prisma = buildPrisma();
    prisma.supportTicket.findMany.mockResolvedValue([
      { ...row, resolvedAt: new Date('2026-06-14T09:00:00.000Z'), status: 'RESOLVED' },
    ]);
    const service = buildService(prisma);

    const views = await service.listForUser('u1');

    expect(prisma.supportTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' }, orderBy: { createdAt: 'desc' } }),
    );
    expect(views[0]).toEqual({
      id: 't1',
      category: 'BUG',
      subject: 'App crashes on login',
      message: 'It crashes every time.',
      status: 'RESOLVED',
      resolvedAt: '2026-06-14T09:00:00.000Z',
      createdAt: '2026-06-13T10:00:00.000Z',
    });
  });
});

const adminRow = { ...row, user: { email: 'user@finby.app', displayName: 'Aisha' } };

describe('SupportService.listAll (admin)', () => {
  it('filters by status when given and includes the submitter', async () => {
    const prisma = buildPrisma();
    prisma.supportTicket.findMany.mockResolvedValue([adminRow]);
    const service = buildService(prisma);

    const views = await service.listAll('OPEN');

    expect(prisma.supportTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { email: true, displayName: true } } },
      }),
    );
    expect(views[0]).toMatchObject({
      id: 't1',
      status: 'OPEN',
      user: { email: 'user@finby.app', displayName: 'Aisha' },
    });
  });

  it('lists all tickets when no status filter is given', async () => {
    const prisma = buildPrisma();
    prisma.supportTicket.findMany.mockResolvedValue([adminRow]);
    const service = buildService(prisma);

    await service.listAll();

    expect(prisma.supportTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });
});

describe('SupportService.updateStatus (admin)', () => {
  it('resolving sets resolvedAt and emails the submitter', async () => {
    const prisma = buildPrisma();
    prisma.supportTicket.findUnique.mockResolvedValue({ ...adminRow, status: 'OPEN', resolvedAt: null });
    prisma.supportTicket.update.mockResolvedValue({
      ...adminRow,
      status: 'RESOLVED',
      resolvedAt: new Date('2026-06-15T08:00:00.000Z'),
    });
    const email = buildEmail();
    const service = buildService(prisma, email);

    const view = await service.updateStatus('t1', 'RESOLVED');

    expect(prisma.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 't1' },
        data: expect.objectContaining({ status: 'RESOLVED', resolvedAt: expect.any(Date) }),
      }),
    );
    expect(email.sendSupportTicketResolved).toHaveBeenCalledWith('user@finby.app', 'App crashes on login');
    expect(view.status).toBe('RESOLVED');
  });

  it('moving to a non-resolved status clears resolvedAt and sends no email', async () => {
    const prisma = buildPrisma();
    prisma.supportTicket.findUnique.mockResolvedValue({ ...adminRow, status: 'OPEN', resolvedAt: null });
    prisma.supportTicket.update.mockResolvedValue({ ...adminRow, status: 'IN_PROGRESS', resolvedAt: null });
    const email = buildEmail();
    const service = buildService(prisma, email);

    await service.updateStatus('t1', 'IN_PROGRESS');

    expect(prisma.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'IN_PROGRESS', resolvedAt: null }) }),
    );
    expect(email.sendSupportTicketResolved).not.toHaveBeenCalled();
  });

  it('does not re-email when an already-resolved ticket stays resolved', async () => {
    const prisma = buildPrisma();
    prisma.supportTicket.findUnique.mockResolvedValue({
      ...adminRow,
      status: 'RESOLVED',
      resolvedAt: new Date('2026-06-15T08:00:00.000Z'),
    });
    prisma.supportTicket.update.mockResolvedValue({
      ...adminRow,
      status: 'RESOLVED',
      resolvedAt: new Date('2026-06-15T08:00:00.000Z'),
    });
    const email = buildEmail();
    const service = buildService(prisma, email);

    await service.updateStatus('t1', 'RESOLVED');

    expect(email.sendSupportTicketResolved).not.toHaveBeenCalled();
  });

  it('throws when the ticket does not exist', async () => {
    const prisma = buildPrisma();
    prisma.supportTicket.findUnique.mockResolvedValue(null);
    const service = buildService(prisma);

    await expect(service.updateStatus('missing', 'RESOLVED')).rejects.toThrow();
  });
});
