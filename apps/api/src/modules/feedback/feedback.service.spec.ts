import { PrismaService } from '../../prisma/prisma.service';
import { FeedbackService } from './feedback.service';

function buildPrisma() {
  return { feedback: { create: jest.fn() } };
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
    const service = new FeedbackService(prisma as unknown as PrismaService);

    const view = await service.create('u1', { rating: 5, comment: 'Love it' });

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
    const service = new FeedbackService(prisma as unknown as PrismaService);

    await service.create('u1', { rating: 4 });

    expect(prisma.feedback.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: 'u1', rating: 4, comment: null } }),
    );
  });
});
