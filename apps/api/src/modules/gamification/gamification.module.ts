import { Module } from '@nestjs/common';
import { GamificationController } from './gamification.controller';
import { AchievementService } from './achievement.service';
import { XpService } from './xp.service';

/** XP + achievements. PrismaModule is global, so no DB import is needed.
 *  Services are exported so the streaks module can award XP / unlock badges. */
@Module({
  controllers: [GamificationController],
  providers: [XpService, AchievementService],
  exports: [XpService, AchievementService],
})
export class GamificationModule {}
