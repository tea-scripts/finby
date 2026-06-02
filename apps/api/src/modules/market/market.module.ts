import { Module } from '@nestjs/common';
import { MarketController } from './market.controller';
import { MarketDataService } from './market.service';

@Module({
  controllers: [MarketController],
  providers: [MarketDataService],
  exports: [MarketDataService],
})
export class MarketModule {}
