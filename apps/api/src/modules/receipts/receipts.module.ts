import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';

/** Receipt scanning: vision extraction only — logging goes through the
 *  existing transactions endpoint after the user confirms. */
@Module({
  imports: [LlmModule],
  controllers: [ReceiptsController],
  providers: [ReceiptsService],
})
export class ReceiptsModule {}
