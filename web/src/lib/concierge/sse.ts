/**
 * A minimal server-sent-events reader for `POST /chat` (v3 C2). `EventSource` only does GET, so
 * the stream is read from a `fetch` body: frames are separated by a blank line, each carrying an
 * `event:` name and one `data:` JSON line (api/app/services/ai/chat.py `sse`).
 */

export type SseFrame = { event: string; data: string };

/** Splits complete frames off `buffer`; returns them and whatever partial frame is left. */
export function takeFrames(buffer: string): { frames: SseFrame[]; rest: string } {
  // A trailing `\r` may be the first half of a `\r\n` split across chunks: hold it back.
  const held = buffer.endsWith('\r') ? '\r' : '';
  const normalised = (held ? buffer.slice(0, -1) : buffer).replace(/\r\n?/g, '\n');
  const blocks = normalised.split('\n\n');
  const rest = (blocks.pop() ?? '') + held;
  const frames: SseFrame[] = [];
  for (const block of blocks) {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue; // comment / keep-alive
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'event') event = value;
      else if (field === 'data') data.push(value);
    }
    if (data.length) frames.push({ event, data: data.join('\n') });
  }
  return { frames, rest };
}

/** Yields every frame of a streamed body, however the network chunks it. */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const { frames, rest } = takeFrames(done ? `${buffer}\n\n` : buffer);
      buffer = rest;
      yield* frames;
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}
