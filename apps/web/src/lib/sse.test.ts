import { describe, expect, it } from 'vitest';
import { parseSseFrames } from './sse';

describe('parseSseFrames', () => {
  it('parses a complete frame and returns no remainder', () => {
    const { events, rest } = parseSseFrames('event: text\ndata: {"text":"hi"}\n\n');
    expect(events).toEqual([{ event: 'text', data: '{"text":"hi"}' }]);
    expect(rest).toBe('');
  });

  it('parses multiple frames in one chunk', () => {
    const { events } = parseSseFrames('event: start\ndata: {}\n\nevent: done\ndata: {"id":1}\n\n');
    expect(events.map((e) => e.event)).toEqual(['start', 'done']);
  });

  it('buffers a partial frame as remainder', () => {
    const { events, rest } = parseSseFrames('event: text\ndata: {"text":"par');
    expect(events).toEqual([]);
    expect(rest).toBe('event: text\ndata: {"text":"par');
  });

  it('ignores heartbeat comment lines', () => {
    const { events } = parseSseFrames(':ping\n\nevent: text\ndata: {}\n\n');
    expect(events.map((e) => e.event)).toEqual(['text']);
  });
});
