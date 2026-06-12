import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../auth/auth.types';
import { FeedbackService } from './feedback.service';
import { createFeedbackSchema, type CreateFeedbackInput } from './dto/feedback.schemas';
import type { FeedbackView } from './feedback.types';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createFeedbackSchema)) body: CreateFeedbackInput,
  ): Promise<FeedbackView> {
    return this.feedback.create(user.userId, user.email, body);
  }
}
