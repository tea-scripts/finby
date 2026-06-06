const SHELL = (body: string): string => `<!doctype html><html><body style="margin:0;background:#f4f6fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0b1626">
<div style="max-width:480px;margin:0 auto;padding:32px 24px">
  <div style="font-size:22px;font-weight:700;color:#1d6ef5;margin-bottom:20px">Finby</div>
  <div style="background:#fff;border-radius:16px;padding:28px;box-shadow:0 1px 3px rgba(11,22,38,.08)">${body}</div>
  <p style="color:#8da3c0;font-size:12px;margin-top:20px">You're receiving this because you have a Finby account.</p>
</div></body></html>`;

const button = (href: string, label: string): string =>
  `<a href="${href}" style="display:inline-block;background:#1d6ef5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">${label}</a>`;

/** Escape user-supplied text so a name with &, <, or > can't break the email HTML. */
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function verificationEmail(name: string, verifyUrl: string): { subject: string; html: string } {
  return {
    subject: 'Verify your email for Finby',
    html: SHELL(`<h1 style="font-size:20px;margin:0 0 12px">Hey ${esc(name)} 👋</h1>
      <p style="margin:0 0 20px;line-height:1.5">Confirm your email address to secure your Finby account.</p>
      ${button(verifyUrl, 'Verify email')}
      <p style="color:#8da3c0;font-size:13px;margin-top:20px">This link expires in 24 hours. If you didn't sign up, ignore this email.</p>`),
  };
}

export function welcomeEmail(name: string): { subject: string; html: string } {
  return {
    subject: 'Welcome to Finby 🎉',
    html: SHELL(`<h1 style="font-size:20px;margin:0 0 12px">You're all set, ${esc(name)}!</h1>
      <p style="margin:0 0 8px;line-height:1.5">Your email is verified. Just tell Finby what you spent or earned — no forms, no spreadsheets.</p>
      <p style="margin:16px 0 0;line-height:1.5">Try: <em>"spent 12 on lunch"</em>.</p>`),
  };
}

export function passwordResetEmail(resetUrl: string): { subject: string; html: string } {
  return {
    subject: 'Reset your Finby password',
    html: SHELL(`<h1 style="font-size:20px;margin:0 0 12px">Reset your password</h1>
      <p style="margin:0 0 20px;line-height:1.5">Tap below to choose a new password.</p>
      ${button(resetUrl, 'Reset password')}
      <p style="color:#8da3c0;font-size:13px;margin-top:20px">This link expires in 1 hour. If you didn't request this, ignore this email — your password is unchanged.</p>`),
  };
}
