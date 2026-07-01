import { describe, it, expect } from 'vitest';
import { mapUrlToRoute } from './notification-routing';

describe('mapUrlToRoute', () => {
  it('maps known web paths to mobile routes', () => {
    expect(mapUrlToRoute('/chat')).toBe('/');
    expect(mapUrlToRoute('/transactions')).toBe('/transactions');
    expect(mapUrlToRoute('/dashboard')).toBe('/dashboard');
    expect(mapUrlToRoute('/streaks')).toBe('/streaks');
    expect(mapUrlToRoute('/budgets')).toBe('/dashboard'); // budgets live under dashboard on mobile
  });

  it('strips query strings and matches the path', () => {
    expect(mapUrlToRoute('/transactions?highlight=abc')).toBe('/transactions');
  });

  it('returns null for unknown or empty urls (open app only)', () => {
    expect(mapUrlToRoute('/unknown')).toBeNull();
    expect(mapUrlToRoute(null)).toBeNull();
    expect(mapUrlToRoute('')).toBeNull();
  });
});
