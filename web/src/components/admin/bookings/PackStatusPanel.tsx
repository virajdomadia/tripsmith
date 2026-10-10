import { CalendarCheck, FileDown, Lock, LockOpen } from 'lucide-react';
import { istDay, tripPackHref } from '@/lib/account';
import type { components } from '@/lib/api-types';
import { formatDate } from '@/lib/format';

type Status = components['schemas']['DeskPackStatus'];

/**
 * R48 (P10b) on booking detail C: where the customer's trip pack stands (locked until 7 days out
 * and paid in full; read or not) with the owner's preview PDF, and whether the trip is on their
 * calendar — un-ticked by a date change until they add it again.
 */
export function PackStatusPanel({ bookingRef, status: s }: { bookingRef: string; status: Status }) {
  const pack = s.pack;
  const packLine = !pack
    ? null
    : pack.state === 'closed'
      ? 'Closed — 30 days after the trip'
      : pack.state === 'open'
        ? pack.readAt
          ? `Open · read ${formatDate(istDay(pack.readAt))}`
          : 'Open · not read yet'
        : pack.needsPayment && pack.dayReached
          ? 'Locked — waiting for the balance'
          : `Locked · opens ${formatDate(pack.opensOn)}${pack.needsPayment ? ', once paid in full' : ''}`;
  const calLine = s.calendarAddedAt
    ? `Added · ${s.calendarVia === 'google' ? 'Google Calendar' : 'calendar file'} · ${formatDate(istDay(s.calendarAddedAt))}`
    : s.calendarStale
      ? 'Date changed — not added again yet'
      : 'Not added yet';
  const Icon = pack?.state === 'open' ? LockOpen : Lock;
  return (
    <div className="grid gap-2.5 text-[13px]">
      {pack && (
        <div className="flex items-start gap-2">
          <Icon
            className={`mt-0.5 size-4 shrink-0 ${pack.state === 'open' ? 'text-ok' : 'text-mute'}`}
            aria-hidden
          />
          <div className="grid gap-1">
            <span>
              <b>Trip pack</b> · {packLine}
            </span>
            {pack.state !== 'closed' && (
              <a
                href={tripPackHref(bookingRef)}
                download
                className="inline-flex items-center gap-1 font-bold text-primary no-underline hover:text-primary-ink"
              >
                <FileDown className="size-4" aria-hidden />
                {pack.state === 'open' ? 'Their PDF' : 'Preview the PDF'}
              </a>
            )}
          </div>
        </div>
      )}
      <div className="flex items-start gap-2">
        <CalendarCheck
          className={`mt-0.5 size-4 shrink-0 ${s.calendarAddedAt ? 'text-ok' : 'text-mute'}`}
          aria-hidden
        />
        <span className={s.calendarStale ? 'text-warn' : ''}>
          <b className="text-ink">Calendar</b> · {calLine}
        </span>
      </div>
    </div>
  );
}
