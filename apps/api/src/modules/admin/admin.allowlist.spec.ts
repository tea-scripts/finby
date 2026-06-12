import { parseAllowlist, isAllowedAdmin } from './admin.allowlist';

describe('admin allowlist', () => {
  it('parses comma-separated emails, trims, lowercases, drops blanks', () => {
    expect(parseAllowlist(' A@x.com, b@Y.com ,, ')).toEqual(['a@x.com', 'b@y.com']);
  });

  it('returns empty array for empty/undefined input', () => {
    expect(parseAllowlist('')).toEqual([]);
    expect(parseAllowlist(undefined)).toEqual([]);
  });

  it('membership is case-insensitive', () => {
    expect(isAllowedAdmin('A@X.com', ['a@x.com'])).toBe(true);
    expect(isAllowedAdmin('nope@x.com', ['a@x.com'])).toBe(false);
  });

  it('never allows when the list is empty', () => {
    expect(isAllowedAdmin('a@x.com', [])).toBe(false);
  });
});
