import { describe, it, expect } from 'vitest';
import { passwordStrength } from './password-strength';

describe('passwordStrength', () => {
  it('returns score 0 (no label) for an empty password', () => {
    expect(passwordStrength('')).toEqual({ score: 0, label: '' });
  });

  it('rates a too-short password as Weak', () => {
    expect(passwordStrength('abc123')).toMatchObject({ score: 1, label: 'Weak' });
  });

  it('rates a long single-class password as Weak (no variety)', () => {
    expect(passwordStrength('aaaaaaaaaaaa')).toMatchObject({ score: 1, label: 'Weak' });
  });

  it('rates an 8-char two-class password as So-so', () => {
    expect(passwordStrength('abcdefg1')).toMatchObject({ score: 2, label: 'So-so' });
  });

  it('rates a long, varied password as Strong', () => {
    expect(passwordStrength('Abcdef1!xyz2')).toMatchObject({ score: 3, label: 'Strong' });
  });
});
