import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireWithinLimit } from '../../common/decorators/tier-limit.decorator';
import { Workspace } from '../../common/decorators/workspace.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TierLimitGuard } from '../../common/guards/tier-limit.guard';
import { WorkspaceMemberGuard } from '../../common/guards/workspace-member.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { WorkspaceContext } from '../../common/context';
import { CategoriesService } from './categories.service';
import {
  createCategorySchema,
  updateCategorySchema,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from './dto/categories.schemas';
import type { CategoryView } from './categories.types';

@Controller('workspaces/:workspaceId/categories')
@UseGuards(WorkspaceMemberGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  async list(@Workspace() workspace: WorkspaceContext): Promise<{ categories: CategoryView[] }> {
    return { categories: await this.categories.list(workspace.id) };
  }

  @Post()
  @Roles('OWNER', 'CO_MANAGER')
  @RequireWithinLimit('customCategories')
  @UseGuards(RolesGuard, TierLimitGuard)
  create(
    @Workspace() workspace: WorkspaceContext,
    @Body(new ZodValidationPipe(createCategorySchema)) body: CreateCategoryInput,
  ): Promise<CategoryView> {
    return this.categories.create(workspace.id, body);
  }

  @Patch(':categoryId')
  @Roles('OWNER', 'CO_MANAGER')
  @UseGuards(RolesGuard)
  update(
    @Workspace() workspace: WorkspaceContext,
    @Param('categoryId') categoryId: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) body: UpdateCategoryInput,
  ): Promise<CategoryView> {
    return this.categories.update(workspace.id, categoryId, body);
  }
}
