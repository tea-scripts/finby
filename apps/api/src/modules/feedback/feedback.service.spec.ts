import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import type { EmailService } from '../email/email.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FeedbackService } from './feedback.service';

function buildPrisma() {
  return { feedback: { create: jest.fn() } };
}

function buildEmail() {
  return { sendFeedbackNotification: jest.fn().mockResolvedValue(undefined) };
}

function buildConfig(notifyTo = 'support@finby.app') {
  return { get: jest.fn().mockReturnValue(notifyTo) };
}

function buildService(
  prisma: ReturnType<typeof buildPrisma>,
  email: ReturnType<typeof buildEmail> = buildEmail(),
  config: ReturnType<typeof buildConfig> = buildConfig(),
) {
  return new FeedbackService(
    prisma as unknown as PrismaService,
    email as unknown as EmailService,
    config as unknown as ConfigService<Env, true>,
  );
}

describe('FeedbackService.create', () => {
  it('persists the rating + comment for the user and returns an ISO view', async () => {
    const prisma = buildPrisma();
    prisma.feedback.create.mockResolvedValue({
      id: 'f1',
      rating: 5,
      comment: 'Love it',
      createdAt: new Date('2026-06-08T10:00:00.000Z'),
    });
    const service = buildService(prisma);

    const view = await service.create('u1', 'user@finby.app', { rating: 5, comment: 'Love it' });

    expect(prisma.feedback.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { userId: 'u1', rating: 5, comment: 'Love it' },
      }),
    );
    expect(view).toEqual({
      id: 'f1',
      rating: 5,
      comment: 'Love it',
      createdAt: '2026-06-08T10:00:00.000Z',
    });
  });

  it('stores null when no comment is given', async () => {
    const prisma = buildPrisma();
    prisma.feedback.create.mockResolvedValue({
      id: 'f2',
      rating: 4,
      comment: null,
      createdAt: new Date('2026-06-08T10:00:00.000Z'),
    });
    const service = buildService(prisma);

    await service.create('u1', 'user@finby.app', { rating: 4 });

    expect(prisma.feedback.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: 'u1', rating: 4, comment: null } }),
    );
  });

  it('emails the configured inbox with the submitter and review details', async () => {
    const prisma = buildPrisma();
    prisma.feedback.create.mockResolvedValue({
      id: 'f3',
      rating: 2,
      comment: 'Needs work',
      createdAt: new Date('2026-06-08T10:00:00.000Z'),
    });
    const email = buildEmail();
    const service = buildService(prisma, email, buildConfig('reviews@finby.app'));

    await service.create('u1', 'user@finby.app', { rating: 2, comment: 'Needs work' });

    expect(email.sendFeedbackNotification).toHaveBeenCalledWith(
      'reviews@finby.app',
      'user@finby.app',
      2,
      'Needs work',
      expect.any(String),
    );
  });

  it('still returns the view when the notification email fails', async () => {
    const prisma = buildPrisma();
    prisma.feedback.create.mockResolvedValue({
      id: 'f4',
      rating: 5,
      comment: null,
      createdAt: new Date('2026-06-08T10:00:00.000Z'),
    });
    const email = buildEmail();
    email.sendFeedbackNotification.mockRejectedValue(new Error('resend down'));
    const service = buildService(prisma, email);

    const view = await service.create('u1', 'user@finby.app', { rating: 5 });

    expect(view.id).toBe('f4');
  });
});
