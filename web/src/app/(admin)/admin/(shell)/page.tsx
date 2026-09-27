import { ArrowRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { Children, type ReactNode } from 'react';
import { PageHead } from '@/components/admin/PageHead';
import { istFullDate, istTime } from '@/components/admin/enquiries/ist-date';
import { Panel } from '@/components/admin/dashboard/Panel';
import { CashDesk } from '@/components/admin/money/CashDesk';
import { RefundMadeButton } from '@/components/admin/money/RefundMadeButton';
import { buttonVariants } from '@/components/ui/button';
import { greeting, waited } from '@/lib/admin/dashboard';
import { api } from '@/lib/api';
import { getSession } from '@/lib/auth/session';
import { formatDate, inr, MONTHS } from '@/lib/format';

export const metadata = { title: 'Dashboard' };

const booking = (ref: string) => `/admin/bookings/${ref}`;

/**
 * Dashboard C · Money desk (R59, P20): the month's cash equation, cash by day, then what is
 * coming in, going out and at risk — from `GET /admin/money`. The enquiry pipeline and
 * moderation queue stay one tap away in the strip at the top (`GET /admin/dashboard`).
 * v2.5 adds balances due (P5) to "Coming in" and channels (P18) when those rows ship.
 */
export default async function AdminHome() {
  const [session, data, money] = await Promise.all([
    getSession(),
    api('/admin/dashboard', { auth: true }),
    api('/admin/money', { auth: true }),
  ]);
  const firstName = (session?.user.name ?? 'there').split(' ')[0];
  const month = MONTHS[Number(money.monthStart.slice(5, 7)) - 1];

  return (
    <>
      <PageHead
        title={`${greeting()}, ${firstName}.`}
        subtitle={`Money · ${month} so far, in rupees and IST · ${formatDate(data.today)}`}
        actions={
          <Link href="/admin/packages/new" className={buttonVariants({ size: 'sm' })}>
            <Plus className="size-4" aria-hidden />
            New package
          </Link>
        }
      />

      <nav aria-label="Also waiting" className="flex flex-wrap gap-2">
        <Waiting href="/admin/enquiries?status=new" n={data.awaitingFirstCall}>
          {data.awaitingFirstCall === 1 ? 'enquiry' : 'enquiries'} awaiting a first call
          {data.oldestNewAt && ` · oldest ${waited(data.oldestNewAt)}`}
        </Waiting>
        <Waiting href="/admin/reviews" n={data.reviewsPending}>
          {data.reviewsPending === 1 ? 'review' : 'reviews'} to moderate
        </Waiting>
        <Waiting href="/admin/bookings" n={data.upcomingDeparturesTotal}>
          {data.upcomingDeparturesTotal === 1 ? 'departure' : 'departures'} in the next 30 days
        </Waiting>
      </nav>

      <CashDesk money={money} />

      <div className="grid items-start gap-3.5 lg:grid-cols-3">
        <Panel title="Coming in" sub="· live checkouts">
          <List empty="No checkout is open right now.">
            {money.holds.map((h) => (
              <Row
                key={h.ref}
                href={booking(h.ref)}
                who={h.name}
                what={`Checkout open till ${istTime(h.holdExpiresAt)} · ${h.packageName} · ${formatDate(h.departs)}`}
                amount={<span className="text-mute">{inr(h.totalPaise)}</span>}
              />
            ))}
          </List>
          <Foot label="Held, not yet paid" value={inr(money.holdsPaise)} />
        </Panel>

        <Panel title="Going out" sub="· refunds">
          <List empty="No refund to send.">
            {money.owed.map((o) => (
              <Row
                key={o.ref}
                href={booking(o.ref)}
                who={o.name}
                what={`${o.ref} · ${o.why}`}
                amount={<span className="text-bad">{inr(o.amountPaise)}</span>}
                action={
                  <>
                    <RefundMadeButton
                      bookingRef={o.ref}
                      amountPaise={o.offline ? o.amountPaise : o.amountPaise - o.offlinePaise}
                      offline={o.offline}
                    />
                    <span className="self-center text-[12px] text-mute">
                      {o.offline ? 'Hand it back first' : 'Goes back through Razorpay'}
                    </span>
                  </>
                }
              />
            ))}
            {money.refunded.slice(0, 3).map((r) => (
              <Row
                key={`${r.ref}-${r.at}`}
                href={booking(r.ref)}
                who={r.name}
                what={`Refunded ${istFullDate(r.at)} · ${r.ref}`}
                amount={<span className="text-mute">{inr(r.amountPaise)}</span>}
              />
            ))}
          </List>
          <Foot
            label="Still to send"
            value={money.toRecordPaise ? inr(money.toRecordPaise) : 'Nothing'}
            tone={money.toRecordPaise ? 'text-bad' : 'text-ok'}
          />
        </Panel>

        <Panel title="At risk">
          <List empty="Nothing at risk — no open requests, no lapsed holds.">
            {money.atRisk.map((r) => (
              <Row
                key={`${r.kind}-${r.ref}`}
                href={booking(r.ref)}
                who={`${r.name} · ${r.kind === 'cancellation' ? 'cancel request' : 'hold lapsed'}`}
                what={`${r.text} · departs ${formatDate(r.departs)}`}
                amount={
                  <span className={r.kind === 'cancellation' ? 'text-warn' : 'text-mute'}>
                    {r.kind === 'cancellation' ? '−' : ''}
                    {inr(r.amountPaise)}
                  </span>
                }
              />
            ))}
          </List>
        </Panel>
      </div>
    </>
  );
}

function Waiting({ href, n, children }: { href: string; n: number; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2 rounded-card border border-line bg-bg px-3.5 py-2 text-[13px] font-semibold text-ink2 no-underline transition-colors hover:border-ink"
    >
      <b className={`num text-[15px] ${n ? 'text-ink' : 'text-mute'}`}>{n}</b>
      <span>{children}</span>
      <ArrowRight
        className="size-3.5 text-mute transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
}

function List({ empty, children }: { empty: string; children: ReactNode }) {
  const rows = Children.toArray(children);
  return (
    <div className="grid px-4 pt-1">
      {rows.length ? rows : <p className="py-3 text-[13px] text-mute">{empty}</p>}
    </div>
  );
}

function Row({
  href,
  who,
  what,
  amount,
  action,
}: {
  href: string;
  who: string;
  what: string;
  amount: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-1 border-t border-line py-3 text-[13.5px] first:border-0">
      <Link href={href} className="min-w-0 text-ink no-underline hover:text-primary">
        <b className="block">{who}</b>
        <small className="block text-[12px] break-words text-mute">{what}</small>
      </Link>
      <b className="num self-center text-right">{amount}</b>
      {action && <div className="col-span-2 flex flex-wrap gap-1.5">{action}</div>}
    </div>
  );
}

function Foot({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="mx-4 mt-1 mb-4 flex justify-between border-t-2 border-ink pt-2.5 font-extrabold">
      <span>{label}</span>
      <span className={`num ${tone ?? ''}`}>{value}</span>
    </div>
  );
}
