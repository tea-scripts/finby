import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { MembersService } from './members.service';
import { InvitesService } from './invites.service';
import { MembersController } from './members.controller';
import { InvitesController } from './invites.controller';

@Module({
  imports: [AuthModule, EmailModule],
  controllers: [MembersController, InvitesController],
  providers: [MembersService, InvitesService],
})
export class MembersModule {}
