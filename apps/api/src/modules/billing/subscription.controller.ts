import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Workspace } from '../../common/decorators/workspace.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { WorkspaceMemberGuard } from '../../common/guards/workspace-member.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { WorkspaceContext } from '../../common/context';
import type { AuthUser } from '../auth/auth.types';
import { SubscriptionService } from './subscription.service';
import { checkoutSchema, type CheckoutInput } from './dto/billing.schemas';
import type { CheckoutResult, SubscriptionView } from './billing.types';

@Controller('workspaces/:workspaceId/subscription')
@UseGuards(WorkspaceMemberGuard)
export class SubscriptionController {
  constructor(private readonly subscriptions: SubscriptionService) {}

  @Get()
  get(@Workspace() workspace: WorkspaceContext): Promise<SubscriptionView> {
    return this.subscriptions.getSubscription(workspace.id);
  }

  @Post('checkout')
  @Roles('OWNER')
  @UseGuards(RolesGuard)
  checkout(
    @Workspace() workspace: WorkspaceContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(checkoutSchema)) body: CheckoutInput,
  ): Promise<CheckoutResult> {
    return this.subscriptions.createCheckout(workspace.id, user.email, body.tier, body.provider);
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER')
  @UseGuards(RolesGuard)
  cancel(@Workspace() workspace: WorkspaceContext): Promise<SubscriptionView> {
    return this.subscriptions.setCancelAtPeriodEnd(workspace.id, true);
  }

  @Post('resume')
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER')
  @UseGuards(RolesGuard)
  resume(@Workspace() workspace: WorkspaceContext): Promise<SubscriptionView> {
    return this.subscriptions.setCancelAtPeriodEnd(workspace.id, false);
  }

  @Post('portal')
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER')
  @UseGuards(RolesGuard)
  portal(@Workspace() workspace: WorkspaceContext): Promise<{ url: string }> {
    return this.subscriptions.createPortalSession(workspace.id);
  }
}
