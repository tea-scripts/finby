import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { RemindersService } from './reminders.service';

@Module({
  imports: [PushModule],
  providers: [RemindersService],
})
export class RemindersModule {}
