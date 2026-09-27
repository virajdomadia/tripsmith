import { istFullDate, istTime } from '@/components/admin/enquiries/ist-date';
import { byDay, toneOf, type ActivityEntry } from '@/lib/history';

const DOT = {
  ok: 'bg-ok',
  bad: 'bg-bad',
  warn: 'bg-warn',
  primary: 'bg-primary',
  mute: 'bg-line',
} as const;

/**
 * My trips' "Activity" (R54, P16): what happened to this booking, in the customer's words —
 * their money, their requests and the emails we sent them. The api sends only entries written
 * with customer wording; ids, internal flags and owner-only notes never reach this page.
 */
export function Activity({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <section className="rounded-card border border-line p-5" aria-labelledby="activity">
      <h2 id="activity" className="text-[18px]">
        Activity
      </h2>
      <ol className="mt-3 grid gap-3">
        {byDay(entries, istFullDate).map(({ day, entries: list }) => (
          <li key={day} className="grid gap-2">
            <span className="label-caps text-[11px] text-mute">{day}</span>
            <ol className="relative grid gap-2.5 before:absolute before:top-1.5 before:bottom-1.5 before:left-[4.5px] before:w-px before:bg-line">
              {list.map((e, i) => (
                <li key={`${e.at}-${i}`} className="relative grid grid-cols-[10px_1fr] gap-3">
                  <span
                    aria-hidden
                    className={`relative mt-1.5 size-2.5 rounded-full ring-4 ring-bg ${DOT[toneOf(e.kind)]}`}
                  />
                  <div className="min-w-0">
                    <p className="text-[15px] break-words text-ink2">{e.text}</p>
                    <time dateTime={e.at} className="num text-[12.5px] text-mute">
                      {e.approx ? '≈ ' : ''}
                      {istTime(e.at)}
                    </time>
                  </div>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </section>
  );
}
