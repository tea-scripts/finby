import { earlyReminderEmail } from './email.templates';

describe('earlyReminderEmail', () => {
  it('uses streak-keeping copy when the user has a streak', () => {
    const { subject, html } = earlyReminderEmail('Alex', 3, 'https://chat.finby.app/chat');
    expect(subject).toMatch(/keep your.*streak/i);
    expect(html).toContain('3-day');
    expect(html).toContain('https://chat.finby.app/chat');
  });

  it('uses start-a-streak copy when the user has none yet', () => {
    const { subject, html } = earlyReminderEmail('Alex', 0, 'https://chat.finby.app/chat');
    expect(subject).toMatch(/start your/i);
    expect(html).toContain('Alex');
  });

  it('escapes the user name', () => {
    const { html } = earlyReminderEmail('<b>x</b>', 1, 'https://x/chat');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});
