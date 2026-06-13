import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import type { EmailService } from '../email/email.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SupportService } from './support.service';

function buildPrisma() {
  return { supportTicket: { create: jest.fn(), findMany: jest.fn() } };
}

function buildEmail() {
  return {
    sendSupportTicketReceived: jest.fn().mockResolvedValue(undefined),
    sendSupportTicketAck: jest.fn().mockResolvedValue(undefined),
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
