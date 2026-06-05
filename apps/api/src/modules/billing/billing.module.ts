import { Module } from '@nestjs/common';
import { LEMONSQUEEZY_PROVIDER, PAYSTACK_PROVIDER, STRIPE_PROVIDER } from './billing.constants';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { WebhooksController } from './webhooks.controller';
import { StripeProvider } from './providers/stripe.provider';
import { PaystackProvider } from './providers/paystack.provider';
import { LemonSqueezyProvider } from './providers/lemonsqueezy.provider';

@Module({
  controllers: [SubscriptionController, WebhooksController],
  providers: [
    SubscriptionService,
    { provide: STRIPE_PROVIDER, useClass: StripeProvider },
    { provide: PAYSTACK_PROVIDER, useClass: PaystackProvider },
    { provide: LEMONSQUEEZY_PROVIDER, useClass: LemonSqueezyProvider },
  ],
  exports: [SubscriptionService],
})
export class BillingModule {}
