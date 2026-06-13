import { Module } from '@nestjs/common';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';

/** Voice input (STT): transcription only. The transcript is returned to the
 *  client for confirmation and then flows through the existing chat pipeline. */
@Module({
  controllers: [VoiceController],
  providers: [VoiceService],
})
export class VoiceModule {}
