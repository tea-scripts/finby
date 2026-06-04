import { Controller, Get, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { RequireTier } from '../../common/decorators/require-tier.decorator';
import { Workspace } from '../../common/decorators/workspace.decorator';
import { TierGuard } from '../../common/guards/tier.guard';
import { WorkspaceMemberGuard } from '../../common/guards/workspace-member.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { WorkspaceContext } from '../../common/context';
import { ExportService } from './export.service';
import { exportQuerySchema, type ExportQuery } from './dto/export.schemas';

@Controller('workspaces/:workspaceId/export')
@UseGuards(WorkspaceMemberGuard, TierGuard)
@RequireTier('PRO')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get()
  async export(
    @Workspace() workspace: WorkspaceContext,
    @Query(new ZodValidationPipe(exportQuerySchema)) query: ExportQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string | Record<string, unknown> | StreamableFile> {
    if (query.format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="finby-export.json"');
      return this.exportService.exportJson(workspace.id);
    }
    if (query.format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="finby-statement.pdf"');
      return new StreamableFile(await this.exportService.exportPdf(workspace.id));
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="finby-transactions.csv"');
    return this.exportService.exportTransactionsCsv(workspace.id);
  }
}
