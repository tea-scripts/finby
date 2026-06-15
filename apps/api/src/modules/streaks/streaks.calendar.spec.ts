import { bucketLocalDays } from './streaks.calendar';

describe('bucketLocalDays', () => {
  it('returns unique local-day dates, sorted ascending', () => {
    const dates = [
      new Date('2026-06-10T08:00:00Z'),
      new Date('2026-06-10T20:00:00Z'), // same local day as above -> deduped
      new Date('2026-06-12T00:30:00Z'),
    ];
    expect(bucketLocalDays(dates, 'UTC')).toEqual(['2026-06-10', '2026-06-12']);
  });

  it('uses the given timezone for the day boundary', () => {
    // 2026-06-10T23:30Z is 2026-06-11 in Asia/Kolkata (+05:30).
    expect(bucketLocalDays([new Date('2026-06-10T23:30:00Z')], 'Asia/Kolkata')).toEqual([
      '2026-06-11',
    ]);
  });

  it('deduplicates two instants on the same local day across a UTC midnight', () => {
    // America/New_York is UTC-4 (EDT) on this date; both instants are Jun 10 local.
    expect(
      bucketLocalDays(
        [new Date('2026-06-10T23:45:00Z'), new Date('2026-06-11T01:15:00Z')],
        'America/New_York',
      ),
    ).toEqual(['2026-06-10']);
  });

  it('falls back to UTC for an invalid timezone instead of throwing', () => {
    expect(bucketLocalDays([new Date('2026-06-10T08:00:00Z')], 'Not/AZone')).toEqual([
      '2026-06-10',
    ]);
  });

  it('returns an empty array for no dates', () => {
    expect(bucketLocalDays([], 'UTC')).toEqual([]);
  });
});
