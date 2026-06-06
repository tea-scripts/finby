# Transactional Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send verification (on signup), welcome (after verify), and password-reset emails via Resend, behind a provider-agnostic port, with a soft-nag verification UX.

**Architecture:** New `EmailModule` in `apps/api` mirrors the existing `BillingProvider` pattern (DI-token port + `ResendProvider`, the sole SDK importer; no-op when unconfigured). `AuthService` gains verify/resend logic and email sends. `apps/web` gets a nag banner + four small pages. No schema migration (User verify/reset fields already exist).

**Tech Stack:** NestJS 10 + Prisma + Zod + Jest (api); Next.js 15 + Zustand + Vitest (web); Resend SDK.

---

## Conventions (every task)

- API commands from `apps/api`; web from `apps/web`. Repo root `/home/unicorn/Documents/finby`.
- API tests: `pnpm --filter finby-api exec jest`. Web typecheck: `pnpm --filter finby-web exec tsc --noEmit`.
- **Conventional commits, NO AI-attribution trailer.** Use the exact message per task.
- Inject the email provider/service as a **mock** in auth specs so the **114 existing API tests stay green**.

## File structure

| File | Responsibility |
|------|----------------|
| `apps/api/src/modules/email/email.constants.ts` | `EMAIL_PROVIDER` DI token |
| `apps/api/src/modules/email/email.provider.ts` | `EmailProvider` port + `EmailMessage` type |
| `apps/api/src/modules/email/providers/resend.provider.ts` | Resend impl; no-op when unconfigured |
| `apps/api/src/modules/email/providers/resend.provider.spec.ts` | provider tests |
| `apps/api/src/modules/email/email.templates.ts` | 3 HTML builders |
| `apps/api/src/modules/email/email.service.ts` | domain methods → templates → provider |
| `apps/api/src/modules/email/email.service.spec.ts` | service tests |
| `apps/api/src/modules/email/email.module.ts` | wires + exports `EmailService` |
| `apps/api/src/config/env.schema.ts` | + `RESEND_API_KEY`, `EMAIL_FROM` |
| `apps/api/src/modules/auth/*` | verify/resend logic, register+forgot email, routes, DTO |
| `apps/web/src/lib/auth-api.ts` | verify/forgot/reset client calls |
| `apps/web/src/lib/store.ts` | `markVerified` |
| `apps/web/src/components/app/verify-email-banner.tsx` | nag banner |
| `apps/web/src/app/(app)/layout.tsx` | mount banner |
| `apps/web/src/app/verify-email/page.tsx` | verify landing |
| `apps/web/src/app/forgot-password/page.tsx` | request reset |
| `apps/web/src/app/reset-password/page.tsx` | set new password |
| `apps/web/src/app/login/page.tsx` | "Forgot password?" link |

---

## PHASE 1 — Email infrastructure

### Task 1: Dependency + env vars

**Files:** `apps/api/package.json`, `apps/api/src/config/env.schema.ts`, `apps/api/.env.example`, `.env.example` (root).

- [ ] **Step 1: Add the Resend SDK**

Run from repo root: `pnpm --filter finby-api add resend`
Expected: `resend` appears in `apps/api/package.json` dependencies; lockfile updates.

- [ ] **Step 2: Add env vars to the schema**

In `apps/api/src/config/env.schema.ts`, inside the `z.object({...})`, after the VAPID block (around the `VAPID_SUBJECT` line), add:

```ts
  // Email (Resend)
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Finby <noreply@finby.app>'),
```

- [ ] **Step 3: Document in .env.example files**

Append to `apps/api/.env.example` and the root `.env.example`:

```
# ─── Email / Resend ───
# Unset ⇒ emails are skipped (logged). Verify the finby.app domain in Resend before go-live.
RESEND_API_KEY=
EMAIL_FROM=Finby <noreply@finby.app>
```

- [ ] **Step 4: Verify typecheck**

