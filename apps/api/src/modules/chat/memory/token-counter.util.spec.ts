import { estimateTokens } from './token-counter.util';

describe('estimateTokens', () => {
  it('returns 0 for an empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('returns 0 for null', () => {
    expect(estimateTokens(null)).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(estimateTokens(undefined)).toBe(0);
  });

  it('returns Math.ceil(length / 4) for a known string', () => {
    const text = 'Hello, world!'; // length = 13, ceil(13/4) = 4
    expect(estimateTokens(text)).toBe(Math.ceil(text.length / 4));
  });

  it('returns correct estimate for an exact multiple of 4', () => {
    const text = 'abcd'; // length = 4, ceil(4/4) = 1
    expect(estimateTokens(text)).toBe(1);
  });

  it('does not throw for a JSON string', () => {
    const json = JSON.stringify({ role: 'user', content: 'What is my balance?', ts: Date.now() });
    expect(() => estimateTokens(json)).not.toThrow();
    expect(estimateTokens(json)).toBe(Math.ceil(json.length / 4));
  });
});
