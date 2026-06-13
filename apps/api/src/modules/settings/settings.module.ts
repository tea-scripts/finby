import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { BaseCurrencyService } from './base-currency.service';
import { SettingsController } from './settings.controller';
import { FxModule } from '../fx/fx.module';

@Module({
  imports: [FxModule],
  controllers: [SettingsController],
  providers: [SettingsService, BaseCurrencyService],
  exports: [SettingsService, BaseCurrencyService],
})
export class SettingsModule {}
