import { describe, expect, it } from 'vitest';
import { resolveApiBase } from './config';

describe('resolveApiBase', () => {
  it('prefers the env URL', () => {
    expect(resolveApiBase({ envUrl: 'https://api.finby.app/api/v1', extraApiBase: 'x' }))
      .toBe('https://api.finby.app/api/v1');
  });
  it('falls back to app.json extra.apiBase', () => {
    expect(resolveApiBase({ extraApiBase: 'https://staging.finby.app/api/v1' }))
      .toBe('https://staging.finby.app/api/v1');
  });
  it('defaults to localhost when nothing is configured', () => {
    expect(resolveApiBase({})).toBe('http://localhost:3001/api/v1');
    expect(resolveApiBase({ extraApiBase: '' })).toBe('http://localhost:3001/api/v1');
    expect(resolveApiBase({ extraApiBase: 42 })).toBe('http://localhost:3001/api/v1');
  });
});
