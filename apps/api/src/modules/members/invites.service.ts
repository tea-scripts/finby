import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import type { AuthResult } from '../auth/auth.types';
import type { AcceptSignupInput } from './dto/members.schemas';

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

type InviteState = 'valid' | 'expired' | 'revoked' | 'accepted';

export interface InvitePreview {
  workspaceName: string;
  email: string;
  role: string;
  state: InviteState;
}

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  private async loadByToken(rawToken: string) {
    const invite = await this.prisma.workspaceInvite.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { workspace: { select: { name: true, maxMembers: true } } },
    });
    if (!invite) throw new NotFoundException('Invitation not found.');
    return invite;
  }

  private stateOf(invite: { status: string; expiresAt: Date }): InviteState {
    if (invite.status === 'REVOKED') return 'revoked';
    if (invite.status === 'ACCEPTED') return 'accepted';
    if (invite.expiresAt.getTime() < Date.now()) return 'expired';
    return 'valid';
  }

  async preview(rawToken: string): Promise<InvitePreview> {
    const invite = await this.loadByToken(rawToken);
    return {
      workspaceName: invite.workspace.name,
      email: invite.email,
      role: invite.role,
      state: this.stateOf(invite),
    };
  }

  /** Existing, authenticated user accepts. Their email must match the invite. */
  async accept(rawToken: string, currentUserId: string): Promise<{ workspaceId: string }> {
    const invite = await this.loadByToken(rawToken);
    if (this.stateOf(invite) === 'expired') throw new GoneException('This invitation has expired.');
    if (invite.status !== 'PENDING') throw new ConflictException('This invitation is no longer valid.');

    const user = await this.prisma.user.findUnique({
      where: { id: currentUserId },
      select: { id: true, email: true },
    });
    if (!user) throw new NotFoundException('User not found.');
    if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw new ForbiddenException('This invitation was sent to a different email address.');
    }

    const existing = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId: invite.workspaceId, userId: user.id },
      select: { id: true },
    });
    if (existing) {
      // Idempotent: already a member — just close the invite.
      await this.prisma.workspaceInvite.update({ where: { id: invite.id }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
      return { workspaceId: invite.workspaceId };
    }

    await this.assertSeatAvailable(invite.workspaceId, invite.workspace.maxMembers);

    await this.prisma.$transaction(async (tx) => {
      await tx.workspaceMember.create({
        data: { workspaceId: invite.workspaceId, userId: user.id, role: invite.role, acceptedAt: new Date() },
      });
      await tx.workspaceInvite.update({ where: { id: invite.id }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
    });
    return { workspaceId: invite.workspaceId };
  }

  /** New user signs up via the invite. Email is taken from the invite, not the body. */
  async acceptSignup(rawToken: string, input: AcceptSignupInput): Promise<AuthResult> {
    const invite = await this.loadByToken(rawToken);
    if (this.stateOf(invite) === 'expired') throw new GoneException('This invitation has expired.');
    if (invite.status !== 'PENDING') throw new ConflictException('This invitation is no longer valid.');

    const existing = await this.prisma.user.findUnique({ where: { email: invite.email }, select: { id: true } });
    if (existing) {
      throw new ConflictException('An account with this email already exists — log in and accept the invitation.');
    }
    await this.assertSeatAvailable(invite.workspaceId, invite.workspace.maxMembers);

    const auth = await this.auth.provisionInvitedUser({
      email: invite.email,
      displayName: input.displayName,
      password: input.password,
      baseCurrency: input.baseCurrency,
      timezone: input.timezone,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.workspaceMember.create({
        data: { workspaceId: invite.workspaceId, userId: auth.user.id, role: invite.role, acceptedAt: new Date() },
      });
      await tx.workspaceInvite.update({ where: { id: invite.id }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
    });
    return auth;
  }

  private async assertSeatAvailable(workspaceId: string, maxMembers: number): Promise<void> {
    const memberCount = await this.prisma.workspaceMember.count({ where: { workspaceId } });
    if (memberCount >= maxMembers) {
      throw new ConflictException('This family workspace is full.');
    }
  }
}
