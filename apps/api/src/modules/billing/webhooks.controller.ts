import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { SubscriptionService } from './subscription.service';

/** Public, signature-verified billing webhooks. Require the raw request body. */
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly subscriptions: SubscriptionService) {}

  @Public()
  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  async stripe(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ): Promise<{ received: boolean }> {
    const event = await this.subscriptions
      .getProvider('STRIPE')
      .parseWebhook(req.rawBody ?? Buffer.from(''), signature ?? '');
    await this.subscriptions.applyWebhookEvent('STRIPE', event);
    return { received: true };
  }

  @Public()
  @Post('paystack')
  @HttpCode(HttpStatus.OK)
  async paystack(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature: string,
  ): Promise<{ received: boolean }> {
    const event = await this.subscriptions
      .getProvider('PAYSTACK')
      .parseWebhook(req.rawBody ?? Buffer.from(''), signature ?? '');
    await this.subscriptions.applyWebhookEvent('PAYSTACK', event);
    return { received: true };
  }
}
