import { AlertTriangle, ArrowLeft, Search } from 'lucide-react';
import Link from 'next/link';
import { istFullDate, istTime } from '@/components/admin/enquiries/ist-date';
import { OUTCOME_LABELS, tokens, type AdminConversation } from '@/lib/admin/conversations';
import { cn } from '@/lib/utils';

const H3 = 'label-caps flex items-center gap-2 text-[11px] text-mute';

/**
 * R31: one concierge chat as it happened — the visitor, the concierge, and every lookup as a
 * sentence with its raw arguments and result one click away. Tool errors are red where they
 * happened; the most recent guardrail or model error recorded on the chat sits on top. Plain text and `<pre>`
 * only: nothing a visitor or the model wrote can become markup.
 */
export function ConversationPanel({
  c,
  backHref,
}: {
  c: AdminConversation | null;
  backHref: string;
}) {
  if (!c)
    return (
      <div className="grid min-h-[240px] place-items-center rounded-card border border-dashed border-line bg-bg p-6 text-center text-sm text-mute max-lg:hidden">
        Pick a conversation to read it, lookups and all.
      </div>
    );
  const visitorTurns = c.messageCount;
  return (
    <article className="overflow-hidden rounded-card border border-line bg-bg">
      <header className="grid gap-1.5 border-b border-line p-4">
        <Link href={backHref} className="flex items-center gap-1 text-[13px] font-bold lg:hidden">
          <ArrowLeft className="size-4" aria-hidden />
          All conversations
        </Link>
        <h2 className="text-[17px] leading-snug font-extrabold break-words">“{c.firstMessage}”</h2>
        <p className="text-[12.5px] text-mute">
          {istFullDate(c.createdAt)} · {istTime(c.createdAt)} · {visitorTurns}{' '}
          {visitorTurns === 1 ? 'message' : 'messages'} from the visitor ·{' '}
          <span className="num">{tokens(c.tokensIn)}</span> in /{' '}
          <span className="num">{tokens(c.tokensOut)}</span> out tokens
          {c.model ? ` · ${c.model}` : ''}
          {c.signedIn ? ' · signed in' : ''}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <OutcomePill outcome={c.outcome} />
          {c.enquiry && (
            <Link href={`/admin/enquiries?sel=${c.enquiry.id}`} className="text-[12.5px] font-bold">
              Enquiry from {c.enquiry.name.split(' ')[0]} →
            </Link>
          )}
        </div>
      </header>

      {c.lastError && (
        <p
          role="note"
          className="flex items-start gap-2 border-b border-line bg-bad/10 px-4 py-2.5 text-[12.5px] text-bad"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="break-words">
            <b>Most recent error recorded:</b> {c.lastError}
          </span>
        </p>
      )}

      <section className="grid gap-3 p-4">
        <h3 className={H3}>Transcript</h3>
        <ol aria-label="Trip planner chat" className="grid content-start gap-2 p-0.5 text-[13.5px]">
          {c.transcript.map((line, i) => {
            if (line.role === 'lookup')
              return (
                <li key={i} className="justify-self-stretch">
                  <details
                    className={cn(
                      'group rounded-lg px-2.5 py-1 text-[12.5px]',
                      line.failed ? 'bg-bad/10 text-bad' : 'bg-bg2 text-ink2',
                    )}
                  >
                    <summary className="flex cursor-pointer list-none items-start gap-1.5 [&::-webkit-details-marker]:hidden">
                      {line.failed ? (
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      ) : (
                        <Search className="mt-0.5 size-3.5 shrink-0 text-mute" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="sr-only">
                          {line.failed ? 'Failed lookup: ' : 'Lookup: '}
                        </span>
                        {line.text}
                      </span>
                      <span className="shrink-0 font-bold text-mute underline-offset-2 group-open:underline">
                        raw
                      </span>
                    </summary>
                    <Raw label={`${line.tool ?? 'tool'} args`} value={line.args} />
                    <Raw label="result" value={line.result} />
                  </details>
                </li>
              );
            const visitor = line.role === 'visitor';
            return (
              <li
                key={i}
                className={cn('grid max-w-[92%] gap-0.5', !visitor && 'justify-self-end')}
              >
                <span className={cn('text-[11.5px] font-bold text-mute', !visitor && 'text-right')}>
                  {visitor ? 'Visitor' : 'Trip planner'} · {istTime(line.at)}
                </span>
                <p
                  className={cn(
                    'rounded-xl border px-3 py-2 leading-relaxed break-words whitespace-pre-line',
                    visitor ? 'border-line bg-bg' : 'border-primary/20 bg-primary-soft',
                  )}
                >
                  {line.text}
                </p>
              </li>
            );
          })}
        </ol>
      </section>
    </article>
  );
}

function Raw({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="mt-1.5 grid gap-0.5">
      <span className="font-mono text-[11px] font-bold text-mute">{label}</span>
      <pre className="max-h-56 overflow-auto rounded-md border border-line bg-bg p-2 font-mono text-[11.5px] leading-snug whitespace-pre-wrap text-ink2">
        {JSON.stringify(value ?? {}, null, 2)}
      </pre>
    </div>
  );
}

export function OutcomePill({ outcome }: { outcome: AdminConversation['outcome'] }) {
  const tone =
    outcome === 'booking_started'
      ? 'bg-ok/15 text-ok'
      : outcome === 'enquiry_created'
        ? 'bg-primary-soft text-primary'
        : 'bg-bg2 text-mute';
  return (
    <span className={cn('rounded-chip px-2 py-0.5 text-[11.5px] font-extrabold', tone)}>
      {OUTCOME_LABELS[outcome]}
    </span>
  );
}
