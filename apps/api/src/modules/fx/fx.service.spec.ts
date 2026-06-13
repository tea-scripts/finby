import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { PrismaService } from '../../prisma/prisma.service';
import { FxService } from './fx.service';

const configMock = {
  get: jest.fn((key: string) =>
    key === 'EXCHANGE_RATE_API_URL' ? 'https://open.er-api.com' : 'https://api.frankfurter.dev/v1',
  ),
} as unknown as ConfigService<Env, true>;

function buildService(overrides?: {
  redisGet?: jest.Mock;
  redisSet?: jest.Mock;
  upsert?: jest.Mock;
}) {
  const redisGet = overrides?.redisGet ?? jest.fn().mockResolvedValue(null);
  const redisSet = overrides?.redisSet ?? jest.fn().mockResolvedValue('OK');
  const upsert = overrides?.upsert ?? jest.fn().mockResolvedValue({});
  const redis = { get: redisGet, set: redisSet };
  const prisma = { fxRateSnapshot: { upsert } };
  const service = new FxService(
    redis as never,
    configMock,
    prisma as unknown as PrismaService,
  );
  return { service, redisGet, redisSet, upsert };
}

function mockFetch(rates: Record<string, number>, date = '2026-06-02') {
  return jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      result: 'success',
      time_last_update_utc: new Date(`${date}T00:00:00Z`).toUTCString(),
      rates,
    }),
  } as unknown as Response);
}

afterEach(() => jest.restoreAllMocks());

describe('FxService.getRate', () => {
  it('returns rate 1 for identical currencies without hitting cache or network', async () => {
    const { service, redisGet } = buildService();
    const fetchSpy = mockFetch({});
    const rate = await service.getRate('USD', 'USD');
    expect(rate.rate).toBe('1');
    expect(rate.inverseRate).toBe('1');
    expect(redisGet).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns a cached rate without calling the provider', async () => {
    const redisGet = jest
      .fn()
      .mockResolvedValue(JSON.stringify({ rate: '0.0175', date: '2026-06-02', source: 'frankfurter' }));
    const { service } = buildService({ redisGet });
    const fetchSpy = mockFetch({ USD: 0.0175 });
    const rate = await service.getRate('PHP', 'USD');
    expect(rate.rate).toBe('0.0175');
    expect(rate.isCached).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches from the provider on a cache miss and caches with a 15-min TTL', async () => {
    const { service, redisSet } = buildService();
    const fetchSpy = mockFetch({ USD: 0.0175 });
    const rate = await service.getRate('PHP', 'USD');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(rate.rate).toBe('0.0175');
    expect(rate.isCached).toBe(false);
    expect(redisSet).toHaveBeenCalledWith(
      expect.stringContaining('fx:PHP:USD'),
      expect.any(String),
      'EX',
      900,
    );
  });
});

describe('FxService.convertToBase', () => {
  it('freezes amountBase = amount * rate and persists a workspace snapshot', async () => {
    const { service, upsert } = buildService();
    mockFetch({ USD: 0.0175 });
    const result = await service.convertToBase({
      workspaceId: 'w1',
      amount: '2200',
      from: 'PHP',
      to: 'USD',
    });
    expect(result.amountBase).toBe('38.5');
    expect(result.fxRateUsed).toBe('0.0175');
    expect(result.fxRateTimestamp).toBeInstanceOf(Date);
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

describe('FxService provider fallback', () => {
  it('falls through to Frankfurter when ExchangeRate-API cannot price the pair', async () => {
    const { service } = buildService();
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((input: unknown) => {
      const url = String(input);
      if (url.includes('open.er-api.com')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ result: 'success', rates: { USD: 1 } }) } as unknown as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ date: '2026-06-02', rates: { ZAR: 18.5 } }) } as unknown as Response);
    });

    const rate = await service.getRate('USD', 'ZAR');
    expect(rate.rate).toBe('18.5');
    expect(rate.source).toBe('frankfurter');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('throws Unprocessable when no provider can price the pair', async () => {
    const { service } = buildService();
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ result: 'success', rates: { USD: 1 } }) } as unknown as Response);
    await expect(service.getRate('USD', 'XAF')).rejects.toThrow('No FX rate available for USD -> XAF');
  });

  it('throws ServiceUnavailable when every provider is down', async () => {
    const { service } = buildService();
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: false, status: 503, json: async () => ({}) } as unknown as Response);
    await expect(service.getRate('USD', 'EUR')).rejects.toThrow('FX rate provider is unreachable');
  });
});
