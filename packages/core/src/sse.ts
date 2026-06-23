export interface ParsedSseEvent {
  event: string;
  data: string;
}

/** Splits an accumulating SSE buffer into complete events (delimited by a blank
 *  line) and the leftover partial frame. Comment lines (starting with ':',
 *  e.g. heartbeats) are skipped. */
export function parseSseFrames(buffer: string): { events: ParsedSseEvent[]; rest: string } {
  const events: ParsedSseEvent[] = [];
  let rest = buffer;
  let idx: number;
  while ((idx = rest.indexOf('\n\n')) !== -1) {
    const raw = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    if (raw.startsWith(':')) continue; // heartbeat / comment

    let event = 'message';
    const dataLines: string[] = [];
    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    if (dataLines.length > 0) events.push({ event, data: dataLines.join('\n') });
  }
  return { events, rest };
}
