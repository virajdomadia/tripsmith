import { ArrowRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { Fragment } from 'react';
import { PageHead } from '@/components/admin/PageHead';
import { CouponInsight } from '@/components/admin/coupons/CouponInsight';
import { CouponTicket } from '@/components/admin/coupons/CouponTicket';
import { Chip } from '@/components/admin/enquiries/InboxList';
import { buttonVariants } from '@/components/ui/button';
import { lanes, needsLook, parseSel, returnBand } from '@/lib/admin/coupon-board';
import { lakh } from '@/lib/admin/money';
import { api, ApiRequestError } from '@/lib/api';
import { inr } from '@/lib/format';

export const metadata = { title: 'Coupons' };

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Coupons B · Campaign board (R26, R59 · P20): every code as a ticket with what it earned,
 * grouped into lanes by what it is doing now; a dark band with all-time ₹ given back against the
 * bookings it came with; a "Needs a look" strip; and "what it did" under the ticket picked
 * (`?sel=`). Create, edit, pause and delete work as before (B15). Everything is counted from
 * bookings by the uses rule — money captured — never stored.
 */
export default async function CouponsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sel = parseSel(await searchParams);
  const [{ items }, results] = await Promise.all([
    api('/admin/coupons', { auth: true }),
    sel ? loadResults(sel) : Promise.resolve(null),
  ]);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const open = items.find((c) => c.id === sel);
  const band = returnBand(items);
  const looks = needsLook(items);
  return (
    <>
      <PageHead
        title="Coupons"
        subtitle={`${items.length} ${items.length === 1 ? 'code' : 'codes'} · a use counts once the payment is captured · click a ticket to see what it did`}
        actions={
          <Link href="/admin/coupons/new" className={buttonVariants({ size: 'sm' })}>
            <Plus className="size-4" aria-hidden />
            New coupon
          </Link>
        }
      />
      {items.length === 0 ? (
        <p className="rounded-card border border-dashed border-line p-8 text-center text-sm text-mute">
          No coupons yet. Create one and customers can type it in the Book-now sheet.
        </p>
      ) : (
        <>
          <section
            aria-label="All codes, all time"
            className="grid items-center gap-x-[22px] gap-y-3.5 rounded-card bg-ink px-[22px] py-[18px] text-white sm:grid-cols-[auto_auto_auto_minmax(0,1fr)]"
          >
            <div className="grid gap-px">
              <span className="text-[12px] font-bold text-ink-soft">Given back</span>
              <b className="num text-[28px] font-extrabold tracking-tight">{inr(band.given)}</b>
              <small className="text-[12px] font-semibold text-ink-soft">
                across {band.uses} {band.uses === 1 ? 'booking' : 'bookings'}
              </small>
            </div>
            <ArrowRight className="size-[22px] text-action max-sm:hidden" aria-hidden />
            <div className="grid gap-px">
              <span className="text-[12px] font-bold text-ink-soft">
                Bookings that came with a code
              </span>
              <b className="num text-[28px] font-extrabold tracking-tight">{lakh(band.booked)}</b>
              <small className="text-[12px] font-semibold text-ink-soft">
                paid, after the discount
              </small>
            </div>
            <div className="grid w-full gap-1.5 sm:max-w-[320px] sm:justify-self-end">
              <span aria-hidden className="block h-2.5 overflow-hidden rounded-full bg-ink-line">
                <span
                  className="block h-full min-w-1 rounded-full bg-action"
                  style={{ width: `${band.share}%` }}
                />
              </span>
              <span className="text-[12.5px] text-ink-soft">
                Discount is <b className="text-white">{band.share.toFixed(1)} %</b> of what those
                trips list at
              </span>
            </div>
          </section>

          {looks.length > 0 && (
            <ul
              aria-label="Needs a look"
              className="flex gap-2 overflow-x-auto pb-0.5 max-sm:[scrollbar-width:none]"
            >
              {looks.map((l) => (
                <li
                  key={`${l.label}-${l.code}`}
                  className="flex flex-none items-center gap-2 rounded-xl border border-line bg-bg px-3 py-2 text-[13px]"
                >
                  <Chip tone={l.tone}>{l.label}</Chip>
                  <span>
                    <b className="font-mono">{l.code}</b> · {l.text}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {lanes(items).map((lane) => (
            <section key={lane.title} aria-label={lane.title} className="grid min-w-0 gap-2.5">
              <h2 className="label-caps flex flex-wrap items-baseline gap-2 text-[12px] text-mute">
                {lane.title}
                <span className="num rounded-chip border border-line bg-bg px-1.5 text-ink2">
                  {lane.items.length}
                </span>
                <small className="text-[12.5px] font-semibold tracking-normal normal-case">
                  {lane.hint}
                </small>
              </h2>
              <div className="grid gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(310px,1fr))]">
                {lane.items.map((c) => (
                  <Fragment key={c.id}>
                    <CouponTicket c={c} today={today} open={c.id === open?.id} />
                    {c.id === open?.id && <CouponInsight c={c} results={results} today={today} />}
                  </Fragment>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}

/** A stale `?sel=` (a deleted coupon) just leaves every ticket closed. */
async function loadResults(id: string) {
  try {
    return await api('/admin/coupons/{id}/results', { auth: true, params: { id } });
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404) return null;
    throw e;
  }
}
