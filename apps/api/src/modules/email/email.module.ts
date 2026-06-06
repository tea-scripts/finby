import { Module } from '@nestjs/common';
import { EMAIL_PROVIDER } from './email.constants';
import { EmailService } from './email.service';
import { ResendProvider } from './providers/resend.provider';

@Module({
  providers: [EmailService, { provide: EMAIL_PROVIDER, useClass: ResendProvider }],
  exports: [EmailService],
})
export class EmailModule {}
