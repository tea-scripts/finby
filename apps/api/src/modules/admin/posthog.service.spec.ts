import { PosthogService } from './posthog.service';

function makeService(env: Record<string, unknown> = {}, redisHit: string | null = null) {
  const config = { get: (k: string) => env[k] };
  const redis = {
    client: {
      get: jest.fn().mockResolvedValue(redisHit),
      set: jest.fn().mockResolvedValue('OK'),
    },
  };
  const svc = new PosthogService(config as never, redis as never);
  return { svc, redis };
}

const CONFIGURED = {
  POSTHOG_API_KEY: 'phx_test',
  POSTHOG_PROJECT_ID: '123',
  POSTHOG_API_HOST: 'https://us.posthog.com',
};

describe('PosthogService.isConfigured', () => {
  it('is false when key or project id is missing', () => {
    expect(makeService({}).svc.isConfigured()).toBe(false);
    expect(makeService({ POSTHOG_API_KEY: 'phx_test' }).svc.isConfigured()).toBe(false);
    expect(makeService({ POSTHOG_PROJECT_ID: '123' }).svc.isConfigured()).toBe(false);
  });
  it('is true when both are set', () => {
    expect(makeService(CONFIGURED).svc.isConfigured()).toBe(true);
  });
});

describe('PosthogService.funnel', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns configured:false without querying when env is unset', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const { svc } = makeService({});
    const res = await svc.funnel('activation', 30);
    expect(res.configured).toBe(false);
    expect(res.steps).toEqual([]);
    expect(res.label).toBe('Activation');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps PostHog step counts to from-start / from-prev conversion %', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { order: 0, count: 100, name: 'signed_up' },
          { order: 1, count: 60, name: 'onboarding_completed' },
          { order: 2, count: 30, name: 'transaction_logged' },
          { order: 3, count: 15, name: 'chat_message_sent' },
        ],
      }),
    } as never);

    const { svc, redis } = makeService(CONFIGURED);
    const res = await svc.funnel('activation', 30);

    expect(res.configured).toBe(true);
    expect(res.steps.map((s) => s.count)).toEqual([100, 60, 30, 15]);
    expect(res.steps[0]).toMatchObject({ conversionFromStart: 100, conversionFromPrev: 100 });
    expect(res.steps[1]).toMatchObject({ conversionFromStart: 60, conversionFromPrev: 60 });
    expect(res.steps[2]).toMatchObject({ conversionFromStart: 30, conversionFromPrev: 50 });
    expect(res.steps[3]).toMatchObject({ conversionFromStart: 15, conversionFromPrev: 50 });
    // result is cached
    expect(redis.client.set).toHaveBeenCalled();
  });

  it('serves a cached result without calling PostHog', async () => {
    const cached = JSON.stringify({ key: 'activation', label: 'Activation', windowDays: 30, steps: [], configured: true });
    const fetchSpy = jest.spyOn(global, 'fetch');
    const { svc } = makeService(CONFIGURED, cached);
    const res = await svc.funnel('activation', 30);
    expect(res.configured).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws when PostHog responds with an error status', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'forbidden',
    } as never);
    const { svc } = makeService(CONFIGURED);
    await expect(svc.funnel('monetization', 30)).rejects.toThrow(/403/);
  });
});
