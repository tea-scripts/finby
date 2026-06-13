import {
  BadRequestException,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Workspace } from '../../common/decorators/workspace.decorator';
import { WorkspaceMemberGuard } from '../../common/guards/workspace-member.guard';
import type { WorkspaceContext } from '../../common/context';
import { VoiceService } from './voice.service';
import type { TranscribeResponseDto } from './dto/transcribe-response.dto';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10MB — multer maps overruns to 413

@Controller('workspaces/:workspaceId/voice')
@UseGuards(WorkspaceMemberGuard)
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  @Post('transcribe')
  @HttpCode(200)
  // Audio is processed in memory only and never persisted — it carries the
  // user's spoken financial activity.
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_AUDIO_BYTES },
    }),
  )
  async transcribe(
    @Workspace() workspace: WorkspaceContext,
    @UploadedFile() audio?: Express.Multer.File,
  ): Promise<TranscribeResponseDto> {
    if (!audio) {
      throw new BadRequestException('No audio attached — send an "audio" file field.');
    }

    const result = await this.voice.transcribe(workspace, {
      buffer: audio.buffer,
      mimetype: audio.mimetype,
    });
    return { text: result.text };
  }
}
