import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { Env } from '../../config/env.schema';
import { EmailService } from '../email/email.service';
import type { CreateInviteInput, ChangeRoleInput } from './dto/members.schemas';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface InviteView {
  id: string;
  email: string;
  role: string;
  invitedByUserId: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface MemberView {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  role: string;
  joinedAt: Date;
  isSelf: boolean;
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async inviteMember(
    workspaceId: string,
    inviter: { userId: string; name: string },
    input: CreateInviteInput,
  ): Promise<InviteView> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true, tier: true, maxMembers: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found.');
    if (workspace.tier !== 'FAMILY') {
      throw new ForbiddenException({ error: 'tier_limit', message: 'Inviting members requires the Family plan.' });
    }

    const [memberCount, pendingCount] = await Promise.all([
      this.prisma.workspaceMember.count({ where: { workspaceId } }),
      this.prisma.workspaceInvite.count({ where: { workspaceId, status: 'PENDING' } }),
    ]);
    if (memberCount + pendingCount >= workspace.maxMembers) {
      throw new ConflictException(`Your plan allows up to ${workspace.maxMembers} members.`);
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (existingUser) {
      const member = await this.prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: existingUser.id },
        select: { id: true },
      });
      if (member) throw new ConflictException('That person is already a member of this workspace.');
    }

    const pending = await this.prisma.workspaceInvite.findFirst({
      where: { workspaceId, email: input.email, status: 'PENDING' },
      select: { id: true },
    });
    if (pending) throw new ConflictException('There is already a pending invite for that email.');

    // Clear any stale (REVOKED/ACCEPTED) invite row for this email so the
    // @@unique([workspaceId, email]) constraint doesn't collide on re-invite.
    await this.prisma.workspaceInvite.deleteMany({
      where: { workspaceId, email: input.email, status: { not: 'PENDING' } },
    });

    const rawToken = randomBytes(32).toString('hex');
    const invite = await this.prisma.workspaceInvite.create({
      data: {
        workspaceId,
        email: input.email,
        role: input.role,
        tokenHash: hashToken(rawToken),
        status: 'PENDING',
        invitedByUserId: inviter.userId,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });

    const acceptUrl = `${this.config.get('WEB_URL', { infer: true })}/invite/${rawToken}`;
    await this.email.sendMemberInvite(input.email, inviter.name, workspace.name, acceptUrl);

    return this.toInviteView(invite);
  }

  async listMembers(workspaceId: string, currentUserId: string): Promise<MemberView[]> {
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      orderBy: { joinedAt: 'asc' },
      select: {
        id: true,
        userId: true,
        role: true,
        joinedAt: true,
        user: { select: { displayName: true, email: true } },
      },
    });
    return members.map((m) => ({
      id: m.id,
      userId: m.userId,
      displayName: m.user.displayName,
      email: m.user.email,
      role: m.role,
      joinedAt: m.joinedAt,
      isSelf: m.userId === currentUserId,
    }));
  }

  async listInvites(workspaceId: string): Promise<InviteView[]> {
    const invites = await this.prisma.workspaceInvite.findMany({
      where: { workspaceId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    return invites.map((i) => this.toInviteView(i));
  }

  async changeRole(workspaceId: string, memberId: string, input: ChangeRoleInput): Promise<MemberView> {
    const member = await this.prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId },
      select: { id: true, role: true, userId: true },
    });
    if (!member) throw new NotFoundException('Member not found.');
    if (member.role === 'OWNER') throw new BadRequestException("The owner's role cannot be changed.");
    await this.prisma.workspaceMember.update({ where: { id: memberId }, data: { role: input.role } });
    return this.requireMemberView(workspaceId, memberId, member.userId);
  }

  async removeMember(workspaceId: string, memberId: string): Promise<void> {
    const member = await this.prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId },
      select: { id: true, role: true },
    });
    if (!member) throw new NotFoundException('Member not found.');
    if (member.role === 'OWNER') {
      throw new BadRequestException('The owner cannot be removed. Cancel the Family subscription instead.');
    }
    await this.prisma.workspaceMember.delete({ where: { id: memberId } });
  }

  async leave(workspaceId: string, currentUserId: string): Promise<void> {
    const member = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId, userId: currentUserId },
      select: { id: true, role: true },
    });
    if (!member) throw new NotFoundException('You are not a member of this workspace.');
    if (member.role === 'OWNER') {
      throw new BadRequestException('The owner cannot leave. Cancel the Family subscription instead.');
    }
    await this.prisma.workspaceMember.delete({ where: { id: member.id } });
  }

  private async requireMemberView(workspaceId: string, memberId: string, currentUserId: string): Promise<MemberView> {
    const found = (await this.listMembers(workspaceId, currentUserId)).find((m) => m.id === memberId);
    if (!found) throw new NotFoundException('Member not found.');
    return found;
  }

  private toInviteView(i: {
    id: string;
    email: string;
    role: string;
    invitedByUserId: string;
    expiresAt: Date;
    createdAt: Date;
  }): InviteView {
    return {
      id: i.id,
      email: i.email,
      role: i.role,
      invitedByUserId: i.invitedByUserId,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
    };
  }
}
