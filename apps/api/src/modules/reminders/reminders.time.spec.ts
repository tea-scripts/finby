import { localDayInfo } from './reminders.time';

describe('localDayInfo', () => {
  const instant = new Date('2026-06-10T19:00:00Z'); // 19:00 UTC

  it('reports UTC hour/date unchanged for UTC', () => {
    const info = localDayInfo(instant, 'UTC');
    expect(info.hour).toBe(19);
    expect(info.date).toBe('2026-06-10');
    expect(info.startOfDayMs).toBe(Date.UTC(2026, 5, 10, 0, 0, 0));
  });

  it('rolls into the next local day for +5:30 (Asia/Kolkata)', () => {
    const info = localDayInfo(instant, 'Asia/Kolkata'); // 19:00Z -> 00:30 next day
    expect(info.hour).toBe(0);
    expect(info.date).toBe('2026-06-11');
    expect(info.startOfDayMs).toBe(Date.parse('2026-06-10T18:30:00Z'));
  });

  it('stays on the same local day for -4 (America/New_York, EDT)', () => {
    const info = localDayInfo(instant, 'America/New_York'); // 19:00Z -> 15:00
    expect(info.hour).toBe(15);
    expect(info.date).toBe('2026-06-10');
    expect(info.startOfDayMs).toBe(Date.parse('2026-06-10T04:00:00Z'));
  });
});
