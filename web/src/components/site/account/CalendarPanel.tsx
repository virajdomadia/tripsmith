'use client';

import { CalendarPlus, Check, Download } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { dayRange, type CalendarBlock } from '@/lib/account';
import { MONTHS } from '@/lib/format';

const BTN =
  'inline-flex h-10 items-center justify-center gap-1.5 rounded-btn border border-line bg-white px-3.5 text-[14px] font-bold text-ink no-underline transition-colors hover:border-primary hover:text-primary';

/** The two buttons, also on the success screens (their links are signed for 30 minutes). */
export function CalendarButtons({
  googleUrl,
  icsUrl,
  onClick,
}: {
  googleUrl: string;
  icsUrl: string;
  onClick?: () => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <a
        href={`/api${googleUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        className={BTN}
      >
        <CalendarPlus className="size-4" aria-hidden /> Google Calendar
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      <a href={`/api${icsUrl}`} onClick={onClick} className={BTN}>
        <Download className="size-4" aria-hidden /> Apple / Outlook (.ics)
      </a>
    </div>
  );
}

/**
 * P10 (R48): Add to calendar — a Google Calendar link and an `.ics` file. Both are signed api
 * links that record the click before sending the event, so the coupon tears off after a click.
 * The event's UID is the booking's: after a date change the `.ics` replaces the old event (a
 * Google link can't, so the stale state points at the file).
 */
export function CalendarPanel({ calendar: c }: { calendar: CalendarBlock }) {
  const router = useRouter();
  if (!c.googleUrl || !c.icsUrl) return null; // no SESSION_SECRET (local dev): nothing to sign
  // The click is recorded by the api on the way; pick it up once the browser has left for it.
  const clicked = () => window.setTimeout(() => router.refresh(), 1500);
  const month = MONTHS[Number(c.starts.slice(5, 7)) - 1];
  return (
    <section className="grid gap-3" aria-labelledby="cal-h">
      <div className="flex items-center gap-3">
        <span className="tp-cal-ic" aria-hidden>
          <small>{month}</small>
          <b className="num">{Number(c.starts.slice(8, 10))}</b>
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="cal-h" className="text-[16px]">
            {c.stale ? 'Your trip moved — update your calendar' : 'Add the trip to your calendar'}
          </h3>
          <p className="text-[13.5px] text-mute">
            {c.stale
              ? 'The .ics file replaces the old event in Apple, Outlook and Google (import it). A Google link would add a second one.'
              : `All-day, ${dayRange(c.starts, c.ends)}, at ${c.location}. A date change updates the same event.`}
          </p>
        </div>
        {c.addedAt && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-chip bg-ok-soft px-2.5 py-0.5 text-[12px] font-bold text-ok">
            <Check className="size-3.5" aria-hidden /> Added
          </span>
        )}
      </div>
      <CalendarButtons googleUrl={c.googleUrl} icsUrl={c.icsUrl} onClick={clicked} />
    </section>
  );
}
