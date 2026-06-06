import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.schema';
import { ResendProvider } from './resend.provider';

const sendMock = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: (...a: unknown[]) => sendMock(...a) } })),
}));

function provider(env: Record<string, string | undefined>): ResendProvider {
  const config = { get: (k: string) => env[k] } as unknown as ConfigService<Env, true>;
  return new ResendProvider(config);
}

describe('ResendProvider', () => {
  beforeEach(() => sendMock.mockReset());

  it('no-ops (no send) when RESEND_API_KEY is unset', async () => {
    await provider({ EMAIL_FROM: 'Finby <noreply@finby.app>' }).send({
      to: 'a@b.com', subject: 'Hi', html: '<p>x</p>',
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('sends via Resend with from/to/subject/html when configured', async () => {
    sendMock.mockResolvedValue({ data: { id: 'e1' }, error: null });
    await provider({ RESEND_API_KEY: 're_x', EMAIL_FROM: 'Finby <noreply@finby.app>' }).send({
      to: 'a@b.com', subject: 'Hi', html: '<p>x</p>',
    });
    expect(sendMock).toHaveBeenCalledWith({
      from: 'Finby <noreply@finby.app>', to: 'a@b.com', subject: 'Hi', html: '<p>x</p>',
    });
  });
});
