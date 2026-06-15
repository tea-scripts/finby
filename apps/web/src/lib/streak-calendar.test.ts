import { describe, it, expect } from 'vitest';
import { buildCalendarCells } from './streak-calendar';

describe('buildCalendarCells', () => {
  it('emits one cell per day from..to inclusive', () => {
    const cells = buildCalendarCells('2026-06-10', '2026-06-12', [], []);
    expect(cells.map((c) => c.date)).toEqual(['2026-06-10', '2026-06-11', '2026-06-12']);
  });

  it('marks active, repaired, and missed states (repaired wins over active)', () => {
    const cells = buildCalendarCells(
      '2026-06-10',
      '2026-06-12',
      ['2026-06-10', '2026-06-11'],
      ['2026-06-11'],
    );
    expect(cells.map((c) => c.state)).toEqual(['active', 'repaired', 'missed']);
  });

  it('tags each cell with its UTC weekday (0=Sun..6=Sat)', () => {
    // 2026-06-10 is a Wednesday (weekday 3).
    expect(buildCalendarCells('2026-06-10', '2026-06-10', [], [])[0].weekday).toBe(3);
  });
});