Run: `pnpm --filter finby-api exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
cd /home/unicorn/Documents/finby
git add apps/api/package.json pnpm-lock.yaml apps/api/src/config/env.schema.ts apps/api/.env.example .env.example
git commit -m "chore(api): add resend dep + email env vars"
```

---

### Task 2: EmailProvider port + ResendProvider (TDD)

**Files:** create `email.constants.ts`, `email.provider.ts`, `providers/resend.provider.ts`, `providers/resend.provider.spec.ts` under `apps/api/src/modules/email/`.

- [ ] **Step 1: Port + token**

Create `apps/api/src/modules/email/email.provider.ts`:

```ts
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

/** Provider-agnostic transactional email port. */
export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}
```

Create `apps/api/src/modules/email/email.constants.ts`:

```ts
/** DI token for the active EmailProvider implementation. */
export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');
```

- [ ] **Step 2: Write the failing provider test**

Create `apps/api/src/modules/email/providers/resend.provider.spec.ts`:

```ts
import { ConfigService } from '@nestjs/config';
import { ResendProvider } from './resend.provider';

const sendMock = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: (...a: unknown[]) => sendMock(...a) } })),
}));

function provider(env: Record<string, string | undefined>): ResendProvider {
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  return new ResendProvider(config);
}

describe('ResendProvider', () => {
  beforeEach(() => sendMock.mockReset());

  it('no-ops (no send) when RESEND_API_KEY is unset', async () => {
    await provider({ EMAIL_FROM: 'Finby <noreply@finby.app>' }).send({
      to: 'a@b.com', subject: 'Hi', html: '<p>x</p>',
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('sends via Resend with from/to/subject/html when configured', async () => {
    sendMock.mockResolvedValue({ data: { id: 'e1' }, error: null });
    await provider({ RESEND_API_KEY: 're_x', EMAIL_FROM: 'Finby <noreply@finby.app>' }).send({
      to: 'a@b.com', subject: 'Hi', html: '<p>x</p>',
    });
    expect(sendMock).toHaveBeenCalledWith({
      from: 'Finby <noreply@finby.app>', to: 'a@b.com', subject: 'Hi', html: '<p>x</p>',
    });
  });
});
```

- [ ] **Step 3: Run → fail**

Run: `pnpm --filter finby-api exec jest resend.provider`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement**

Create `apps/api/src/modules/email/providers/resend.provider.ts`:

```ts
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
      this.logger.log(`[email skipped] to=${message.to} subject="${message.subject}"`);
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
```

> Note: the spec passes a `config.get` that ignores the `{ infer: true }` arg — fine, the impl calls `config.get('KEY', { infer: true })` and the mock returns `env['KEY']`.

- [ ] **Step 5: Run → pass**

Run: `pnpm --filter finby-api exec jest resend.provider`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
cd /home/unicorn/Documents/finby
git add apps/api/src/modules/email/email.provider.ts apps/api/src/modules/email/email.constants.ts apps/api/src/modules/email/providers/resend.provider.ts apps/api/src/modules/email/providers/resend.provider.spec.ts
git commit -m "feat(api): EmailProvider port + Resend provider (no-op when unconfigured)"
```

---

### Task 3: Templates + EmailService + EmailModule (TDD)

**Files:** create `email.templates.ts`, `email.service.ts`, `email.service.spec.ts`, `email.module.ts`.

- [ ] **Step 1: Templates**

Create `apps/api/src/modules/email/email.templates.ts`:

```ts
const SHELL = (body: string): string => `<!doctype html><html><body style="margin:0;background:#f4f6fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0b1626">
<div style="max-width:480px;margin:0 auto;padding:32px 24px">
  <div style="font-size:22px;font-weight:700;color:#1d6ef5;margin-bottom:20px">Finby</div>
  <div style="background:#fff;border-radius:16px;padding:28px;box-shadow:0 1px 3px rgba(11,22,38,.08)">${body}</div>
  <p style="color:#8da3c0;font-size:12px;margin-top:20px">You're receiving this because you have a Finby account.</p>
</div></body></html>`;

