import { describe, it, expect } from 'vitest';
import { formatAmountInput } from './format-amount-input';

describe('formatAmountInput', () => {
  it('passes through zero and empty', () => {
    expect(formatAmountInput('')).toBe('');
    expect(formatAmountInput('0')).toBe('0');
  });
  it('strips leading zeros once a real digit is entered', () => {
    expect(formatAmountInput('05')).toBe('5');
    expect(formatAmountInput('00')).toBe('0');
    expect(formatAmountInput('050')).toBe('50');
  });
  it('groups the integer part with commas', () => {
    expect(formatAmountInput('1000')).toBe('1,000');
    expect(formatAmountInput('1234567')).toBe('1,234,567');
  });
  it('keeps up to two decimals and one decimal point', () => {
    expect(formatAmountInput('1234.5')).toBe('1,234.5');
    expect(formatAmountInput('1234.567')).toBe('1,234.56');
    expect(formatAmountInput('1.2.3')).toBe('1.23');
    expect(formatAmountInput('0.5')).toBe('0.5');
  });
  it('preserves a trailing decimal point while typing', () => {
    expect(formatAmountInput('12.')).toBe('12.');
  });
  it('strips non-numeric characters and existing commas (idempotent)', () => {
    expect(formatAmountInput('abc12')).toBe('12');
    expect(formatAmountInput('1,234')).toBe('1,234');
  });
});
