import { EmailService } from './email.service';
import type { EmailProvider } from './email.provider';

function build() {
  const send = jest.fn().mockResolvedValue(undefined);
  const provider: EmailProvider = { send };
  const service = new EmailService(provider);
  return { service, send };
}

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

describe('EmailService.sendReengagement', () => {
  it('sends the we-miss-you email with the open URL and name', async () => {
    const { service, send } = build();
    await service.sendReengagement('a@x.com', 'Tea', 'https://chat.finby.app/chat');
    expect(send).toHaveBeenCalledTimes(1);
    const msg = send.mock.calls[0][0];
    expect(msg.to).toBe('a@x.com');
    expect(msg.html).toContain('https://chat.finby.app/chat');
    expect(msg.html).toContain('Tea');
  });
});

describe('EmailService.sendMemberInvite', () => {
  it('sends an invite email containing the accept URL and inviter/workspace names', async () => {
    const { service, send } = build();
    await service.sendMemberInvite('a@x.com', 'Bola', 'The Johnson Family', 'https://app/invite/tok123');
    expect(send).toHaveBeenCalledTimes(1);
    const msg = send.mock.calls[0][0];
    expect(msg.to).toBe('a@x.com');
    expect(msg.subject).toContain('family');
    expect(msg.html).toContain('https://app/invite/tok123');
    expect(msg.html).toContain('The Johnson Family');
    expect(msg.html).toContain('Bola');
  });
});
