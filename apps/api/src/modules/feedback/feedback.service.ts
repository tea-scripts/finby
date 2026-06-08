import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateFeedbackInput } from './dto/feedback.schemas';
import type { FeedbackView } from './feedback.types';

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, input: CreateFeedbackInput): Promise<FeedbackView> {
    const fb = await this.prisma.feedback.create({
      data: { userId, rating: input.rating, comment: input.comment ?? null },
      select: { id: true, rating: true, comment: true, createdAt: true },
    });
    return {
      id: fb.id,
      rating: fb.rating,
      comment: fb.comment,
      createdAt: fb.createdAt.toISOString(),
    };
  }
}
