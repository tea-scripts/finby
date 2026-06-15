// Dark, on-brand transactional email templates (match the Finby app + marketing
// look: navy canvas #06101f, faint blue grid, accent #1d6ef5). The grid is a
// progressive enhancement via background-image gradients — clients that strip it
// (e.g. Outlook) fall back to the solid dark background-color, so it always reads
// as the dark brand.
const SHELL = (
  body: string,
  // Defaults to the user-facing footer; internal notifications override the first line.
  footerNote = "You're receiving this because you have a Finby account.",
): string => `<!doctype html>
<html>
<body style="margin:0;padding:0;background-color:#06101f;">
<div style="background-color:#06101f;background-image:linear-gradient(rgba(29,110,245,0.07) 1px,transparent 1px),linear-gradient(90deg,rgba(29,110,245,0.07) 1px,transparent 1px);background-size:44px 44px;padding:40px 20px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:460px;margin:0 auto;">
    <div style="font-size:24px;font-weight:700;color:#1d6ef5;margin-bottom:22px;">Finby</div>
    <div style="background-color:#0b1626;border:1px solid #1c2c46;border-radius:16px;padding:30px;">${body}</div>
    <p style="color:#5b6f8c;font-size:12px;line-height:1.5;margin:22px 0 0;">${footerNote}</p>
    <p style="color:#3f536e;font-size:12px;margin:6px 0 0;">Stop tracking. Start talking.</p>
  </div>
</div>
</body>
</html>`;

const button = (href: string, label: string): string =>
  `<a href="${href}" style="display:inline-block;background-color:#1d6ef5;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">${label}</a>`;

/** Escape user-supplied text so a name with &, <, or > can't break the email HTML. */
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function verificationEmail(name: string, verifyUrl: string): { subject: string; html: string } {
  return {
    subject: 'Verify your email for Finby',
    html: SHELL(`<h1 style="font-size:20px;margin:0 0 12px;color:#e8eef7;">Hey ${esc(name)} 👋</h1>
      <p style="margin:0 0 22px;line-height:1.5;color:#8da3c0;">Confirm your email address to secure your Finby account.</p>
      ${button(verifyUrl, 'Verify email')}
      <p style="color:#5b6f8c;font-size:13px;line-height:1.5;margin:22px 0 0;">This link expires in 24 hours. If you didn't sign up, you can safely ignore this email.</p>`),
  };
}

export function welcomeEmail(name: string): { subject: string; html: string } {
  return {
    subject: 'Welcome to Finby 🎉',
    html: SHELL(`<h1 style="font-size:20px;margin:0 0 12px;color:#e8eef7;">You're all set, ${esc(name)}!</h1>
      <p style="margin:0 0 10px;line-height:1.5;color:#8da3c0;">Your email is verified. Just tell Finby what you spent or earned — no forms, no spreadsheets.</p>
      <p style="margin:14px 0 0;line-height:1.5;color:#8da3c0;">Try: <em style="color:#e8eef7;">"spent 12 on lunch"</em>.</p>`),
  };
}

export function renewalReminderEmail(
  name: string,
  daysLeft: number,
  endDateLabel: string,
  manageUrl: string,
  reason: 'CANCELING' | 'PAST_DUE',
): { subject: string; html: string } {
  const plural = daysLeft === 1 ? 'day' : 'days';
  const lead =
    reason === 'PAST_DUE'
      ? `We couldn't process your latest Finby payment, so your plan is set to lapse in <strong style="color:#e8eef7;">${daysLeft} ${plural}</strong> (on ${esc(endDateLabel)}).`
      : `Your Finby plan ends in <strong style="color:#e8eef7;">${daysLeft} ${plural}</strong> (on ${esc(endDateLabel)}) and is not set to renew.`;
  const cta = reason === 'PAST_DUE' ? 'Update payment' : 'Keep my plan';
  return {
    subject:
      reason === 'PAST_DUE'
        ? `Action needed: your Finby plan lapses in ${daysLeft} ${plural}`
        : `Your Finby plan ends in ${daysLeft} ${plural}`,
    html: SHELL(`<h1 style="font-size:20px;margin:0 0 12px;color:#e8eef7;">Hey ${esc(name)} 👋</h1>
      <p style="margin:0 0 14px;line-height:1.5;color:#8da3c0;">${lead}</p>
      <p style="margin:0 0 22px;line-height:1.5;color:#8da3c0;">When it lapses you'll move to the free plan — your data stays safe, but Pro features (extra currencies, full history, portfolio, AI coaching) pause.</p>
      ${button(manageUrl, cta)}
      <p style="color:#5b6f8c;font-size:13px;line-height:1.5;margin:22px 0 0;">Already sorted? You can ignore this — nothing else is needed.</p>`),
  };
}

