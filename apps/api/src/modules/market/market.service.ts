import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type { Env } from '../../config/env.schema';
import type { CompanyOverview, MarketQuote, MarketSearchResult } from './market.types';

const QUOTE_TTL_SECONDS = 15 * 60;
const INFO_TTL_SECONDS = 24 * 60 * 60;

/** Alpha Vantage signals rate limits / info via these keys instead of an HTTP error. */
function rateLimited(payload: Record<string, unknown>): boolean {
  return 'Note' in payload || 'Information' in payload;
}

@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async getQuote(ticker: string): Promise<MarketQuote> {
    const symbol = ticker.toUpperCase();
    const cacheKey = `market:quote:${symbol}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as MarketQuote;
    }

    const data = await this.fetch<{ 'Global Quote'?: Record<string, string> }>('GLOBAL_QUOTE', {
      symbol,
    });
    const q = data['Global Quote'];
    if (!q || !q['05. price']) {
      throw new ServiceUnavailableException(`No market data available for ${symbol}.`);
    }

    const quote: MarketQuote = {
      ticker: q['01. symbol'] ?? symbol,
      name: null,
      price: q['05. price'],
      currency: 'USD',
      change: q['09. change'] ?? '0',
      changePercent: parseFloat((q['10. change percent'] ?? '0').replace('%', '')),
      volume: Number(q['06. volume'] ?? 0),
      marketCap: null,
      dataTimestamp: new Date().toISOString(),
      isDelayed: true,
    };

    await this.redis.set(cacheKey, JSON.stringify(quote), 'EX', QUOTE_TTL_SECONDS);
    return quote;
  }

  async search(query: string): Promise<MarketSearchResult> {
    const cacheKey = `market:search:${query.trim().toLowerCase()}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as MarketSearchResult;
    }

    const data = await this.fetch<{ bestMatches?: Array<Record<string, string>> }>('SYMBOL_SEARCH', {
      keywords: query,
    });

    const result: MarketSearchResult = {
      results: (data.bestMatches ?? []).map((m) => ({
        ticker: m['1. symbol'] ?? '',
        name: m['2. name'] ?? '',
        exchange: m['4. region'] ?? '',
        type: m['3. type'] ?? '',
      })),
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', INFO_TTL_SECONDS);
    return result;
  }

  async getOverview(ticker: string): Promise<CompanyOverview | null> {
    const symbol = ticker.toUpperCase();
    const cacheKey = `market:overview:${symbol}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as CompanyOverview;
    }

    const data = await this.fetch<Record<string, string>>('OVERVIEW', { symbol });
    if (!data.Symbol) {
      return null;
    }

    const overview: CompanyOverview = {
      ticker: data.Symbol,
      name: data.Name ?? null,
      exchange: data.Exchange ?? null,
      currency: data.Currency ?? 'USD',
      marketCap: data.MarketCapitalization ?? null,
      peRatio: data.PERatio ?? null,
      sector: data.Sector ?? null,
      description: data.Description ?? null,
    };

    await this.redis.set(cacheKey, JSON.stringify(overview), 'EX', INFO_TTL_SECONDS);
    return overview;
  }

  private async fetch<T>(fn: string, params: Record<string, string>): Promise<T> {
    const base = this.config.get('ALPHA_VANTAGE_API_URL', { infer: true });
    const apiKey = this.config.get('ALPHA_VANTAGE_API_KEY', { infer: true });
    if (!apiKey) {
      throw new ServiceUnavailableException('Market data is not configured.');
    }

    const search = new URLSearchParams({ function: fn, apikey: apiKey, ...params });
    let response: Response;
    try {
      response = await fetch(`${base}/query?${search.toString()}`);
    } catch {
      throw new ServiceUnavailableException('Market data provider is unreachable.');
    }
    if (!response.ok) {
      throw new ServiceUnavailableException(`Market data provider error (${response.status}).`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    if (rateLimited(payload)) {
      this.logger.warn(`Alpha Vantage rate limit: ${JSON.stringify(payload)}`);
      throw new ServiceUnavailableException(
        'Market data is temporarily rate-limited. Please try again shortly.',
      );
    }
    return payload as T;
  }
}
