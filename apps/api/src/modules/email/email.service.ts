import { Inject, Injectable } from '@nestjs/common';
import { EMAIL_PROVIDER } from './email.constants';
import type { EmailProvider } from './email.provider';
import { passwordResetEmail, verificationEmail, welcomeEmail } from './email.templates';

@Injectable()
export class EmailService {
  constructor(@Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider) {}

  async sendVerification(to: string, name: string, verifyUrl: string): Promise<void> {
    const { subject, html } = verificationEmail(name, verifyUrl);
    await this.provider.send({ to, subject, html });
  }

  async sendWelcome(to: string, name: string): Promise<void> {
    const { subject, html } = welcomeEmail(name);
    await this.provider.send({ to, subject, html });
  }

  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    const { subject, html } = passwordResetEmail(resetUrl);
    await this.provider.send({ to, subject, html });
  }
}
