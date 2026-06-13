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

  it('carries a partial frame across two calls', () => {
    const first = parseSseFrames('event: text\ndata: {"text":"par');
    expect(first.events).toEqual([]);
    const second = parseSseFrames(first.rest + 'tial"}\n\n');
    expect(second.events).toEqual([{ event: 'text', data: '{"text":"partial"}' }]);
  });

  it('strips a single leading space after data: and defaults the event name', () => {
    const { events } = parseSseFrames('data: {"x":1}\n\n');
    expect(events).toEqual([{ event: 'message', data: '{"x":1}' }]);
  });
});