export function reengagementEmail(name: string, openUrl: string): { subject: string; html: string } {
  return {
    subject: 'Pick up where you left off 👋',
    html: SHELL(
      `<h1 style="font-size:20px;margin:0 0 12px;color:#e8eef7;">Hey ${esc(name)} 👋</h1>
      <p style="margin:0 0 10px;line-height:1.5;color:#8da3c0;">Your Finby has been quiet lately. Whenever you're ready, just say what you spent — <em style="color:#e8eef7;">"spent 12 on lunch"</em> — and you're caught up.</p>
      <p style="margin:0 0 22px;line-height:1.5;color:#8da3c0;">New since you've been away: snap a photo of a receipt and Finby logs it for you. No typing.</p>
      ${button(openUrl, 'Open Finby')}
      <p style="color:#5b6f8c;font-size:13px;line-height:1.5;margin:22px 0 0;">Your data is exactly where you left it.</p>`,
      "You're receiving this because reminders are on for your Finby account — you can turn them off any time in Settings.",
    ),
  };
}

export function passwordResetEmail(resetUrl: string): { subject: string; html: string } {
  return {
    subject: 'Reset your Finby password',
    html: SHELL(`<h1 style="font-size:20px;margin:0 0 12px;color:#e8eef7;">Reset your password</h1>
      <p style="margin:0 0 22px;line-height:1.5;color:#8da3c0;">Tap below to choose a new password.</p>
      ${button(resetUrl, 'Reset password')}
      <p style="color:#5b6f8c;font-size:13px;line-height:1.5;margin:22px 0 0;">This link expires in 1 hour. If you didn't request this, ignore this email — your password is unchanged.</p>`),
  };
}