const button = (href: string, label: string): string =>
  `<a href="${href}" style="display:inline-block;background:#1d6ef5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">${label}</a>`;

export function verificationEmail(name: string, verifyUrl: string): { subject: string; html: string } {
  return {
    subject: 'Verify your email for Finby',
    html: SHELL(`<h1 style="font-size:20px;margin:0 0 12px">Hey ${name} 👋</h1>
      <p style="margin:0 0 20px;line-height:1.5">Confirm your email address to secure your Finby account.</p>
      ${button(verifyUrl, 'Verify email')}
      <p style="color:#8da3c0;font-size:13px;margin-top:20px">This link expires in 24 hours. If you didn't sign up, ignore this email.</p>`),
  };
}

export function welcomeEmail(name: string): { subject: string; html: string } {
  return {
    subject: 'Welcome to Finby 🎉',
    html: SHELL(`<h1 style="font-size:20px;margin:0 0 12px">You're all set, ${name}!</h1>
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
```

- [ ] **Step 2: Write the failing service test**

Create `apps/api/src/modules/email/email.service.spec.ts`:

```ts
import { EmailService } from './email.service';
import type { EmailProvider } from './email.provider';

describe('EmailService', () => {
  const send = jest.fn().mockResolvedValue(undefined);
  const provider: EmailProvider = { send };
  const service = new EmailService(provider);
  beforeEach(() => send.mockClear());

  it('sendVerification → verify subject + url in html', async () => {
    await service.sendVerification('a@b.com', 'Tea', 'https://chat.finby.app/verify-email?token=abc');
    const msg = send.mock.calls[0][0];
    expect(msg.to).toBe('a@b.com');
    expect(msg.subject).toMatch(/verify/i);
    expect(msg.html).toContain('https://chat.finby.app/verify-email?token=abc');
    expect(msg.html).toContain('Tea');
  });

  it('sendWelcome → welcome subject', async () => {
    await service.sendWelcome('a@b.com', 'Tea');
    expect(send.mock.calls[0][0].subject).toMatch(/welcome/i);
  });

  it('sendPasswordReset → reset url in html', async () => {
    await service.sendPasswordReset('a@b.com', 'https://chat.finby.app/reset-password?token=xyz');
    expect(send.mock.calls[0][0].html).toContain('token=xyz');
  });
});
```

- [ ] **Step 3: Run → fail**

Run: `pnpm --filter finby-api exec jest email.service`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement service + module**

Create `apps/api/src/modules/email/email.service.ts`:

```ts
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
```

Create `apps/api/src/modules/email/email.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { EMAIL_PROVIDER } from './email.constants';
import { EmailService } from './email.service';
import { ResendProvider } from './providers/resend.provider';

@Module({
  providers: [EmailService, { provide: EMAIL_PROVIDER, useClass: ResendProvider }],
  exports: [EmailService],
})
export class EmailModule {}
```

- [ ] **Step 5: Run → pass**

Run: `pnpm --filter finby-api exec jest email`
Expected: PASS (5 tests across provider + service).

- [ ] **Step 6: Commit**

```bash
cd /home/unicorn/Documents/finby
git add apps/api/src/modules/email/email.templates.ts apps/api/src/modules/email/email.service.ts apps/api/src/modules/email/email.service.spec.ts apps/api/src/modules/email/email.module.ts
git commit -m "feat(api): EmailService + templates (verification, welcome, reset)"
```

---

## PHASE 2 — Verification backend + welcome

### Task 4: Wire EmailModule into auth + DTO

**Files:** `apps/api/src/modules/auth/auth.module.ts`, `apps/api/src/modules/auth/dto/auth.schemas.ts`.

- [ ] **Step 1: Import EmailModule**

In `apps/api/src/modules/auth/auth.module.ts`, add `EmailModule` to the module `imports` array and the import line:

```ts
import { EmailModule } from '../email/email.module';
```
(add `EmailModule` to `imports: [...]`).

- [ ] **Step 2: Add the verify-email schema**

In `apps/api/src/modules/auth/dto/auth.schemas.ts`, append:

```ts
export const verifyEmailSchema = z.object({ token: z.string().min(1) });
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter finby-api exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
cd /home/unicorn/Documents/finby
git add apps/api/src/modules/auth/auth.module.ts apps/api/src/modules/auth/dto/auth.schemas.ts
git commit -m "feat(api): wire EmailModule into auth + verify-email DTO"
```

---

### Task 5: Inject EmailService + verification token helper + register hook (TDD)

**Files:** `apps/api/src/modules/auth/auth.service.ts`, `apps/api/src/modules/auth/auth.service.spec.ts`.

- [ ] **Step 1: Extend the spec — register sends verification, mail failure is non-fatal**

In `apps/api/src/modules/auth/auth.service.spec.ts`, add an `EmailService` mock to the existing `AuthService` construction (find where `new AuthService(...)` is built and add the mock as the new last constructor arg). Define near the top:

```ts
const emailMock = {
  sendVerification: jest.fn().mockResolvedValue(undefined),
  sendWelcome: jest.fn().mockResolvedValue(undefined),
  sendPasswordReset: jest.fn().mockResolvedValue(undefined),
};
```

Pass `emailMock as unknown as EmailService` as the final arg wherever `new AuthService(prisma, jwt, config)` is constructed, and `import { EmailService } from '../email/email.service';`. In the existing register test, after a successful register assert:

```ts
expect(emailMock.sendVerification).toHaveBeenCalledTimes(1);
```

Add a new test:

```ts
it('register still succeeds if the verification email throws', async () => {
  emailMock.sendVerification.mockRejectedValueOnce(new Error('smtp down'));
  await expect(service.register(validRegisterInput)).resolves.toHaveProperty('accessToken');
});
```

(Use the same `validRegisterInput`/prisma-mock shape the existing register test uses.)

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter finby-api exec jest auth.service`
Expected: FAIL (constructor arity / sendVerification not called).

- [ ] **Step 3: Implement — inject + token helper + register hook**

In `apps/api/src/modules/auth/auth.service.ts`:

(a) import: `import { EmailService } from '../email/email.service';`

(b) add to the constructor params (after `config`):

```ts
    private readonly email: EmailService,
```

(c) add a private helper (near `rounds()`):

```ts
  /** Generates a verification token, persists its hash (24h expiry), returns the
   *  raw token + the verify URL to email. */
  private async issueVerification(userId: string): Promise<string> {
    const raw = randomBytes(32).toString('hex');
    const emailVerifyToken = createHash('sha256').update(raw).digest('hex');
    const emailVerifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.prisma.user.update({ where: { id: userId }, data: { emailVerifyToken, emailVerifyExpiry } });
    return `${this.config.get('WEB_URL', { infer: true })}/verify-email?token=${raw}`;
  }
```

(d) in `register()`, just before `return { user, workspace, ...tokens };`, add:

```ts
    try {
      const verifyUrl = await this.issueVerification(user.id);
      await this.email.sendVerification(user.email, user.displayName, verifyUrl);
    } catch (err) {
      this.logger.warn(`Verification email failed for ${user.email}: ${String(err)}`);
    }
```

If `AuthService` has no `logger`, add at class top: `private readonly logger = new Logger(AuthService.name);` and import `Logger` from `@nestjs/common`.

- [ ] **Step 4: Run → pass**

Run: `pnpm --filter finby-api exec jest auth.service`
Expected: PASS (existing + 1 new test).

- [ ] **Step 5: Commit**

```bash
cd /home/unicorn/Documents/finby
git add apps/api/src/modules/auth/auth.service.ts apps/api/src/modules/auth/auth.service.spec.ts
git commit -m "feat(api): send verification email on register (non-blocking)"
```

---

### Task 6: verifyEmail + resendVerification (TDD)

**Files:** `apps/api/src/modules/auth/auth.service.ts`, `auth.service.spec.ts`.

- [ ] **Step 1: Failing tests**

Add to `auth.service.spec.ts`:

```ts
describe('verifyEmail', () => {
  it('marks verified, clears token, sends welcome on a valid token', async () => {
    const hash = createHash('sha256').update('raw1').digest('hex'); // import createHash in the spec
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u1', email: 'a@b.com', displayName: 'Tea', emailVerifyExpiry: new Date(Date.now() + 1000),
    });
    prismaMock.user.update.mockResolvedValueOnce({});
    await service.verifyEmail('raw1');
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { emailVerifyToken: hash } });
    expect(prismaMock.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ emailVerified: true, emailVerifyToken: null, emailVerifyExpiry: null }),
    }));
    expect(emailMock.sendWelcome).toHaveBeenCalledWith('a@b.com', 'Tea');
  });

  it('throws on expired token', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u1', email: 'a@b.com', displayName: 'Tea', emailVerifyExpiry: new Date(Date.now() - 1000),
    });
    await expect(service.verifyEmail('raw1')).rejects.toThrow();
  });

  it('throws on unknown token', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.verifyEmail('nope')).rejects.toThrow();
  });
});
```

(Match `prismaMock` to the spec's existing prisma mock variable name.)

- [ ] **Step 2: Run → fail**, then **Step 3: implement**:

Add to `auth.service.ts`:

```ts
  async verifyEmail(token: string): Promise<void> {
    const emailVerifyToken = createHash('sha256').update(token).digest('hex');
    const user = await this.prisma.user.findUnique({ where: { emailVerifyToken } });
    if (!user || !user.emailVerifyExpiry || user.emailVerifyExpiry.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid or expired verification link.');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifyToken: null, emailVerifyExpiry: null },
    });
    try {
      await this.email.sendWelcome(user.email, user.displayName);
    } catch (err) {
      this.logger.warn(`Welcome email failed for ${user.email}: ${String(err)}`);
    }
  }

  async resendVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.emailVerified) return;
    try {
      const verifyUrl = await this.issueVerification(user.id);
      await this.email.sendVerification(user.email, user.displayName, verifyUrl);
    } catch (err) {
      this.logger.warn(`Resend verification failed for ${user.email}: ${String(err)}`);
    }
  }
