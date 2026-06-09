import {
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
import type { CreateInviteInput } from './dto/members.schemas';

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
