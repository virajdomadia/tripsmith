import { Pencil, X } from 'lucide-react';
import Link from 'next/link';
import { istShortDate, istTime } from '@/components/admin/enquiries/ist-date';
import { Chip } from '@/components/admin/enquiries/InboxList';
import { Thumb } from '@/components/admin/reviews/ReviewQueue';
import { buttonVariants } from '@/components/ui/button';
import {
  boardHref,
  datesLabel,
  dmy,
  tripsLabel,
  type CouponResults,
} from '@/lib/admin/coupon-board';
import { type AdminCoupon, couponTerms } from '@/lib/admin/coupon-schema';
import { istDay } from '@/lib/account';
import { lakh } from '@/lib/admin/money';
import { inr } from '@/lib/format';
import { cn } from '@/lib/utils';

const H4 = 'label-caps mb-2.5 text-[11px] text-mute';

/**
 * Mockup Coupons B's "what it did", opened under the ticket picked (`?sel=`): what the bookings
 * came to, the trips the code sold and its latest uses, with checkouts holding one now. Website
 * vs counter arrives with the counter booking row (P18); until then every use is the website's.
 */
export function CouponInsight({
  c,
  results,
  today,
}: {
  c: AdminCoupon;
  results: CouponResults | null;
  today: string;
}) {
  const max = Math.max(1, ...(results?.trips.map((t) => t.uses) ?? []));
  const any = !!results && (results.trips.length > 0 || results.latest.length > 0);
  return (
    <section
      id="did"
      aria-label={`What ${c.code} did`}
      className="animate-rise col-span-full grid min-w-0 scroll-mt-4 gap-4 rounded-card border border-primary bg-bg px-5 py-[18px]"
    >
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-[1_1_320px]">
          <h3 className="text-[18px] font-extrabold tracking-tight">
            <span className="font-mono">{c.code}</span> · what it did
          </h3>
          <p className="mt-0.5 text-[13px] text-mute">
            {couponTerms(c)} · {tripsLabel(c)}
            {c.minPaise ? ` · on ${inr(c.minPaise)} or more` : ''} · {datesLabel(c)} · once per
            email
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Link
            href={`/admin/coupons/${c.id}`}
            className={buttonVariants({ size: 'sm', variant: 'outline' })}
          >
            <Pencil className="size-3.5" aria-hidden />
            Edit terms
          </Link>
          <Link
            href={boardHref()}
            scroll={false}
            className={buttonVariants({ size: 'sm', variant: 'ghost' })}
          >
            <X className="size-3.5" aria-hidden />
            Close
          </Link>
        </div>
      </header>
      {!any ? (
        <p className="rounded-card border border-dashed border-line p-6 text-center text-sm text-mute">
          {c.state === 'scheduled'
            ? `No uses yet. It opens on ${dmy(c.startsOn)} for ${tripsLabel(c)}; the first captured payment shows up here.`
            : 'No uses yet — the first captured payment shows up here.'}
        </p>
      ) : (
        <div className="grid gap-[22px] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)]">
          <div className="min-w-0">
            <h4 className={H4}>What the bookings came to</h4>
            <dl className="grid gap-2 text-[13.5px]">
              {(
                [
                  ['Bookings with the code', String(c.uses)],
                  ['Bookings value, after the code', lakh(c.bookedPaise)],
                  ['Given back', inr(c.givenPaise)],
                  [
                    'Average given back',
                    c.uses ? inr(Math.round(c.givenPaise / c.uses / 100) * 100) : '—',
                  ],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex flex-wrap justify-between gap-x-3">
                  <dt className="text-mute">{k}</dt>
                  <dd className="num font-bold">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2.5 text-[12px] text-mute">
              Website vs counter: with counter booking, a later row.
            </p>
          </div>
          <div className="min-w-0">
            <h4 className={H4}>Trips it sold</h4>
            {results!.trips.length ? (
              <ol className="grid gap-2.5">
                {results!.trips.map((t) => (
                  <li
                    key={t.packageId}
                    className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2.5 text-[13px]"
                  >
                    <Thumb src={t.coverUrl} className="h-8 w-11 rounded-md" />
                    <span className="grid min-w-0 gap-1">
                      <span className="truncate">{t.name}</span>
                      <span aria-hidden className="block h-[5px] rounded-full bg-bg2">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${Math.round((t.uses / max) * 100)}%` }}
                        />
                      </span>
                    </span>
                    <b className="num text-[15px]">{t.uses}</b>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[13px] text-mute">No paid trips yet.</p>
            )}
            {results!.otherTripUses > 0 && (
              <p className="mt-2 text-[12.5px] text-mute">
                +{results!.otherTripUses} on other trips
              </p>
            )}
          </div>
          <div className="min-w-0">
            <h4 className={H4}>Latest uses</h4>
            <ol className="grid gap-2.5">
              {results!.latest.map((u) => {
                const day = istDay(u.at) === today ? 'Today' : istShortDate(u.at);
                return (
                  <li
                    key={u.ref}
                    className="grid grid-cols-[84px_minmax(0,1fr)] gap-2.5 text-[13px]"
                  >
                    <span className="text-[12px] font-bold text-mute">
                      {day} {istTime(u.at)}
                    </span>
                    <span className="grid min-w-0 gap-0.5">
                      <span>
                        <Chip tone={u.holding ? 'warn' : 'info'}>
                          {u.holding ? 'In checkout' : 'Website'}
                        </Chip>
                      </span>
                      <span className={cn('break-words', u.holding && 'text-mute')}>
                        {u.email} · {u.packageName} · {u.travellers}{' '}
                        {u.travellers === 1 ? 'traveller' : 'travellers'}
                        {u.holding ? (
                          ' · holding one use until paid'
                        ) : (
                          <>
                            {' '}
                            · <b className="num">−{inr(u.offPaise)}</b>
                          </>
                        )}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}
