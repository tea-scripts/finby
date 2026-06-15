import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { EmailModule } from '../email/email.module';
import { RemindersService } from './reminders.service';
import { ReengagementService } from './reengagement.service';
import { EarlyReminderService } from './early-reminder.service';

@Module({
  imports: [PushModule, EmailModule],
  providers: [RemindersService, ReengagementService, EarlyReminderService],
})
export class RemindersModule {}
