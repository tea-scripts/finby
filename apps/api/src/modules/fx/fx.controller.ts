import { Controller, Get, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { FxService } from './fx.service';
import { fxRateQuerySchema, type FxRateQuery } from './dto/fx.schemas';
import type { FxRate } from './fx.types';

@Controller('fx')
export class FxController {
  constructor(private readonly fx: FxService) {}

  @Get('rate')
  rate(@Query(new ZodValidationPipe(fxRateQuerySchema)) query: FxRateQuery): Promise<FxRate> {
    return this.fx.getRate(query.from, query.to, query.date);
  }
}
