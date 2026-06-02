import { Module } from '@nestjs/common';
import { FxModule } from '../fx/fx.module';
import { MarketModule } from '../market/market.module';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';

@Module({
  imports: [FxModule, MarketModule],
  controllers: [PortfolioController],
  providers: [PortfolioService],
  exports: [PortfolioService],
})
export class PortfolioModule {}
