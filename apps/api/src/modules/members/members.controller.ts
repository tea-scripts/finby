import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Workspace } from '../../common/decorators/workspace.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { WorkspaceMemberGuard } from '../../common/guards/workspace-member.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../auth/auth.types';
import type { WorkspaceContext } from '../../common/context';
import { MembersService, type InviteView, type MemberView } from './members.service';
import {
  changeRoleSchema, createInviteSchema, type ChangeRoleInput, type CreateInviteInput,
} from './dto/members.schemas';

@Controller('workspaces/:workspaceId')
@UseGuards(WorkspaceMemberGuard)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get('members')
  listMembers(@Workspace() ws: WorkspaceContext, @CurrentUser() user: AuthUser): Promise<MemberView[]> {
    return this.members.listMembers(ws.id, user.userId);
  }

  @Get('invites')
  @Roles('OWNER')
  @UseGuards(RolesGuard)
  listInvites(@Workspace() ws: WorkspaceContext): Promise<InviteView[]> {
    return this.members.listInvites(ws.id);
  }

  @Post('invites')
  @Roles('OWNER')
  @UseGuards(RolesGuard)
  invite(
    @Workspace() ws: WorkspaceContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createInviteSchema)) body: CreateInviteInput,
  ): Promise<InviteView> {
    return this.members.inviteMember(ws.id, { userId: user.userId, name: user.email }, body);
  }

  @Delete('invites/:inviteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('OWNER')
  @UseGuards(RolesGuard)
  cancelInvite(@Workspace() ws: WorkspaceContext, @Param('inviteId') inviteId: string): Promise<void> {
    return this.members.cancelInvite(ws.id, inviteId);
  }

  @Post('invites/:inviteId/resend')
  @Roles('OWNER')
  @UseGuards(RolesGuard)
  resendInvite(
    @Workspace() ws: WorkspaceContext,
    @CurrentUser() user: AuthUser,
    @Param('inviteId') inviteId: string,
  ): Promise<InviteView> {
    return this.members.resendInvite(ws.id, inviteId, user.email);
  }

  @Patch('members/:memberId')
  @Roles('OWNER')
  @UseGuards(RolesGuard)
  changeRole(
    @Workspace() ws: WorkspaceContext,
    @Param('memberId') memberId: string,
    @Body(new ZodValidationPipe(changeRoleSchema)) body: ChangeRoleInput,
  ): Promise<MemberView> {
    return this.members.changeRole(ws.id, memberId, body);
  }

  @Delete('members/me')
  @HttpCode(HttpStatus.NO_CONTENT)
  leave(@Workspace() ws: WorkspaceContext, @CurrentUser() user: AuthUser): Promise<void> {
    return this.members.leave(ws.id, user.userId);
  }

  @Delete('members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('OWNER')
  @UseGuards(RolesGuard)
  removeMember(@Workspace() ws: WorkspaceContext, @Param('memberId') memberId: string): Promise<void> {
    return this.members.removeMember(ws.id, memberId);
  }
}
