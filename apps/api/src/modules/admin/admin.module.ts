import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminTicketsController } from './admin-tickets.controller';
import { AdminJwtStrategy } from './strategies/admin-jwt.strategy';
import { SupportModule } from '../support/support.module';

@Module({
  imports: [PassportModule, JwtModule.register({}), SupportModule],
  controllers: [
    AdminAuthController,
    AdminAnalyticsController,
    AdminUsersController,
    AdminTicketsController,
  ],
  providers: [AdminAuthService, AdminAnalyticsService, AdminUsersService, AdminJwtStrategy],
})
export class AdminModule {}
