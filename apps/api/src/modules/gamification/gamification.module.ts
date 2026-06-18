import { Module } from '@nestjs/common';
import { GamificationController } from './gamification.controller';
import { AchievementService } from './achievement.service';
import { XpService } from './xp.service';
import { DailyLoginService } from './daily-login.service';

/** XP + achievements. PrismaModule is global, so no DB import is needed.
 *  Services are exported so the streaks and auth modules can award XP. */
@Module({
  controllers: [GamificationController],
  providers: [XpService, AchievementService, DailyLoginService],
  exports: [XpService, AchievementService, DailyLoginService],
})
export class GamificationModule {}