```

- [ ] **Step 4: Run → pass** (`pnpm --filter finby-api exec jest auth.service`).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/auth/auth.service.ts apps/api/src/modules/auth/auth.service.spec.ts
git commit -m "feat(api): verifyEmail + resendVerification (welcome on verify)"
```

---

### Task 7: Controller routes

**Files:** `apps/api/src/modules/auth/auth.controller.ts`.

- [ ] **Step 1: Add routes**

Add imports (`verifyEmailSchema`, `VerifyEmailInput` to the existing schemas import; `AuthUser` to the types import; `UseGuards` already imported). Add inside the controller:

```ts
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  async verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailSchema)) body: VerifyEmailInput,
  ): Promise<{ message: string }> {
    await this.auth.verifyEmail(body.token);
    return { message: 'Email verified.' };
  }

  @HttpCode(HttpStatus.OK)
  @Post('resend-verification')
  async resendVerification(@Req() req: Request & { user: AuthUser }): Promise<{ message: string }> {
    await this.auth.resendVerification(req.user.userId);
    return { message: 'Verification email sent.' };
  }
```

(`resend-verification` has NO `@Public()` → the global JWT guard protects it; `req.user` is the `AuthUser` from `JwtStrategy`.) Import `AuthUser` from `./auth.types`.

