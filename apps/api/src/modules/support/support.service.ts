import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupportTicket } from '@prisma/client';
import type { Env } from '../../config/env.schema';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import type { CreateSupportTicketInput } from './dto/support.schemas';
import type { AdminSupportTicketView, SupportStatus, SupportTicketView } from './support.types';

type TicketWithUser = SupportTicket & { user: { email: string; displayName: string } };

function toView(t: SupportTicket): SupportTicketView {
  return {
    id: t.id,
    category: t.category,
    subject: t.subject,
    message: t.message,
    status: t.status,
    resolvedAt: t.resolvedAt ? t.resolvedAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
  };
}

function toAdminView(t: TicketWithUser): AdminSupportTicketView {
  return { ...toView(t), user: { email: t.user.email, displayName: t.user.displayName } };
}

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async create(
    userId: string,
    submitterEmail: string,
    input: CreateSupportTicketInput,
  ): Promise<SupportTicketView> {
    const ticket = await this.prisma.supportTicket.create({
      data: {
        userId,
        category: input.category,
        subject: input.subject,
        message: input.message,
      },
    });
    await this.notify(ticket, submitterEmail);
    return toView(ticket);
  }

  async listForUser(userId: string): Promise<SupportTicketView[]> {
    const tickets = await this.prisma.supportTicket.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return tickets.map(toView);
  }

  /** Admin: list all tickets (optionally filtered by status), newest first. */
  async listAll(status?: SupportStatus): Promise<AdminSupportTicketView[]> {
    const tickets = await this.prisma.supportTicket.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true, displayName: true } } },
    });
    return (tickets as TicketWithUser[]).map(toAdminView);
  }

  /** Admin: change a ticket's status. Transitioning into RESOLVED stamps
   *  resolvedAt and emails the submitter once; moving out of RESOLVED clears it. */
  async updateStatus(id: string, status: SupportStatus): Promise<AdminSupportTicketView> {
    const existing = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: { user: { select: { email: true, displayName: true } } },
    });
    if (!existing) {
      throw new NotFoundException('Support ticket not found.');
    }

    const becomingResolved = status === 'RESOLVED' && existing.status !== 'RESOLVED';
    const resolvedAt =
      status === 'RESOLVED' ? (existing.resolvedAt ?? new Date()) : null;

    const updated = (await this.prisma.supportTicket.update({
      where: { id },
      data: { status, resolvedAt },
      include: { user: { select: { email: true, displayName: true } } },
    })) as TicketWithUser;

    if (becomingResolved) {
      try {
        await this.email.sendSupportTicketResolved(existing.user.email, existing.subject);
      } catch (err) {
        this.logger.error(
          `Failed to send support ticket resolved email: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return toAdminView(updated);
  }

  /** Notify the support inbox + acknowledge the user. Never throws — a mail
   *  failure must not fail the user's submission (it's already persisted). */
  private async notify(ticket: SupportTicket, submitterEmail: string): Promise<void> {
    const to = this.config.get('SUPPORT_NOTIFY_TO', { infer: true });
    try {
      await this.email.sendSupportTicketReceived(
        to,
        submitterEmail,
        ticket.category,
        ticket.subject,
        ticket.message,
        ticket.createdAt.toUTCString(),
      );
    } catch (err) {
      this.logger.error(
        `Failed to send support ticket notification: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    try {
      await this.email.sendSupportTicketAck(submitterEmail, ticket.subject);
    } catch (err) {
      this.logger.error(
        `Failed to send support ticket acknowledgement: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
