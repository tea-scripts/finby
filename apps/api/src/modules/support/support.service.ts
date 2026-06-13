import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupportTicket } from '@prisma/client';
import type { Env } from '../../config/env.schema';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import type { CreateSupportTicketInput } from './dto/support.schemas';
import type { SupportTicketView } from './support.types';

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
