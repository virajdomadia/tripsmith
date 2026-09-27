import { CalendarClock, Clock, FileText, MessageSquare, Phone } from 'lucide-react';
import Link from 'next/link';
import { lakh } from '@/lib/admin/money';
import {
  followUp,
  isOpen,
  source,
  STAGE,
  tripLine,
  waiting,
  type EnquiryRow,
  type Tone,
} from '@/lib/admin/inbox';
import { cn } from '@/lib/utils';

export const TONE: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-primary-soft text-primary-ink',
  mute: 'bg-bg2 text-mute',
  primary: 'bg-primary text-white',
};
const SOURCE_ICON = { form: FileText, phone: Phone, chat: MessageSquare } as const;

export function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-[11.5px] font-bold whitespace-nowrap',
        TONE[tone],
      )}
    >
      {children}
    </span>
  );
}

/** The chips every enquiry carries, in the list and in the panel. */
export function EnquiryChips({
  e,
  today,
  withSource = true,
}: {
  e: {
    type: string;
    status: EnquiryRow['status'];
    replied: boolean;
    createdAt: string;
    followUpOn?: string | null;
    lostReason?: string | null;
  };
  today: string;
  withSource?: boolean;
}) {
  const src = source(e.type);
  const Icon = SOURCE_ICON[src.icon];
  const wait = waiting(e);
  const fu = followUp(e, today);
  return (
    <>
      {withSource && (
        <Chip tone="mute">
          <Icon className="size-3" aria-hidden />
          {src.label}
        </Chip>
      )}
      {wait && (
        <Chip tone={wait.tone}>
          <Clock className="size-3" aria-hidden />
          {wait.text}
        </Chip>
      )}
      <Chip tone={STAGE[e.status].tone}>
        {STAGE[e.status].label}
        {e.status === 'closed' && e.lostReason ? ` · ${e.lostReason}` : ''}
      </Chip>
      {fu && (
        <Chip tone={fu.due ? 'warn' : 'info'}>
          <CalendarClock className="size-3" aria-hidden />
          {fu.text}
        </Chip>
      )}
    </>
  );
}

/**
 * Mockup Enquiries A2's list: rows to scan instead of a seven-column table — who, the trip, a
 * rough value, where it came from, how long they have waited against the 2-hour target, the
 * stage and the next follow-up. A row opens the enquiry in the panel (`?sel=`).
 */
export function InboxList({
  items,
  selected,
  hrefFor,
  today,
}: {
  items: EnquiryRow[];
  selected?: string;
  hrefFor: (id: string) => string;
  today: string;
}) {
  if (items.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-mute">
        Nothing here. Every enquiry in this view is answered.
      </p>
    );
  }
  return (
    <ul aria-label="Enquiries" className="grid">
      {items.map((e) => {
        const on = selected === e.id;
        const unread = e.status === 'new' && !e.replied;
        return (
          <li key={e.id} className="border-t border-line first:border-0">
            <Link
              href={hrefFor(e.id)}
              scroll={false}
              aria-current={on ? 'true' : undefined}
              data-inbox-row={e.id}
              className={cn(
                'grid gap-1.5 px-4 py-3 text-ink no-underline transition-colors hover:bg-primary-soft/40',
                on && 'bg-primary-soft shadow-[inset_3px_0_0_var(--color-primary)]',
              )}
            >
              <span className="flex min-w-0 items-baseline gap-2">
                <span
                  className={cn(
                    'min-w-0 truncate text-[14.5px] font-extrabold',
                    !isOpen(e.status) && 'text-mute',
                  )}
                >
                  {unread && (
                    <span
                      aria-hidden
                      className="mr-1.5 inline-block size-[7px] -translate-y-px rounded-full bg-primary"
                    />
                  )}
                  {e.name}
                </span>
                <span className="font-mono text-[11.5px] whitespace-nowrap text-mute max-sm:hidden">
                  {e.ref}
                </span>
                <span className="num ml-auto text-[13.5px] font-extrabold whitespace-nowrap">
                  {e.estimatePaise ? (
                    <>
                      <small className="mr-1 font-semibold text-mute">
                        {e.status === 'converted' ? 'booked' : 'est.'}
                      </small>
                      {lakh(e.estimatePaise)}
                    </>
                  ) : (
                    <small className="font-semibold text-mute">No trip yet</small>
                  )}
                </span>
              </span>
              <span
                className={cn('truncate text-[13px]', isOpen(e.status) ? 'text-ink2' : 'text-mute')}
              >
                {tripLine(e)}
              </span>
              <span className="flex flex-wrap gap-1">
                <EnquiryChips e={e} today={today} />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
