import type { Ticket as TicketState } from '@/lib/concierge/reducer';

/**
 * Layout D's trip ticket: pinned above the conversation, it fills in as the concierge searches.
 * Each field is what the concierge actually searched with (tool-call arguments), stamped in with
 * the site's postmark motion when it changes — keyed by value, so a new value stamps again.
 */
export function Ticket({ ticket }: { ticket: TicketState }) {
  const fields: [string, string | null][] = [
    ['Where', ticket.where],
    ['When', ticket.when],
    ['Nights', ticket.nights],
    ['Budget pp', ticket.budget],
  ];
  return (
    <section
      aria-label="Your trip so far"
      className="relative mx-3 mt-3 shrink-0 overflow-hidden rounded-2xl bg-ink px-3.5 pt-3 pb-2.5 text-white before:absolute before:top-[calc(100%-44px)] before:-left-2.5 before:size-[18px] before:rounded-full before:bg-bg after:absolute after:top-[calc(100%-44px)] after:-right-2.5 after:size-[18px] after:rounded-full after:bg-bg"
    >
      <div className="flex items-baseline justify-between text-[11px] font-bold tracking-[0.09em] text-ink-soft uppercase">
        <span>Your trip</span>
        <span aria-hidden>Tripsmith</span>
      </div>
      <dl className="mt-2 grid grid-cols-[1.3fr_1fr_0.8fr_1fr] gap-2">
        {fields.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[10px] font-semibold tracking-[0.04em] text-ink-soft uppercase">
              {label}
            </dt>
            <dd
              key={value ?? '-'}
              className={`num mt-0.5 truncate text-[14px] leading-tight ${value ? 'animate-ticket-stamp font-extrabold' : 'font-semibold text-[#6f8291]'}`}
            >
              {value ?? '—'}
              {!value && <span className="sr-only">not set yet</span>}
            </dd>
          </div>
        ))}
      </dl>
      <p
        aria-live="polite"
        className="mt-2.5 min-h-[26px] border-t-[1.5px] border-dashed border-[#4a5c69] pt-2 text-[12.5px] font-semibold text-ink-soft"
      >
        {ticket.line}
      </p>
    </section>
  );
}
