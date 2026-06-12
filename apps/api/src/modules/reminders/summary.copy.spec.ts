import { summaryCopy } from './summary.copy';

describe('summaryCopy', () => {
  it('uses Finby as the title', () => {
    const { title } = summaryCopy('Tea', { totalBase: '12', currency: 'USD', topCategory: 'Food' }, 0);
    expect(title).toBe('Finby');
  });

  it('mentions spend, top category and the streak when streak >= 2', () => {
    const { body } = summaryCopy(
      'Tea',
      { totalBase: '1250.5', currency: 'USD', topCategory: 'Groceries' },
      7,
    );
    expect(body).toContain('$1,250.5');
    expect(body).toContain('Groceries');
    expect(body).toContain('🔥 7-day streak');
  });

  it('mentions spend and top category but no streak when streak < 2', () => {
    const { body } = summaryCopy(
      'Tea',
      { totalBase: '40', currency: 'USD', topCategory: 'Transport' },
      1,
    );
    expect(body).toContain('$40');
    expect(body).toContain('Transport was your biggest category');
    expect(body).not.toContain('streak');
  });

  it('falls back to a category-free variant when there is no top category', () => {
    const { body } = summaryCopy('Tea', { totalBase: '40', currency: 'USD', topCategory: null }, 5);
    expect(body).toContain('$40');
    expect(body).toContain('Nice work keeping track');
    expect(body).not.toContain('streak');
  });

  it('renders the currency symbol for known currencies and groups thousands', () => {
    const { body } = summaryCopy(
      'Tea',
      { totalBase: '12345.6', currency: 'NGN', topCategory: 'Bills' },
      3,
    );
    expect(body).toContain('₦12,345.6');
  });

  it('falls back to the code for unknown currencies', () => {
    const { body } = summaryCopy('Tea', { totalBase: '5', currency: 'ZZZ', topCategory: null }, 0);
    expect(body).toContain('ZZZ5');
  });

  it('falls back to a friendly name when the display name is blank', () => {
    const { body } = summaryCopy('  ', { totalBase: '5', currency: 'USD', topCategory: null }, 0);
    expect(body.startsWith('there,')).toBe(true);
  });
});
