import { reengagementCopy } from './reengagement.copy';

describe('reengagementCopy', () => {
  it('personalizes the body with the user name', () => {
    expect(reengagementCopy('Tea', 0).body).toContain('Tea');
  });

  it('falls back to "there" for a blank name', () => {
    expect(reengagementCopy('   ', 0).body).toContain('there');
  });

  it('rotates variants deterministically by day index', () => {
    const a = reengagementCopy('Tea', 1);
    expect(reengagementCopy('Tea', 1)).toEqual(a);
    expect(reengagementCopy('Tea', 2)).not.toEqual(a);
  });

  it('always titles the notification "Finby"', () => {
    expect(reengagementCopy('Tea', 5).title).toBe('Finby');
  });
});
