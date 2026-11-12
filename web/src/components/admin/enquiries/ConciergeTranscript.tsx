import { Search } from 'lucide-react';
import { istTime } from '@/components/admin/enquiries/ist-date';
import type { components } from '@/lib/api-types';

type Line = components['schemas']['TranscriptLine'];

/**
 * R29: the concierge chat a `chat-handoff` came from, read the way it happened — the visitor's
 * messages, the concierge's replies, and each lookup as one plain sentence (the api writes it:
 * services/ai/transcript.py). Plain text only: React escapes it, so nothing a visitor or the
 * model typed can become markup here.
 */
export function ConciergeTranscript({ lines, firstName }: { lines: Line[]; firstName: string }) {
  return (
    <ol
      aria-label="Concierge chat"
      className="grid max-h-[360px] content-start gap-2 overflow-y-auto p-0.5 text-[13.5px] max-lg:max-h-none"
    >
      {lines.map((line, i) => {
        if (line.role === 'lookup')
          return (
            <li
              key={i}
              className="flex items-start gap-1.5 justify-self-start rounded-lg bg-bg2 px-2.5 py-1 text-[12.5px] text-ink2"
            >
              <Search className="mt-0.5 size-3.5 shrink-0 text-mute" aria-hidden />
              <span>
                <span className="sr-only">Lookup: </span>
                {line.text}
              </span>
            </li>
          );
        const visitor = line.role === 'visitor';
        return (
          <li key={i} className={`grid max-w-[92%] gap-0.5 ${visitor ? '' : 'justify-self-end'}`}>
            <span className={`text-[11.5px] font-bold text-mute ${visitor ? '' : 'text-right'}`}>
              {visitor ? firstName : 'Concierge'} · {istTime(line.at)}
            </span>
            <p
              className={`rounded-xl border px-3 py-2 leading-relaxed break-words whitespace-pre-line ${
                visitor ? 'border-line bg-bg' : 'border-primary/20 bg-primary-soft'
              }`}
            >
              {line.text}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
