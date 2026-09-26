import { istFullDate, istTime } from '@/components/admin/enquiries/ist-date';
import type { AdminBooking } from '@/lib/admin/booking-filters';

type Event = AdminBooking['timeline'][number];

const DOT: Record<Event['kind'], string> = {
  booked: 'bg-primary',
  order: 'bg-line',
  captured: 'bg-ok',
  offline: 'bg-ok',
  failed: 'bg-warn',
  refunded: 'bg-bad',
  lapsed: 'bg-line',
  cancelled: 'bg-bad',
  completed: 'bg-ink',
  cancellation: 'bg-warn',
};

/** R22's payment timeline, oldest first — derived by the api from the booking and its payment
 *  rows (there is no event log), so each attempt shows its opening and its final state. */
export function Timeline({ events }: { events: Event[] }) {
  return (
    <ol className="grid gap-3">
      {events.map((e, i) => (
        <li key={`${e.kind}-${i}`} className="grid grid-cols-[12px_1fr] gap-3">
          <span className={`mt-1.5 size-2.5 rounded-full ${DOT[e.kind]}`} aria-hidden />
          <div className="min-w-0">
            <p className="text-sm break-words">{e.text}</p>
            <time dateTime={e.at} className="text-xs text-mute">
              {istFullDate(e.at)} · {istTime(e.at)}
            </time>
          </div>
        </li>
      ))}
    </ol>
  );
}
