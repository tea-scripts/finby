import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { MarketDataService } from './market.service';

const configMock = {
  get: jest.fn((key: keyof Env) => {
    const values: Partial<Record<keyof Env, unknown>> = {
      ALPHA_VANTAGE_API_URL: 'https://www.alphavantage.co',
      ALPHA_VANTAGE_API_KEY: 'demo',
    };
    return values[key];
  }),
} as unknown as ConfigService<Env, true>;

function build(overrides?: { redisGet?: jest.Mock; redisSet?: jest.Mock }) {
  const redisGet = overrides?.redisGet ?? jest.fn().mockResolvedValue(null);
  const redisSet = overrides?.redisSet ?? jest.fn().mockResolvedValue('OK');
  const redis = { get: redisGet, set: redisSet };
  const service = new MarketDataService(redis as never, configMock);
  return { service, redisGet, redisSet };
}

function mockFetch(payload: unknown) {
  return jest
    .spyOn(global, 'fetch')
    .mockResolvedValue({ ok: true, json: async () => payload } as unknown as Response);
}

afterEach(() => jest.restoreAllMocks());

const GLOBAL_QUOTE = {
  'Global Quote': {
    '01. symbol': 'AAPL',
    '05. price': '191.2000',
    '06. volume': '52430100',
    '09. change': '1.4000',
    '10. change percent': '0.7380%',
  },
};

describe('MarketDataService.getQuote', () => {
  it('fetches and parses a GLOBAL_QUOTE, caching with a 15-min TTL', async () => {
    const { service, redisSet } = build();
    const fetchSpy = mockFetch(GLOBAL_QUOTE);

    const quote = await service.getQuote('aapl');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(quote.ticker).toBe('AAPL');
    expect(quote.price).toBe('191.2000');
    expect(quote.change).toBe('1.4000');
    expect(quote.changePercent).toBeCloseTo(0.738, 2);
    expect(quote.volume).toBe(52430100);
    expect(redisSet).toHaveBeenCalledWith(
      expect.stringContaining('market:quote:AAPL'),
      expect.any(String),
      'EX',
      900,
    );
  });

  it('returns a cached quote without calling the provider', async () => {
    const redisGet = jest.fn().mockResolvedValue(
      JSON.stringify({ ticker: 'AAPL', price: '191.20', currency: 'USD', change: '0', changePercent: 0, volume: 1, marketCap: null, dataTimestamp: 'x', isDelayed: true }),
    );
    const { service } = build({ redisGet });
    const fetchSpy = mockFetch(GLOBAL_QUOTE);
    const quote = await service.getQuote('AAPL');
    expect(quote.price).toBe('191.20');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws ServiceUnavailable on an Alpha Vantage rate-limit note', async () => {
    const { service } = build();
    mockFetch({ Note: 'Thank you for using Alpha Vantage! Our standard API rate limit is 25 requests per day.' });
    await expect(service.getQuote('AAPL')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('throws ServiceUnavailable when the ticker is unknown (empty quote)', async () => {
    const { service } = build();
    mockFetch({ 'Global Quote': {} });
    await expect(service.getQuote('ZZZZ')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('MarketDataService.search', () => {
  it('parses SYMBOL_SEARCH bestMatches', async () => {
    const { service } = build();
    mockFetch({
      bestMatches: [
        { '1. symbol': 'AAPL', '2. name': 'Apple Inc.', '3. type': 'Equity', '4. region': 'United States' },
      ],
    });
    const result = await service.search('apple');
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({ ticker: 'AAPL', name: 'Apple Inc.', type: 'Equity' });
  });
});