- [ ] **Step 2: Typecheck + full API suite**

Run: `pnpm --filter finby-api exec tsc --noEmit` (exit 0) then `pnpm --filter finby-api exec jest` (all pass, ≥114 + new).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/auth/auth.controller.ts
git commit -m "feat(api): verify-email (public) + resend-verification (authed) routes"
```

---

## PHASE 3 — Verification frontend

### Task 8: auth-api client + store markVerified

**Files:** create `apps/web/src/lib/auth-api.ts`; modify `apps/web/src/lib/store.ts`.

- [ ] **Step 1: Client**

Create `apps/web/src/lib/auth-api.ts`:

```ts
import { apiFetch } from './api-client';
import { useAuth } from './store';

export function verifyEmail(token: string): Promise<{ message: string }> {
  return apiFetch('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) });
}
export function forgotPassword(email: string): Promise<{ message: string }> {
  return apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
}
export function resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
  return apiFetch('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword }) });
}
export function resendVerification(): Promise<{ message: string }> {
  return useAuth.getState().authed('/auth/resend-verification', { method: 'POST' });
}
```

- [ ] **Step 2: Store action**

In `apps/web/src/lib/store.ts`: add `markVerified: () => void;` to the `AuthState` interface, and in the store body:

```ts
      markVerified: () => {
        const u = get().user;
        if (u) set({ user: { ...u, emailVerified: true } });
      },
```

(Ensure the store factory exposes `get` — `persist((set, get) => ({...}))`; it already uses `set`. Add `get` to the signature if missing.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter finby-web exec tsc --noEmit` (exit 0).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/auth-api.ts apps/web/src/lib/store.ts
git commit -m "feat(web): auth-api client (verify/forgot/reset) + markVerified"
```

---

### Task 9: verify-email page

**Files:** create `apps/web/src/app/verify-email/page.tsx`.

- [ ] **Step 1: Implement**

```tsx
'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { AuthShell } from '@/components/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { verifyEmail } from '@/lib/auth-api';
import { useAuth } from '@/lib/store';

function VerifyInner() {
  const token = useSearchParams().get('token');
  const markVerified = useAuth((s) => s.markVerified);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) return setState('error');
    verifyEmail(token).then(() => { markVerified(); setState('ok'); }).catch(() => setState('error'));
  }, [token, markVerified]);

  return (
    <AuthShell
      title={state === 'ok' ? 'Email verified 🎉' : state === 'error' ? 'Link invalid' : 'Verifying…'}
      subtitle={
        state === 'ok' ? 'Your email is confirmed.'
          : state === 'error' ? 'This verification link is invalid or has expired.'
          : 'One moment while we confirm your email.'
      }
      footer={null}
    >
      {state === 'ok' && <Link href="/chat"><Button className="w-full">Go to Finby</Button></Link>}
      {state === 'error' && <Link href="/chat"><Button className="w-full">Back to Finby</Button></Link>}
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyInner />
    </Suspense>
  );
}
```

(Confirm `AuthShell`'s `footer` accepts `null` — its type is `ReactNode`, so `null` is valid. Confirm `Button` accepts `className`.)

- [ ] **Step 2: Typecheck** (`pnpm --filter finby-web exec tsc --noEmit`, exit 0).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/verify-email/page.tsx
git commit -m "feat(web): email verification landing page"
```

