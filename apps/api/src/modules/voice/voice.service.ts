import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TIER_LIMITS } from '@finby/shared';
import type { WorkspaceContext } from '../../common/context';
import type { TranscriptionResult, UploadedAudio } from './voice.types';

const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';
const WHISPER_MODEL = 'whisper-1';

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Tier-gate (PRO+) then transcribe an audio clip to text. FREE workspaces are
   * rejected before any upstream call. Audio is processed in memory only and
   * never persisted — it contains the user's spoken financial activity.
   */
  async transcribe(
    workspace: WorkspaceContext,
    audio: UploadedAudio,
  ): Promise<TranscriptionResult> {
    this.assertTierAllowed(workspace);
    return this.callWhisper(audio);
  }

  private assertTierAllowed(workspace: WorkspaceContext): void {
    if (!TIER_LIMITS[workspace.tier].voiceInput) {
      throw new ForbiddenException({
        error: 'TIER_LIMIT',
        message: 'Voice input is available on Pro and above',
        details: { upgradeRequired: true },
      });
    }
  }

  /**
   * The swappable speech-to-text provider (Phase 1: OpenAI Whisper). Phase 2/3
   * replace the body here without touching the controller or tier gate.
   */
  private async callWhisper(audio: UploadedAudio): Promise<TranscriptionResult> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.error('OPENAI_API_KEY is not configured — cannot transcribe');
      throw new ServiceUnavailableException('Voice transcription is not configured');
    }

    const start = Date.now();

    // Native FormData/Blob (Node 18+) — fetch sets the multipart Content-Type
    // and boundary automatically, so we must NOT set it by hand.
    const form = new FormData();
    form.append('file', new Blob([audio.buffer], { type: audio.mimetype }), 'audio.webm');
    form.append('model', WHISPER_MODEL);
    form.append('language', 'en');

    const response = await fetch(WHISPER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      this.logger.error(`Whisper API error [${response.status}]: ${errText}`);
      throw new InternalServerErrorException('Transcription failed');
    }

    const data = (await response.json()) as { text?: string };
    return {
      text: (data.text ?? '').trim(),
      durationMs: Date.now() - start,
    };
  }
}
