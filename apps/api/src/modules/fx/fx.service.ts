import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { Redis } from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type { Env } from '../../config/env.schema';
import type { FxConversion, FxRate } from './fx.types';
import type { FxRateProvider } from './providers/fx-provider.interface';
import { ExchangeRateApiProvider } from './providers/exchange-rate-api.provider';
import { FrankfurterProvider } from './providers/frankfurter.provider';

const CACHE_TTL_SECONDS = 15 * 60;

interface CachedRate {
  rate: string;
  date: string;
  source: string;
}

@Injectable()
export class FxService {
  private readonly logger = new Logger(FxService.name);
  private readonly providers: FxRateProvider[];

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {
    // Priority order: broad-coverage latest first, historical-capable fallback second.
    this.providers = [
      new ExchangeRateApiProvider(this.config.get('EXCHANGE_RATE_API_URL', { infer: true })),
      new FrankfurterProvider(this.config.get('FRANKFURTER_API_URL', { infer: true })),
    ];
  }

  async getRate(from: string, to: string, date?: string): Promise<FxRate> {
    const fromCode = from.toUpperCase();
    const toCode = to.toUpperCase();

    if (fromCode === toCode) {
      return {
        from: fromCode,
        to: toCode,
        rate: '1',
        inverseRate: '1',
        date: date ?? this.today(),
        source: 'identity',
        isCached: false,
      };
    }

    const cacheDay = date ?? this.today();
    const cacheKey = `fx:${fromCode}:${toCode}:${cacheDay}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const value = JSON.parse(cached) as CachedRate;
      return {
        from: fromCode,
        to: toCode,
        rate: value.rate,
        inverseRate: this.invert(value.rate),
        date: value.date,
        source: value.source,
        isCached: true,
      };
    }

    const fetched = await this.fetchRate(fromCode, toCode, date);
    await this.redis.set(cacheKey, JSON.stringify(fetched), 'EX', CACHE_TTL_SECONDS);

    return {
      from: fromCode,
      to: toCode,
      rate: fetched.rate,
      inverseRate: this.invert(fetched.rate),
      date: fetched.date,
      source: fetched.source,
      isCached: false,
    };
  }

  async convertToBase(params: {
    workspaceId: string;
    amount: string;
    from: string;
    to: string;
    date?: string;
  }): Promise<FxConversion> {
    const { workspaceId, amount, from, to, date } = params;
    const rate = await this.getRate(from, to, date);

    const amountBase = new Prisma.Decimal(amount)
      .mul(rate.rate)
      .toDecimalPlaces(8)
      .toString();
    const fxRateTimestamp = new Date();
    const snapshotDate = new Date(`${rate.date}T00:00:00.000Z`);

    await this.prisma.fxRateSnapshot.upsert({
      where: {
        workspaceId_baseCurrency_targetCurrency_snapshotDate: {
          workspaceId,
          baseCurrency: rate.from,
          targetCurrency: rate.to,
          snapshotDate,
        },
      },
      update: { rate: rate.rate, source: rate.source },
      create: {
        workspaceId,
        baseCurrency: rate.from,
        targetCurrency: rate.to,
        rate: rate.rate,
        source: rate.source,
        snapshotDate,
      },
    });

    return {
      amountBase,
      fxRateUsed: rate.rate,
      fxRateTimestamp,
      rate: rate.rate,
      date: rate.date,
    };
  }

  /** Convert an amount between currencies (no snapshot persisted). */
  async convertAmount(amount: string, from: string, to: string, date?: string): Promise<string> {
    if (from.toUpperCase() === to.toUpperCase()) {
      return new Prisma.Decimal(amount).toDecimalPlaces(8).toString();
    }
    const rate = await this.getRate(from, to, date);
    return new Prisma.Decimal(amount).mul(rate.rate).toDecimalPlaces(8).toString();
  }

  private async fetchRate(
    from: string,
    to: string,
    date?: string,
  ): Promise<CachedRate> {
    let transientError: unknown;
    for (const provider of this.providers) {
      try {
        const result = await provider.getRate(from, to, date);
        if (result) {
          return { rate: result.rate, date: result.date, source: provider.name };
        }
      } catch (error) {
        this.logger.warn(
          `FX provider ${provider.name} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        transientError = error; // provider is down — try the next one
      }
    }
    if (transientError !== undefined) {
      throw new ServiceUnavailableException('FX rate provider is unreachable.');
    }
    throw new UnprocessableEntityException(`No FX rate available for ${from} -> ${to}.`);
  }

  private invert(rate: string): string {
    return new Prisma.Decimal(1).div(rate).toDecimalPlaces(10).toString();
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
