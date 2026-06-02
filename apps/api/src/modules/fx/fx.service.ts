import {
  Inject,
  Injectable,
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

const CACHE_TTL_SECONDS = 15 * 60;

interface CachedRate {
  rate: string;
  date: string;
  source: string;
}

@Injectable()
export class FxService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {}

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
        source: 'frankfurter',
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
    const base = this.config.get('FRANKFURTER_API_URL', { infer: true });
    const path = date ?? 'latest';
    const url = `${base}/${path}?from=${from}&to=${to}`;

    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      throw new ServiceUnavailableException('FX rate provider is unreachable.');
    }
    if (!response.ok) {
      throw new ServiceUnavailableException(`FX rate provider error (${response.status}).`);
    }

    const data = (await response.json()) as { date: string; rates?: Record<string, number> };
    const value = data.rates?.[to];
    if (value === undefined) {
      throw new UnprocessableEntityException(`No FX rate available for ${from} -> ${to}.`);
    }

    return { rate: String(value), date: data.date, source: 'frankfurter' };
  }

  private invert(rate: string): string {
    return new Prisma.Decimal(1).div(rate).toDecimalPlaces(10).toString();
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
