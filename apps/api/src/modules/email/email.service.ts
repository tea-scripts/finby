import { Inject, Injectable } from '@nestjs/common';
import { EMAIL_PROVIDER } from './email.constants';
import type { EmailProvider } from './email.provider';
import {
  feedbackNotificationEmail,
  memberInviteEmail,
  passwordResetEmail,
  reengagementEmail,
  renewalReminderEmail,
  verificationEmail,
  welcomeEmail,
} from './email.templates';

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

  async sendReengagement(to: string, name: string, openUrl: string): Promise<void> {
    const { subject, html } = reengagementEmail(name, openUrl);
    await this.provider.send({ to, subject, html });
  }

  async sendRenewalReminder(
    to: string,
    name: string,
    daysLeft: number,
    endDateLabel: string,
    manageUrl: string,
    reason: 'CANCELING' | 'PAST_DUE',
  ): Promise<void> {
    const { subject, html } = renewalReminderEmail(name, daysLeft, endDateLabel, manageUrl, reason);
    await this.provider.send({ to, subject, html });
  }

  async sendFeedbackNotification(
    to: string,
    submitterEmail: string,
    rating: number,
    comment: string | null,
    submittedAtLabel: string,
  ): Promise<void> {
    const { subject, html } = feedbackNotificationEmail(submitterEmail, rating, comment, submittedAtLabel);
    await this.provider.send({ to, subject, html });
  }

  async sendMemberInvite(
    to: string,
    inviterName: string,
    workspaceName: string,
    acceptUrl: string,
  ): Promise<void> {
    const { subject, html } = memberInviteEmail(inviterName, workspaceName, acceptUrl);
    await this.provider.send({ to, subject, html });
  }
}
