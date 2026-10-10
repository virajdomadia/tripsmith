import { CalendarClock, MailCheck, MailWarning } from 'lucide-react';
import Link from 'next/link';
import { istFullDate, istShortDate, istTime } from '@/components/admin/enquiries/ist-date';
import type { components } from '@/lib/api-types';
import { EMAILS_PATH, type UpcomingEmail } from '@/lib/admin/emails';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

type Entry = components['schemas']['HistoryEntry'];

/** "Emailed the customer: “…”" → "…" (the history writes the subject in curly quotes). */
const subjectOf = (text: string) => text.match(/“(.+)”$/)?.[1] ?? text;
const SENT_SHOWN = 4;

/**
 * Booking detail C · Emails (R53, P15b): what the automatic run will send and when — each with
 * its switch state — and the latest emails the booking got (the full list is History's "Emails"
 * chip). Server-rendered; nothing to click but the Settings link.
 */
export function EmailsPanel({
  upcoming,
  history,
}: {
  upcoming: UpcomingEmail[];
  history: Entry[];
}) {
  const sent = history.filter((e) => e.group === 'email').reverse();
  return (
    <div className="grid gap-3 text-[13px]">
      <div className="grid gap-1.5">
        <h3 className="text-[12px] font-extrabold tracking-[0.06em] text-mute uppercase">
          Coming up
        </h3>
        {upcoming.length === 0 ? (
          <p className="text-mute">Nothing automatic is due for this booking.</p>
        ) : (
          <ul className="grid gap-1.5">
            {upcoming.map((u) => (
              <li
                key={`${u.type}-${u.on}`}
                className={cn('flex items-start gap-2', !u.switchOn && 'text-mute')}
              >
                <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">
                  <b className={cn('font-semibold', u.switchOn ? 'text-ink' : 'line-through')}>
                    {u.label}
                  </b>
                  {u.note && <span className="text-mute"> · {u.note}</span>}
                  {!u.switchOn && <span> · switched off</span>}
                </span>
                <span className="num whitespace-nowrap">{formatDate(u.on)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid gap-1.5">
        <h3 className="text-[12px] font-extrabold tracking-[0.06em] text-mute uppercase">
          Sent · {sent.length}
        </h3>
        {sent.length === 0 ? (
          <p className="text-mute">No emails yet.</p>
        ) : (
          <ul className="grid gap-1.5">
            {sent.slice(0, SENT_SHOWN).map((e) => {
              const failed = e.kind === 'email.failed';
              const Icon = failed ? MailWarning : MailCheck;
              return (
                <li key={e.id} className="flex items-start gap-2">
                  <Icon
                    className={cn('mt-0.5 size-4 shrink-0', failed ? 'text-bad' : 'text-ok')}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 break-words">
                    {subjectOf(e.text)}
                    {failed && <span className="text-bad"> · failed</span>}
                    {e.kind === 'email.held' && <span className="text-mute"> · demo copy</span>}
                    {e.text.startsWith('Emailed the owner') && (
                      <span className="text-mute"> · to you</span>
                    )}
                  </span>
                  <span
                    className="whitespace-nowrap text-mute"
                    title={`${istFullDate(e.at)} · ${istTime(e.at)}`}
                  >
                    {istShortDate(e.at)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {sent.length > SENT_SHOWN && (
          <p className="text-mute">The rest are in History under “Emails”.</p>
        )}
      </div>
      <Link
        href={EMAILS_PATH}
        className="font-semibold text-primary underline-offset-2 hover:underline"
      >
        Email settings
      </Link>
    </div>
  );
}
