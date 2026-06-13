import {
  ForbiddenException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { SubscriptionTier } from '@finby/shared';
import { VoiceService } from './voice.service';
import type { WorkspaceContext } from '../../common/context';

function workspace(tier: SubscriptionTier = 'PRO'): WorkspaceContext {
  return { id: 'ws-1', name: 'Test WS', slug: 'test-ws', tier, baseCurrency: 'USD' };
}

const AUDIO = { buffer: Buffer.from('fake-audio-bytes'), mimetype: 'audio/webm' };

/** ConfigService double whose `get` returns the given OPENAI_API_KEY value. */
function configWith(key: string | undefined): ConfigService {
  return { get: jest.fn().mockReturnValue(key) } as unknown as ConfigService;
}

describe('VoiceService', () => {
  let fetchSpy: jest.SpyInstance;

  afterEach(() => {
    fetchSpy?.mockRestore();
    jest.clearAllMocks();
  });

  function mockWhisperOk(text: string): void {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ text }),
    } as Response);
  }

  it('returns the transcribed text from Whisper for a PRO workspace', async () => {
    mockWhisperOk('Add Maya wallet with 3000 pesos');
    const service = new VoiceService(configWith('test-openai-key'));

    const result = await service.transcribe(workspace(), AUDIO);

    expect(result.text).toBe('Add Maya wallet with 3000 pesos');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('calls Whisper with a Bearer OPENAI_API_KEY via POST', async () => {
    mockWhisperOk('hi');
    const service = new VoiceService(configWith('test-openai-key'));

    await service.transcribe(workspace(), AUDIO);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-openai-key');
  });

  it('trims surrounding whitespace from the transcript', async () => {
    mockWhisperOk('  spent 12 on lunch  ');
    const service = new VoiceService(configWith('k'));

    const result = await service.transcribe(workspace(), AUDIO);

    expect(result.text).toBe('spent 12 on lunch');
  });

  it('rejects FREE tier with 403 + an upgrade flag, without calling Whisper', async () => {
    fetchSpy = jest.spyOn(global, 'fetch');
    const service = new VoiceService(configWith('k'));

    const err = (await service
      .transcribe(workspace('FREE'), AUDIO)
      .catch((e: unknown) => e)) as ForbiddenException;

    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getResponse()).toMatchObject({
      error: 'TIER_LIMIT',
      message: 'Voice input is available on Pro and above',
      details: { upgradeRequired: true },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('allows PRO, PREMIUM and FAMILY tiers', async () => {
    mockWhisperOk('ok');
    const service = new VoiceService(configWith('k'));

    await expect(service.transcribe(workspace('PRO'), AUDIO)).resolves.toBeDefined();
    await expect(service.transcribe(workspace('PREMIUM'), AUDIO)).resolves.toBeDefined();
    await expect(service.transcribe(workspace('FAMILY'), AUDIO)).resolves.toBeDefined();
  });

  it('throws 503 when OPENAI_API_KEY is not configured', async () => {
    fetchSpy = jest.spyOn(global, 'fetch');
    const service = new VoiceService(configWith(undefined));

    await expect(service.transcribe(workspace(), AUDIO)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws 500 when Whisper returns a non-200 response', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'upstream error',
    } as Response);
    const service = new VoiceService(configWith('k'));

    await expect(service.transcribe(workspace(), AUDIO)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
