import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type { Env } from '../../../config/env.schema';
import type { EmailMessage, EmailProvider } from '../email.provider';

@Injectable()
export class ResendProvider implements EmailProvider {
  private readonly logger = new Logger(ResendProvider.name);
  private readonly from: string;
  private readonly client: Resend | null;

  constructor(config: ConfigService<Env, true>) {
    const apiKey = config.get('RESEND_API_KEY', { infer: true });
    this.from = config.get('EMAIL_FROM', { infer: true });
    this.client = apiKey ? new Resend(apiKey) : null;
    if (!this.client) {
      this.logger.warn('RESEND_API_KEY unset — emails will be skipped.');
    }
  }

  async send(message: EmailMessage): Promise<void> {
    if (!this.client) {
      // Local dev (no RESEND_API_KEY): surface the CTA link so flows that depend
      // on an emailed link (invite accept, email verify, password reset) are
      // testable without a real mail provider. Never runs when a key is set.
      const link = message.html.match(/href="([^"]+)"/)?.[1];
      this.logger.log(
        `[email skipped] to=${message.to} subject="${message.subject}"${link ? ` link=${link}` : ''}`,
      );
      return;
    }
    const { error } = await this.client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
    });
    if (error) {
      this.logger.error(`Resend send failed: ${JSON.stringify(error)}`);
      throw new Error('Email send failed');
    }
  }
}
