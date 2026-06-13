import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { SubscriptionTier } from '@finby/shared';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';
import { WorkspaceMemberGuard } from '../../common/guards/workspace-member.guard';
import type { AuthenticatedRequest } from '../../common/context';

/** Stands in for JWT auth + membership resolution: attaches a workspace at `tier`. */
function guardForTier(tier: SubscriptionTier): CanActivate {
  return {
    canActivate(context: ExecutionContext): boolean {
      const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
      req.user = { userId: 'user-1', email: 'u@example.com' };
      req.workspace = { id: 'ws-1', name: 'Test WS', slug: 'test-ws', tier, baseCurrency: 'USD' };
      req.membership = { id: 'member-1', role: 'OWNER' };
      return true;
    },
  };
}

async function bootstrap(
  tier: SubscriptionTier,
  transcribe: jest.Mock,
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [VoiceController],
    providers: [{ provide: VoiceService, useValue: { transcribe } }],
  })
    .overrideGuard(WorkspaceMemberGuard)
    .useValue(guardForTier(tier))
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('VoiceController', () => {
  let app: INestApplication;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('POST /workspaces/:id/voice/transcribe returns 200 with text for a PRO member', async () => {
    const transcribe = jest.fn().mockResolvedValue({ text: 'hello finby', durationMs: 120 });
    app = await bootstrap('PRO', transcribe);

    const res = await request(app.getHttpServer())
      .post('/workspaces/ws-1/voice/transcribe')
      .attach('audio', Buffer.from('fake-audio'), {
        filename: 'audio.webm',
        contentType: 'audio/webm',
      })
      .expect(200);

    expect(res.body).toEqual({ text: 'hello finby' });
    expect(transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ws-1', tier: 'PRO' }),
      expect.objectContaining({ mimetype: 'audio/webm' }),
    );
  });

  it('returns 400 when no audio file is attached', async () => {
    const transcribe = jest.fn();
    app = await bootstrap('PRO', transcribe);

    await request(app.getHttpServer()).post('/workspaces/ws-1/voice/transcribe').expect(400);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('returns 403 with an upgrade flag for an authenticated FREE-tier user', async () => {
    const transcribe = jest.fn().mockRejectedValue(
      new ForbiddenException({
        error: 'TIER_LIMIT',
        message: 'Voice input is available on Pro and above',
        details: { upgradeRequired: true },
      }),
    );
    app = await bootstrap('FREE', transcribe);

    const res = await request(app.getHttpServer())
      .post('/workspaces/ws-1/voice/transcribe')
      .attach('audio', Buffer.from('fake-audio'), {
        filename: 'audio.webm',
        contentType: 'audio/webm',
      })
      .expect(403);

    expect(res.body).toMatchObject({
      message: 'Voice input is available on Pro and above',
      details: { upgradeRequired: true },
    });
  });
});