---

### Task 10: Nag banner + mount

**Files:** create `apps/web/src/components/app/verify-email-banner.tsx`; modify `apps/web/src/app/(app)/layout.tsx`.

- [ ] **Step 1: Banner**

```tsx
'use client';

import { useState } from 'react';
import { resendVerification } from '@/lib/auth-api';
import { useAuth } from '@/lib/store';

/** Soft-nag bar shown to logged-in users whose email isn't verified.
 *  Dismissible for the session; never blocks anything. */
export function VerifyEmailBanner() {
  const user = useAuth((s) => s.user);
  const [dismissed, setDismissed] = useState(false);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  if (!user || user.emailVerified || dismissed) return null;

  async function resend() {
    setSending(true);
    try {
      await resendVerification();
      setSent(true);
    } catch {
      /* ignore — keep the banner */
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex items-center gap-3 border-b border-warn/30 bg-warn/10 px-4 py-2 text-xs text-warn">
      <p className="flex-1">
        {sent ? 'Verification email sent — check your inbox.' : 'Verify your email to secure your account.'}
      </p>
      {!sent && (
        <button onClick={resend} disabled={sending} className="shrink-0 font-semibold underline disabled:opacity-50">
          {sending ? 'Sending…' : 'Resend'}
        </button>
      )}
      <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="shrink-0 text-warn/70 hover:text-warn">✕</button>
    </div>
  );
}
```

