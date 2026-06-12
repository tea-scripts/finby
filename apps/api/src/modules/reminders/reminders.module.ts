import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { EmailModule } from '../email/email.module';
import { RemindersService } from './reminders.service';
import { ReengagementService } from './reengagement.service';

@Module({
  imports: [PushModule, EmailModule],
  providers: [RemindersService, ReengagementService],
})
export class RemindersModule {}
