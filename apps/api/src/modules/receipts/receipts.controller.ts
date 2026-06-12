import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Workspace } from '../../common/decorators/workspace.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { WorkspaceMemberGuard } from '../../common/guards/workspace-member.guard';
import type { WorkspaceContext } from '../../common/context';
import type { AuthUser } from '../auth/auth.types';
import { ReceiptsService } from './receipts.service';
import type { ReceiptExtraction } from './dto/receipt.dto';

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024; // 5MB — multer maps overruns to 413
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

@Controller('workspaces/:workspaceId/receipts')
@UseGuards(WorkspaceMemberGuard)
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Post('extract')
  @Roles('OWNER', 'CO_MANAGER')
  @UseGuards(RolesGuard)
  // Receipt images are processed in memory only and never persisted to disk
  // or object storage. This is intentional — receipts contain sensitive
  // financial data.
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_RECEIPT_BYTES },
      fileFilter: (_req, file, cb) => {
        if (ACCEPTED_IMAGE_TYPES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only image files are accepted'), false);
        }
      },
    }),
  )
  extract(
    @Workspace() workspace: WorkspaceContext,
    @CurrentUser() user: AuthUser,
    @UploadedFile() image?: Express.Multer.File,
  ): Promise<ReceiptExtraction> {
    if (!image) {
      throw new BadRequestException('No receipt image attached — send an "image" file field.');
    }
    return this.receipts.extractFromImage(workspace, user.userId, image);
  }
}
