import { describe, expect, it } from 'vitest';
import { CORE_PACKAGE } from './index';

describe('@finby/core', () => {
  it('exposes its package marker', () => {
    expect(CORE_PACKAGE).toBe('@finby/core');
  });
});
