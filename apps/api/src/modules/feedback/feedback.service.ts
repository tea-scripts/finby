import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import type { CreateFeedbackInput } from './dto/feedback.schemas';
import type { FeedbackView } from './feedback.types';

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async create(
    userId: string,
    submitterEmail: string,
    input: CreateFeedbackInput,
  ): Promise<FeedbackView> {
    const fb = await this.prisma.feedback.create({
      data: { userId, rating: input.rating, comment: input.comment ?? null },
      select: { id: true, rating: true, comment: true, createdAt: true },
    });
    await this.notify(submitterEmail, fb.rating, fb.comment, fb.createdAt);
    return {
      id: fb.id,
      rating: fb.rating,
      comment: fb.comment,
      createdAt: fb.createdAt.toISOString(),
    };
  }

  /** Email the team a branded review notification. Never throws — a mail
   *  failure must not fail the user's submission (it's already persisted). */
  private async notify(
    submitterEmail: string,
    rating: number,
    comment: string | null,
    createdAt: Date,
  ): Promise<void> {
    const to = this.config.get('FEEDBACK_NOTIFY_TO', { infer: true });
    try {
      await this.email.sendFeedbackNotification(
        to,
        submitterEmail,
        rating,
        comment,
        createdAt.toUTCString(),
      );
    } catch (err) {
      this.logger.error(
        `Failed to send feedback notification: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
