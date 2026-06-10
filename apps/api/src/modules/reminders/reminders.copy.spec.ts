import { reminderCopy, dayOfYearUtc } from './reminders.copy';

describe('reminderCopy', () => {
  it('substitutes the name and is deterministic per dayIndex', () => {
    const a = reminderCopy('Tea', 0);
    const b = reminderCopy('Tea', 0);
    expect(a).toEqual(b);
    expect(a.body).toContain('Tea');
    expect(a.title).toBe('Finby');
  });

  it('rotates variants across days', () => {
    const v0 = reminderCopy('Tea', 0).body;
    const v1 = reminderCopy('Tea', 1).body;
    expect(v0).not.toBe(v1);
  });

  it('falls back to "there" for an empty name', () => {
    expect(reminderCopy('  ', 2).body).toContain('there');
  });
});

describe('dayOfYearUtc', () => {
  it('returns a stable integer day index', () => {
    expect(dayOfYearUtc(new Date('2026-01-01T00:00:00Z'))).toBe(1);
    expect(dayOfYearUtc(new Date('2026-01-02T00:00:00Z'))).toBe(2);
  });
});