- [ ] **Step 2: Mount** — in `apps/web/src/app/(app)/layout.tsx`, import and render it directly under `<AppHeader />` (top of the content column):

```tsx
import { VerifyEmailBanner } from '@/components/app/verify-email-banner';
```
```tsx
      <div className="flex min-h-0 flex-1 flex-col">
        <AppHeader />
        <VerifyEmailBanner />
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
```

- [ ] **Step 3: Typecheck** (exit 0).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/app/verify-email-banner.tsx "apps/web/src/app/(app)/layout.tsx"
git commit -m "feat(web): soft-nag email verification banner"
```

---

## PHASE 4 — Password reset

### Task 11: forgotPassword email wire (TDD)

**Files:** `apps/api/src/modules/auth/auth.service.ts`, `auth.service.spec.ts`.

- [ ] **Step 1: Failing test**

```ts
describe('forgotPassword email', () => {
  it('sends a reset email for an existing user', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u1', email: 'a@b.com' });
    prismaMock.user.update.mockResolvedValueOnce({});
    await service.forgotPassword('a@b.com');
    expect(emailMock.sendPasswordReset).toHaveBeenCalledWith('a@b.com', expect.stringContaining('/reset-password?token='));
  });
  it('does not send for an unknown email', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    await service.forgotPassword('nope@b.com');
    expect(emailMock.sendPasswordReset).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run → fail. Step 3: implement** — in `forgotPassword()`, replace the `// TODO(Phase 2)...` comment with:

```ts
    const resetUrl = `${this.config.get('WEB_URL', { infer: true })}/reset-password?token=${rawToken}`;
    try {
      await this.email.sendPasswordReset(user.email, resetUrl);
    } catch (err) {
      this.logger.warn(`Reset email failed for ${user.email}: ${String(err)}`);
    }
```

(`rawToken` is already in scope in that method.)

- [ ] **Step 4: Run → pass** (`pnpm --filter finby-api exec jest auth.service`).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/auth/auth.service.ts apps/api/src/modules/auth/auth.service.spec.ts
git commit -m "feat(api): send password-reset email (completes forgot-password flow)"
```

---

### Task 12: Reset frontend pages + login link

**Files:** create `forgot-password/page.tsx`, `reset-password/page.tsx`; modify `login/page.tsx`.

- [ ] **Step 1: forgot-password page** — `apps/web/src/app/forgot-password/page.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { AuthShell } from '@/components/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { forgotPassword } from '@/lib/auth-api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try { await forgotPassword(email); } catch { /* generic response below */ }
    setSent(true);
    setLoading(false);
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email you a link to choose a new one."
      footer={<Link href="/login" className="font-medium text-accent hover:text-accent-hover">Back to sign in</Link>}
    >
      {sent ? (
        <p className="text-sm text-muted">If an account exists for <span className="text-ink">{email}</span>, a reset link is on its way.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email" htmlFor="fp-email">
            <Input id="fp-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" loading={loading} className="w-full">Send reset link</Button>
        </form>
      )}
    </AuthShell>
  );
}
```

- [ ] **Step 2: reset-password page** — `apps/web/src/app/reset-password/page.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { AuthShell } from '@/components/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/password-input';
import { resetPassword } from '@/lib/auth-api';

