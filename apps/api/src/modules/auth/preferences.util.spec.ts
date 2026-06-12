import { parsePreferences } from './preferences.util';

describe('parsePreferences (reminder fields)', () => {
  it('preserves dailyReminders and lastDailyReminderAt', () => {
    const result = parsePreferences({ dailyReminders: false, lastDailyReminderAt: '2026-06-10' });
    expect(result.dailyReminders).toBe(false);
    expect(result.lastDailyReminderAt).toBe('2026-06-10');
  });

  it('defaults dailyReminders to true and lastDailyReminderAt to null', () => {
    const result = parsePreferences({});
    expect(result.dailyReminders).toBe(true);
    expect(result.lastDailyReminderAt).toBeNull();
  });
});

describe('parsePreferences (dismissedAnnouncements)', () => {
  it('defaults dismissedAnnouncements to an empty array', () => {
    expect(parsePreferences({}).dismissedAnnouncements).toEqual([]);
  });

  it('preserves a list of dismissed announcement ids', () => {
    const result = parsePreferences({ dismissedAnnouncements: ['streaks-2026-06'] });
    expect(result.dismissedAnnouncements).toEqual(['streaks-2026-06']);
  });

  it('ignores a malformed dismissedAnnouncements value, falling back to default', () => {
    const result = parsePreferences({ dismissedAnnouncements: 'not-an-array' });
    expect(result.dismissedAnnouncements).toEqual([]);
  });
});
