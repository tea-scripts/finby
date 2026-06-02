import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { RequireTier } from '../../common/decorators/require-tier.decorator';
import { TierGuard } from '../../common/guards/tier.guard';
import { WorkspaceMemberGuard } from '../../common/guards/workspace-member.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { MarketDataService } from './market.service';
import { marketSearchQuerySchema, type MarketSearchQuery } from './dto/market.schemas';
import type { MarketQuote, MarketSearchResult } from './market.types';

/**
 * Workspace-scoped so Pro-tier gating works uniformly (the contract's bare
 * /market path can't carry tier context). The get_market_data chat tool uses
 * the same service with the conversation's workspace context.
 */
@Controller('workspaces/:workspaceId/market')
@UseGuards(WorkspaceMemberGuard, TierGuard)
@RequireTier('PRO')
export class MarketController {
  constructor(private readonly market: MarketDataService) {}

  @Get('quote/:ticker')
  quote(@Param('ticker') ticker: string): Promise<MarketQuote> {
    return this.market.getQuote(ticker);
  }

  @Get('search')
  search(
    @Query(new ZodValidationPipe(marketSearchQuerySchema)) query: MarketSearchQuery,
  ): Promise<MarketSearchResult> {
    return this.market.search(query.q);
  }
}