function ResetInner() {
  const token = useSearchParams().get('token') ?? '';
  const [pw, setPw] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try { await resetPassword(token, pw); setDone(true); }
    catch { setError('This reset link is invalid or has expired.'); }
    finally { setLoading(false); }
  }

  return (
    <AuthShell
      title={done ? 'Password updated' : 'Choose a new password'}
      subtitle={done ? 'You can now sign in with your new password.' : 'Enter a new password for your account.'}
      footer={<Link href="/login" className="font-medium text-accent hover:text-accent-hover">Back to sign in</Link>}
    >
      {done ? (
        <Link href="/login"><Button className="w-full">Sign in</Button></Link>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="New password" htmlFor="rp-pw" error={error ?? undefined}>
            <PasswordInput id="rp-pw" autoComplete="new-password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
          <Button type="submit" loading={loading} disabled={!token} className="w-full">Update password</Button>
        </form>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return <Suspense fallback={null}><ResetInner /></Suspense>;
}
```

(Confirm `PasswordInput` forwards `id`/`required`/`minLength`/`value`/`onChange` — it wraps `Input` which spreads `...rest`. Confirm `Button` has a `loading` prop — the chat Composer uses `loading`.)

- [ ] **Step 3: login link** — in `apps/web/src/app/login/page.tsx`, add a "Forgot password?" link. Inside the form, after the password field (or near the submit), add:

```tsx
          <div className="text-right">
            <Link href="/forgot-password" className="text-sm font-medium text-accent hover:text-accent-hover">
              Forgot password?
            </Link>
          </div>
```

(`Link` is already imported in login page.)

- [ ] **Step 4: Typecheck** (`pnpm --filter finby-web exec tsc --noEmit`, exit 0).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/forgot-password/page.tsx apps/web/src/app/reset-password/page.tsx apps/web/src/app/login/page.tsx
git commit -m "feat(web): forgot-password + reset-password pages + login link"
```

---

## PHASE 5 — Full verification

### Task 13: Suite + build + live smoke

- [ ] **Step 1: API tests** — `pnpm --filter finby-api exec jest` → all pass (114 existing + new).
- [ ] **Step 2: Web typecheck** — `pnpm --filter finby-web exec tsc --noEmit` → exit 0.
- [ ] **Step 3: Web build** (no `next dev` running) — `pnpm turbo run build --filter=finby-web` → success; confirm `/verify-email`, `/forgot-password`, `/reset-password` routes appear.
- [ ] **Step 4: API live smoke (optional, local)** — boot the API (`.env` has no `RESEND_API_KEY` → emails log-skip), register a user, confirm logs show `[email skipped] ... subject="Verify your email for Finby"` and the app still returns an `AuthResult`. Then `psql` read `emailVerifyToken` is set.
- [ ] **Step 5: Finish the branch** — use superpowers:finishing-a-development-branch (merge to main / push; deploy. Set `RESEND_API_KEY`, `EMAIL_FROM` on Render + verify `finby.app` in Resend when ready to actually send).

---

## Self-Review

**Spec coverage:** EmailProvider/ResendProvider (T2) · EmailService+templates (T3) · env+dep (T1) · register verification (T5) · verify/resend (T6) · routes (T7) · welcome-on-verify (T6) · password-reset email (T11) · banner (T10) · verify page (T9) · forgot/reset pages + login link (T12) · auth-api+store (T8). All spec sections covered.

**Placeholder scan:** none — every step has concrete code/commands.

**Type/name consistency:** `EMAIL_PROVIDER` token, `EmailProvider.send`, `EmailService.{sendVerification,sendWelcome,sendPasswordReset}`, `issueVerification`, `verifyEmail`, `resendVerification`, `verifyEmailSchema`, `markVerified` — used consistently across api + web tasks. `WEB_URL` link base used in T5/T6/T11. Email injected as mock in auth spec (T5) keeps existing tests green.

**Note (verify against real code during T5/T6):** match the existing `auth.service.spec.ts` mock variable names (`prismaMock` / `validRegisterInput`) — adapt if they differ; the structure (add `emailMock` as the final constructor arg) holds regardless.
