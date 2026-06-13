import { ExchangeRateApiProvider } from './exchange-rate-api.provider';

function mockFetch(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const ok = init.ok ?? true;
  const status = init.status ?? (ok ? 200 : 500);
  return jest
    .spyOn(global, 'fetch')
    .mockResolvedValue({ ok, status, json: async () => body } as unknown as Response);
}

afterEach(() => jest.restoreAllMocks());

describe('ExchangeRateApiProvider', () => {
  const provider = new ExchangeRateApiProvider('https://open.er-api.com');

  it('returns the rate for a supported pair (NGN)', async () => {
    mockFetch({
      result: 'success',
      time_last_update_utc: 'Sat, 13 Jun 2026 00:00:01 +0000',
      rates: { USD: 1, NGN: 1359.576041 },
    });
    const rate = await provider.getRate('USD', 'NGN');
    expect(rate).toEqual({ rate: '1359.576041', date: '2026-06-13' });
  });

  it('returns null when the target currency is missing', async () => {
    mockFetch({ result: 'success', rates: { USD: 1 } });
    expect(await provider.getRate('USD', 'XAF')).toBeNull();
  });

  it('returns null for a historical (past-date) request', async () => {
    const spy = mockFetch({ result: 'success', rates: { EUR: 0.9 } });
    expect(await provider.getRate('USD', 'EUR', '2020-01-01')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns null on a 404 (unsupported base currency)', async () => {
    mockFetch({}, { ok: false, status: 404 });
    expect(await provider.getRate('USD', 'NGN')).toBeNull();
  });

  it('throws on a transient (5xx) response', async () => {
    mockFetch({}, { ok: false, status: 503 });
    await expect(provider.getRate('USD', 'NGN')).rejects.toThrow('503');
  });

  it('propagates network errors (fetch rejects)', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    await expect(provider.getRate('USD', 'NGN')).rejects.toThrow('network down');
  });
});