export function feedbackNotificationEmail(
  submitterEmail: string,
  rating: number,
  comment: string | null,
  submittedAtLabel: string,
): { subject: string; html: string } {
  const filled = Math.max(0, Math.min(5, rating));
  const stars = '★'.repeat(filled) + '☆'.repeat(5 - filled);
  const commentBlock = comment
    ? `<div style="background-color:#06101f;border:1px solid #1c2c46;border-radius:10px;padding:14px 16px;margin:0 0 18px;color:#e8eef7;line-height:1.5;font-style:italic;">"${esc(comment)}"</div>`
    : `<p style="margin:0 0 18px;line-height:1.5;color:#5b6f8c;font-style:italic;">No comment left.</p>`;
  return {
    subject: `New ${rating}★ Finby review${comment ? '' : ' (no comment)'}`,
    html: SHELL(
      `<h1 style="font-size:20px;margin:0 0 12px;color:#e8eef7;">New review submitted</h1>
      <p style="margin:0 0 16px;font-size:22px;letter-spacing:4px;color:#1d6ef5;">${stars}</p>
      ${commentBlock}
      <p style="margin:0;line-height:1.6;color:#8da3c0;font-size:13px;">From <strong style="color:#e8eef7;">${esc(submitterEmail)}</strong><br/>${esc(submittedAtLabel)}</p>`,
      'Internal notification — a user submitted a review in Finby.',
    ),
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  BUG: 'Bug',
  BILLING: 'Billing',
  ACCOUNT: 'Account',
  FEATURE_REQUEST: 'Feature request',
  OTHER: 'Other',
};

export function supportTicketReceivedEmail(
  submitterEmail: string,
  category: string,
  subject: string,
  message: string,
  submittedAtLabel: string,
): { subject: string; html: string } {
  const label = CATEGORY_LABELS[category] ?? category;
  return {
    subject: `New support ticket: ${subject}`,
    html: SHELL(
      `<h1 style="font-size:20px;margin:0 0 12px;color:#e8eef7;">New support ticket</h1>
      <p style="margin:0 0 6px;color:#8da3c0;font-size:13px;">Category: <strong style="color:#e8eef7;">${esc(label)}</strong></p>
      <p style="margin:0 0 14px;color:#e8eef7;font-size:16px;font-weight:600;">${esc(subject)}</p>
      <div style="background-color:#06101f;border:1px solid #1c2c46;border-radius:10px;padding:14px 16px;margin:0 0 18px;color:#e8eef7;line-height:1.5;white-space:pre-wrap;">${esc(message)}</div>
      <p style="margin:0;line-height:1.6;color:#8da3c0;font-size:13px;">From <strong style="color:#e8eef7;">${esc(submitterEmail)}</strong><br/>${esc(submittedAtLabel)}</p>`,
      'Internal notification — a user submitted a support ticket in Finby.',
    ),
  };
}

export function supportTicketAckEmail(subject: string): { subject: string; html: string } {
  return {
    subject: `We got your message: ${subject}`,
    html: SHELL(`<h1 style="font-size:20px;margin:0 0 12px;color:#e8eef7;">Thanks — we're on it</h1>
      <p style="margin:0 0 14px;line-height:1.5;color:#8da3c0;">We received your support request:</p>
      <p style="margin:0 0 18px;color:#e8eef7;font-size:16px;font-weight:600;">${esc(subject)}</p>
      <p style="margin:0;line-height:1.5;color:#8da3c0;">Our team will get back to you by email as soon as we can. You can track this request under Settings → Support.</p>`),
  };
}

export function supportTicketResolvedEmail(subject: string): { subject: string; html: string } {
  return {
    subject: `Resolved: ${subject}`,
    html: SHELL(`<h1 style="font-size:20px;margin:0 0 12px;color:#e8eef7;">Your support ticket is resolved</h1>
      <p style="margin:0 0 14px;line-height:1.5;color:#8da3c0;">We've marked this request as resolved:</p>
      <p style="margin:0 0 18px;color:#e8eef7;font-size:16px;font-weight:600;">${esc(subject)}</p>
      <p style="margin:0;line-height:1.5;color:#8da3c0;">If it's not fully sorted, just reply to this email and we'll reopen it.</p>`),
  };
}

export function memberInviteEmail(
  inviterName: string,
  workspaceName: string,
  acceptUrl: string,
): { subject: string; html: string } {
  return {
    subject: `You're invited to a Finby family workspace`,
    html: SHELL(`<h1 style="font-size:20px;margin:0 0 12px;color:#e8eef7;">Join ${esc(workspaceName)}</h1>
      <p style="margin:0 0 22px;line-height:1.5;color:#8da3c0;">${esc(inviterName)} invited you to share their Finby family workspace. Accept to see and help manage your shared finances.</p>
      ${button(acceptUrl, 'Accept invitation')}
      <p style="color:#5b6f8c;font-size:13px;line-height:1.5;margin:22px 0 0;">This invitation expires in 7 days. If you weren't expecting it, you can ignore this email.</p>`),
  };
}

export function earlyReminderEmail(
  name: string,
  streak: number,
  openUrl: string,
): { subject: string; html: string } {
  const hasStreak = streak >= 1;
  const lead = hasStreak
    ? `You're on a <strong style="color:#e8eef7;">${streak}-day</strong> streak 🔥 — log one thing today to keep it alive.`
    : `Build the habit in seconds: tell Finby one thing you spent today and start your streak 🔥.`;
  return {
    subject: hasStreak ? 'Keep your Finby streak going 🔥' : 'Start your Finby streak 🔥',
    html: SHELL(
      `<h1 style="font-size:20px;margin:0 0 12px;color:#e8eef7;">Hey ${esc(name)} 👋</h1>
      <p style="margin:0 0 10px;line-height:1.5;color:#8da3c0;">${lead}</p>
      <p style="margin:0 0 22px;line-height:1.5;color:#8da3c0;">Just say <em style="color:#e8eef7;">"spent 12 on lunch"</em>.</p>
      ${button(openUrl, 'Open Finby')}`,
      "You're receiving this because reminders are on for your Finby account — you can turn them off any time in Settings.",
    ),
  };
}
