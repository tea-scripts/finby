import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { revealStep, createTypewriter } from './typewriter';

describe('revealStep', () => {
  it('reveals nothing from an empty buffer', () => {
    expect(revealStep('', 20)).toEqual({ reveal: '', rest: '' });
  });

  it('reveals at least one char from a small buffer', () => {
    expect(revealStep('hello', 20)).toEqual({ reveal: 'h', rest: 'ello' });
  });

  it('drains a large backlog proportionally (ceil(len/framesToDrain))', () => {
    // 40 chars, framesToDrain 20 -> reveal 2
    const pending = 'x'.repeat(40);
    const { reveal, rest } = revealStep(pending, 20);
    expect(reveal).toHaveLength(2);
    expect(rest).toHaveLength(38);
  });
});

describe('createTypewriter', () => {
  let rafQueue: FrameRequestCallback[];
  beforeEach(() => {
    rafQueue = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => vi.unstubAllGlobals());

  const flush = (max = 1000) => {
    let i = 0;
    while (rafQueue.length && i++ < max) {
      const cb = rafQueue.shift()!;
      cb(0);
    }
  };

  it('reveals pushed text progressively and ends with the full string', async () => {
    const reveals: string[] = [];
    const tw = createTypewriter((text) => reveals.push(text), { framesToDrain: 4 });
    tw.push('abcdefgh');
    const done = tw.finish();
    flush();
    await done;
    expect(reveals[reveals.length - 1]).toBe('abcdefgh');
    expect(reveals.length).toBeGreaterThan(1); // progressive, not one dump
  });

  it('finish() resolves immediately when nothing was pushed', async () => {
    const tw = createTypewriter(() => {}, { framesToDrain: 4 });
    await expect(tw.finish()).resolves.toBeUndefined();
  });

  it('cancel() stops further reveals and resolves a pending finish', async () => {
    const reveals: string[] = [];
    const tw = createTypewriter((text) => reveals.push(text), { framesToDrain: 100 });
    tw.push('a very long string that would take many frames to fully reveal');
    const done = tw.finish();
    tw.cancel();
    flush();
    await expect(done).resolves.toBeUndefined();
    // after cancel, no further frames reveal text
    const countAfterCancel = reveals.length;
    flush();
    expect(reveals.length).toBe(countAfterCancel);
  });
});
