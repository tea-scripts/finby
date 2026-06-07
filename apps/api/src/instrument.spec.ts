import * as Sentry from '@sentry/nestjs';
import { initSentry } from './instrument';

jest.mock('@sentry/nestjs', () => ({ init: jest.fn() }));

describe('initSentry', () => {
  const OLD = process.env;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD };
  });
  afterAll(() => {
    process.env = OLD;
  });

  it('does nothing when SENTRY_DSN is unset', () => {
    delete process.env.SENTRY_DSN;
    expect(initSentry()).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('initialises with PII off and a beforeSend hook when DSN is set', () => {
    process.env.SENTRY_DSN = 'https://k@o1.ingest.sentry.io/1';
    process.env.SENTRY_TRACES_SAMPLE_RATE = '0.25';
    expect(initSentry()).toBe(true);
    expect(Sentry.init).toHaveBeenCalledTimes(1);
    const opts = (Sentry.init as jest.Mock).mock.calls[0][0];
    expect(opts.sendDefaultPii).toBe(false);
    expect(opts.tracesSampleRate).toBe(0.25);
    expect(typeof opts.beforeSend).toBe('function');
  });
});
