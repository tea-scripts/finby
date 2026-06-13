import { FrankfurterProvider } from './frankfurter.provider';

function mockFetch(body: unknown, ok = true) {
  return jest
    .spyOn(global, 'fetch')
    .mockResolvedValue({ ok, json: async () => body } as unknown as Response);
}

afterEach(() => jest.restoreAllMocks());

describe('FrankfurterProvider', () => {
  const provider = new FrankfurterProvider('https://api.frankfurter.dev/v1');

  it('returns the rate for a supported pair', async () => {
    mockFetch({ date: '2026-06-12', rates: { EUR: 0.864386 } });
    const rate = await provider.getRate('USD', 'EUR');
    expect(rate).toEqual({ rate: '0.864386', date: '2026-06-12' });
  });

  it('uses the date path for historical requests', async () => {
    const spy = mockFetch({ date: '2020-01-02', rates: { EUR: 0.9 } });
    await provider.getRate('USD', 'EUR', '2020-01-02');
    expect(spy).toHaveBeenCalledWith('https://api.frankfurter.dev/v1/2020-01-02?from=USD&to=EUR');
  });

  it('returns null when the pair is unsupported (e.g. NGN)', async () => {
    mockFetch({ date: '2026-06-12', rates: {} });
    expect(await provider.getRate('USD', 'NGN')).toBeNull();
  });

  it('returns null on a non-OK response', async () => {
    mockFetch({}, false);
    expect(await provider.getRate('USD', 'EUR')).toBeNull();
  });
});
