import type { ReactNode } from 'react';
import {
  CHANNEL_LABELS,
  inr,
  lakh,
  monthLabel,
  monthLong,
  pct,
  shortDay,
  type ReportDeparture,
  type ReportSection,
  type Reports,
  type TileSection,
} from '@/lib/admin/reports';
import {
  Columns,
  DataTable,
  Empty,
  HBars,
  MiniBars,
  MiniSplit,
  PairBars,
  type Cell,
} from './charts';

/**
 * The nine sections of the cockpit (mockup Reports B): each one's tile, its facts, its chart and
 * table (the same numbers as its CSV), and two or three plain sentences under "What it says".
 * Everything here is arithmetic on the api's one payload — no fetching.
 */

export type Section = {
  id: TileSection;
  title: string;
  tile: { value: string; sub: string; mini: ReactNode };
  facts: [string, string][];
  chart: ReactNode;
  table: ReactNode;
  story: string[];
  csv: ReportSection[];
};

const n = (v: number) => v.toLocaleString('en-IN');
const plural = (count: number, one: string, many = `${one}s`) =>
  `${n(count)} ${count === 1 ? one : many}`;

const SOURCE_WORDS = { deal: 'Deal', early_bird: 'Early-bird', coupon: 'Coupon', manual: 'Manual' };

function money(r: Reports): Section {
  const m = r.money;
  const months = m.months;
  const crosses =
    months.length > 0 && months[0]!.month.slice(0, 4) !== months.at(-1)!.month.slice(0, 4);
  const busiest = months.reduce(
    (best, x) => (x.bookedPaise > best.bookedPaise ? x : best),
    months[0]!,
  );
  const cash = m.cash;
  const story = [
    `${inr(m.bookedPaise)} booked on ${plural(r.kpis.bookings, 'booking')} departing in this range.`,
    `${inr(m.collectedPaise)} collected and ${inr(m.refundedPaise)} refunded, so ${inr(m.netPaise)} stayed — ${inr(m.gstPaise)} of it GST.`,
  ];
  if (m.balancePaise)
    story.push(
      `${inr(m.balancePaise)} is still due on ${plural(m.balanceBookings, 'deposit booking')}.`,
    );
  if (busiest?.bookedPaise)
    story.push(
      `The busiest departure month is ${monthLong(busiest.month)} at ${lakh(busiest.bookedPaise)}.`,
    );
  return {
    id: 'money',
    title: 'Money',
    tile: {
      value: lakh(m.bookedPaise),
      sub: `booked · ${lakh(m.netPaise)} net after refunds`,
      mini: <MiniBars values={months.slice(-12).map((x) => x.bookedPaise)} />,
    },
    facts: [
      ['Booked', inr(m.bookedPaise)],
      ['Collected', inr(m.collectedPaise)],
      ['Refunded', inr(m.refundedPaise)],
      ['Net', inr(m.netPaise)],
      ['GST in net (5%)', inr(m.gstPaise)],
      ['Balances due', inr(m.balancePaise)],
    ],
    chart: (
      <div className="grid gap-4">
        <PairBars
          label="Booked and net by departure month"
          names={['Booked', 'Net after refunds']}
          data={months.map((x) => ({
            label: monthLabel(x.month, crosses),
            title: `Departing ${monthLong(x.month)}`,
            a: x.bookedPaise,
            b: x.netPaise,
          }))}
          format={inr}
          tick={lakh}
        />
        <div className="grid gap-2 rounded-xl bg-bg2 p-3">
          <p className="text-[11px] font-extrabold tracking-[.12em] text-mute uppercase">
            Cash this period · by payment and refund date
          </p>
          <dl className="grid grid-cols-3 gap-2 text-sm">
            {(
              [
                ['Payments in', cash.inPaise],
                ['Refunds out', cash.outPaise],
                ['Net', cash.netPaise],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-mute">{k}</dt>
                <dd className="font-bold tabular-nums">{inr(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    ),
    table: (
      <DataTable
        caption="Money by departure month"
        head={[
          'Departs',
          'Bookings',
          'Booked',
          'Collected',
          'Refunded',
          'Net',
          'GST',
          'Balance due',
        ]}
        numeric={[1, 2, 3, 4, 5, 6, 7]}
        rows={months.map((x) => [
          monthLabel(x.month, true),
          x.bookings,
          inr(x.bookedPaise),
          inr(x.collectedPaise),
          inr(x.refundedPaise),
          inr(x.netPaise),
          inr(x.gstPaise),
          inr(x.balancePaise),
        ])}
        total={[
          'Total',
          r.kpis.bookings,
          inr(m.bookedPaise),
          inr(m.collectedPaise),
          inr(m.refundedPaise),
          inr(m.netPaise),
          inr(m.gstPaise),
          inr(m.balancePaise),
        ]}
      />
    ),
    story,
    csv: ['money', 'cash'],
  };
}

function packages(r: Reports): Section {
  const p = r.packages;
  const sold = p.filter((x) => x.bookings > 0);
  const top = sold[0];
  const filled = p.filter((x) => x.seatsTotal > 0);
  const lowest = filled.reduce<(typeof filled)[number] | undefined>(
    (lo, x) => (!lo || x.seatsSold / x.seatsTotal < lo.seatsSold / lo.seatsTotal ? x : lo),
    undefined,
  );
  const story = top
    ? [
        `${top.name} booked the most: ${lakh(top.bookedPaise)} from ${plural(top.bookings, 'booking')}.`,
        ...(lowest
          ? [
              `${lowest.name} has the most room: ${pct(lowest.seatsSold, lowest.seatsTotal)} of its seats sold.`,
            ]
          : []),
      ]
    : ['No package has a booking departing in this range yet.'];
  return {
    id: 'packages',
    title: 'Packages',
    tile: {
      value: top ? top.name : '—',
      sub: top
        ? `top · ${lakh(top.bookedPaise)} of ${plural(sold.length, 'package')}`
        : 'no bookings yet',
      mini: (
        <MiniBars
          values={sold
            .slice(0, 8)
            .map((x) => x.bookedPaise)
            .reverse()}
        />
      ),
    },
    facts: [
      ['Packages booked', n(sold.length)],
      ['Top package', top ? lakh(top.bookedPaise) : '—'],
      ['Seats filled', pct(r.kpis.seatsSold, r.kpis.seatsTotal)],
    ],
    chart: (
      <HBars
        label="Booked by package"
        name="Booked"
        data={sold.slice(0, 10).map((x) => ({
          label: x.name,
          value: x.bookedPaise,
          text: lakh(x.bookedPaise),
          note: `${plural(x.bookings, 'booking')} · ${pct(x.seatsSold, x.seatsTotal)} full`,
        }))}
      />
    ),
    table: (
      <DataTable
        caption="Packages"
        head={[
          'Package',
          'Bookings',
          'Travellers',
          'Booked',
          'Net',
          'Departures',
          'Seats sold',
          'Fill',
        ]}
        numeric={[1, 2, 3, 4, 5, 6, 7]}
        rows={p.map((x) => [
          x.name,
          x.bookings,
          x.travellers,
          inr(x.bookedPaise),
          inr(x.netPaise),
          x.departures,
          `${x.seatsSold}/${x.seatsTotal}`,
          pct(x.seatsSold, x.seatsTotal),
        ])}
        total={[
          'Total',
          r.kpis.bookings,
          r.kpis.travellers,
          inr(r.kpis.bookedPaise),
          inr(r.kpis.netPaise),
          r.kpis.departures,
          `${r.kpis.seatsSold}/${r.kpis.seatsTotal}`,
          pct(r.kpis.seatsSold, r.kpis.seatsTotal),
        ]}
      />
    ),
    story,
    csv: ['packages'],
  };
}

function FillRow({ d }: { d: ReportDeparture }) {
  const sold = (d.sold * 100) / Math.max(d.seatsTotal, 1);
  const held = (d.held * 100) / Math.max(d.seatsTotal, 1);
  return (
    <li className="grid gap-1.5 rounded-xl border border-line bg-bg px-3 py-2.5">
      <span className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <b className="font-bold text-ink">{d.packageName}</b>
        <span className="text-mute">{shortDay(d.date)}</span>
        <span className="ml-auto rounded-full bg-warn-soft px-2 py-0.5 text-[11.5px] font-bold text-warn">
          {d.daysToGo === 0 ? 'today' : `${d.daysToGo} days to go`}
        </span>
      </span>
      <span
        className="flex h-2 overflow-hidden rounded-full"
        style={{ background: 'var(--rtrack)' }}
        role="img"
        aria-label={`${d.sold} of ${d.seatsTotal} seats sold, ${d.held} held`}
      >
        <i className="rpt-grow-x" style={{ width: `${sold}%`, background: 'var(--c1)' }} />
        <i className="rpt-grow-x" style={{ width: `${held}%`, background: 'var(--c2)' }} />
      </span>
      <span className="text-xs text-mute tabular-nums">
        {d.sold}/{d.seatsTotal} sold{d.held ? ` · ${d.held} held` : ''} · {d.free} free
      </span>
    </li>
  );
}

function occupancy(r: Reports): Section {
  const o = r.occupancy;
  const flagged = new Set(o.emptiest.map((d) => d.departureId));
  const pastSold = o.past.reduce((s, x) => s + x.seatsSold, 0);
  const pastTotal = o.past.reduce((s, x) => s + x.seatsTotal, 0);
  const worst = o.emptiest[0];
  return {
    id: 'occupancy',
    title: 'Occupancy',
    tile: {
      value: pct(r.kpis.seatsSold, r.kpis.seatsTotal),
      sub: `seats sold · ${plural(o.emptiest.length, 'date')} to fill soon`,
      mini: (
        <MiniSplit a={r.kpis.seatsSold} b={Math.max(r.kpis.seatsTotal - r.kpis.seatsSold, 0)} />
      ),
    },
    facts: [
      ['Seats sold', `${n(r.kpis.seatsSold)} of ${n(r.kpis.seatsTotal)}`],
      ['Upcoming departures', n(o.upcoming.length)],
      ['Past fill', pct(pastSold, pastTotal)],
    ],
    chart: (
      <div className="grid gap-4">
        <section className="grid gap-2">
          <h3 className="text-[11px] font-extrabold tracking-[.12em] text-mute uppercase">
            Emptiest in the next 60 days
          </h3>
          {o.emptiest.length ? (
            <ul className="grid gap-2">
              {o.emptiest.map((d) => (
                <FillRow key={d.departureId} d={d} />
              ))}
            </ul>
          ) : (
            <Empty>Every live date in the next 60 days is comfortably full.</Empty>
          )}
        </section>
        {o.past.length > 0 && (
          <section className="grid gap-2">
            <h3 className="text-[11px] font-extrabold tracking-[.12em] text-mute uppercase">
              Past fill by package
            </h3>
            <HBars
              label="Past fill by package"
              name="Seats sold"
              data={o.past.map((x) => ({
                label: x.name,
                value: x.seatsTotal ? x.seatsSold / x.seatsTotal : 0,
                text: pct(x.seatsSold, x.seatsTotal),
                note: `${x.seatsSold}/${x.seatsTotal} seats · ${plural(x.departures, 'departure')}`,
              }))}
            />
          </section>
        )}
      </div>
    ),
    table: (
      <div className="grid gap-4">
        <DataTable
          caption="Upcoming departures"
          head={['Package', 'Departs', 'Seats', 'Sold', 'Held', 'Free', 'Fill', '']}
          numeric={[2, 3, 4, 5, 6]}
          rows={o.upcoming.map((d) => [
            d.packageName,
            shortDay(d.date),
            d.seatsTotal,
            d.sold,
            d.held,
            d.free,
            pct(d.sold, d.seatsTotal),
            flagged.has(d.departureId) ? 'Emptiest' : '',
          ])}
        />
        <DataTable
          caption="Past fill by package"
          head={['Package (past)', 'Departures', 'Seats', 'Sold', 'Fill']}
          numeric={[1, 2, 3, 4]}
          rows={o.past.map((x) => [
            x.name,
            x.departures,
            x.seatsTotal,
            x.seatsSold,
            pct(x.seatsSold, x.seatsTotal),
          ])}
        />
      </div>
    ),
    story: [
      `${pct(r.kpis.seatsSold, r.kpis.seatsTotal)} of the seats on this range's ${plural(r.kpis.departures, 'departure')} are sold.`,
      worst
        ? `${worst.packageName} on ${shortDay(worst.date)} needs the most help: ${worst.sold} of ${worst.seatsTotal} sold, ${worst.daysToGo} days to go.`
        : 'Nothing in the next 60 days needs a push.',
    ],
    csv: ['occupancy'],
  };
}

function funnel(r: Reports): Section {
  const f = r.funnel;
  const stages: [string, number][] = [
    ['Package views', f.views],
    ['Package enquiries', f.enquiries],
    ['Holds started (web)', f.holds],
    ['Paid', f.paid],
  ];
  const best = f.packages
    .filter((p) => p.views >= 50)
    .reduce<(typeof f.packages)[number] | undefined>(
      (b, p) => (!b || p.paid / p.views > b.paid / b.views ? p : b),
      undefined,
    );
  return {
    id: 'funnel',
    title: 'Funnel',
    tile: {
      value: pct(f.paid, f.views),
      sub: `views → paid · ${n(f.paid)} of ${n(f.holds)} holds paid`,
      mini: <MiniSplit a={f.paid} b={Math.max(f.holds - f.paid, 0)} />,
    },
    facts: [
      ['Views', n(f.views)],
      ['Holds paid', pct(f.paid, f.holds)],
      ['Enquiries per 100 views', f.views ? ((f.enquiries * 100) / f.views).toFixed(1) : '—'],
    ],
    chart: (
      <div className="grid gap-4">
        <ol className="grid gap-2 sm:grid-cols-4" aria-label="Funnel stages">
          {stages.map(([label, v], i) => (
            <li
              key={label}
              className="grid gap-0.5 rounded-xl border border-line bg-bg px-3 py-2.5"
            >
              <span className="text-xs font-semibold text-mute">{label}</span>
              <b className="text-xl font-extrabold tracking-tight tabular-nums">{n(v)}</b>
              {i > 0 && (
                <span className="text-xs text-ink2 tabular-nums">
                  {i === 2
                    ? `${pct(v, f.views)} of views`
                    : `${pct(v, stages[i - 1]![1])} of the step before`}
                </span>
              )}
            </li>
          ))}
        </ol>
        <p className="text-xs text-mute">
          Enquiries and holds are two parallel paths, not steps — counted on the day they happened.
          Counter bookings show under Channels.
        </p>
        <h3 className="text-[11px] font-extrabold tracking-[.12em] text-mute uppercase">
          Web holds paid, by package
        </h3>
        <HBars
          label="Holds paid by package"
          name="Holds paid"
          data={f.packages
            .filter((p) => p.holds > 0)
            .sort((a, b) => b.paid / b.holds - a.paid / a.holds)
            .slice(0, 8)
            .map((p) => ({
              label: p.name,
              value: p.paid / p.holds,
              text: pct(p.paid, p.holds),
              note: `${p.paid} of ${p.holds} holds · ${n(p.views)} views`,
            }))}
        />
      </div>
    ),
    table: (
      <DataTable
        caption="Funnel by package"
        head={['Package', 'Views', 'Enquiries', 'Holds', 'Paid', 'Views → paid']}
        numeric={[1, 2, 3, 4, 5]}
        rows={f.packages.map((p) => [
          p.name,
          n(p.views),
          p.enquiries,
          p.holds,
          p.paid,
          pct(p.paid, p.views),
        ])}
        total={['Total', n(f.views), f.enquiries, f.holds, f.paid, pct(f.paid, f.views)]}
      />
    ),
    story: [
      `${n(f.views)} package views brought ${plural(f.enquiries, 'enquiry', 'enquiries')} and ${plural(f.holds, 'web hold')}; ${n(f.paid)} of those holds were paid (${pct(f.paid, f.holds)}).`,
      ...(best
        ? [`${best.name} turns views into payments best: ${pct(best.paid, best.views)}.`]
        : []),
    ],
    csv: ['funnel'],
  };
}

function cancellations(r: Reports): Section {
  const c = r.cancellations;
  const top = c.reasons[0];
  const never = c.lapsed.reduce((s, x) => s + x.bookings, 0);
  return {
    id: 'cancellations',
    title: 'Cancellations',
    tile: {
      value: pct(c.cancelled, c.paidBookings),
      sub: `cancelled after paying · ${lakh(c.refundedPaise)} refunded`,
      mini: <MiniSplit a={c.cancelled} b={Math.max(c.paidBookings - c.cancelled, 0)} />,
    },
    facts: [
      ['Cancelled', `${n(c.cancelled)} of ${n(c.paidBookings)}`],
      ['Refunded', inr(c.refundedPaise)],
      ['Fees kept', inr(c.keptPaise)],
    ],
    chart: (
      <div className="grid gap-4">
        {c.reasons.length ? (
          <HBars
            label="Cancelled after paying, by reason"
            name="Bookings"
            data={c.reasons.map((x) => ({
              label: x.label,
              value: x.bookings,
              text: n(x.bookings),
              note: `${inr(x.refundedPaise)} refunded · ${inr(x.keptPaise)} kept`,
            }))}
          />
        ) : (
          <Empty>No paid booking departing in this range was cancelled.</Empty>
        )}
        {c.lapsed.length > 0 && (
          <p className="text-sm text-ink2">
            <b className="font-bold text-ink">Never paid ({n(never)}): </b>
            {c.lapsed.map((x) => `${x.label} ${n(x.bookings)}`).join(' · ')} — not in the rate.
          </p>
        )}
      </div>
    ),
    table: (
      <DataTable
        caption="Cancellations by reason"
        head={['Reason', 'Group', 'Bookings', 'Refunded', 'Kept']}
        numeric={[2, 3, 4]}
        rows={[
          ...c.reasons.map((x): Cell[] => [
            x.label,
            'After paying',
            x.bookings,
            inr(x.refundedPaise),
            inr(x.keptPaise),
          ]),
          ...c.lapsed.map((x): Cell[] => [x.label, 'Never paid', x.bookings, '', '']),
        ]}
        total={[
          'Cancelled after paying',
          pct(c.cancelled, c.paidBookings),
          c.cancelled,
          inr(c.refundedPaise),
          inr(c.keptPaise),
        ]}
      />
    ),
    story: [
      `${plural(c.cancelled, 'booking')} of ${n(c.paidBookings)} paid ones were cancelled (${pct(c.cancelled, c.paidBookings)}); ${inr(c.refundedPaise)} went back and ${inr(c.keptPaise)} was kept in fees.`,
      ...(top ? [`The most common reason: ${top.label.toLowerCase()} (${n(top.bookings)}).`] : []),
      ...(never ? [`${plural(never, 'hold')} never paid — lapsed or failed.`] : []),
    ],
    csv: ['cancellations'],
  };
}

function discounts(r: Reports): Section {
  const d = r.discounts;
  const ratio = (x: { bookedPaise: number; givenPaise: number }) =>
    x.bookedPaise / Math.max(x.givenPaise, 1);
  const best = d.sources.reduce<(typeof d.sources)[number] | undefined>(
    (b, x) => (!b || ratio(x) > ratio(b) ? x : b),
    undefined,
  );
  return {
    id: 'discounts',
    title: 'Discounts',
    tile: {
      value: lakh(d.givenPaise),
      sub: `given · ${pct(d.discountedBookings, d.bookings)} of bookings discounted`,
      mini: (
        <MiniBars
          values={d.sources
            .slice(0, 6)
            .map((x) => x.givenPaise)
            .reverse()}
        />
      ),
    },
    facts: [
      ['Given', inr(d.givenPaise)],
      ['Bookings discounted', `${n(d.discountedBookings)} of ${n(d.bookings)}`],
      ['Share of booked', pct(d.givenPaise, r.kpis.bookedPaise)],
    ],
    chart: (
      <HBars
        label="Discount given by source"
        name="Given"
        color="c2"
        data={d.sources.map((x) => ({
          label: x.source === 'coupon' ? `Coupon ${x.label}` : x.label,
          value: x.givenPaise,
          text: inr(x.givenPaise),
          note: `${plural(x.bookings, 'booking')} carried it · ₹${ratio(x).toFixed(1)} booked per ₹1`,
        }))}
      />
    ),
    table: (
      <DataTable
        caption="Discounts by source"
        head={['Discount', 'Source', 'Bookings', 'Given', 'Booked', 'Booked per ₹1']}
        numeric={[2, 3, 4, 5]}
        rows={d.sources.map((x) => [
          x.label,
          SOURCE_WORDS[x.source],
          x.bookings,
          inr(x.givenPaise),
          inr(x.bookedPaise),
          `₹${ratio(x).toFixed(1)}`,
        ])}
        total={['Total', '', d.discountedBookings, inr(d.givenPaise), '', '']}
      />
    ),
    story: d.sources.length
      ? [
          `${inr(d.givenPaise)} went out in discounts on ${plural(d.discountedBookings, 'booking')}, ${pct(d.givenPaise, r.kpis.bookedPaise)} of booked.`,
          ...(best
            ? [
                `Bookings that carried ${best.source === 'coupon' ? `coupon ${best.label}` : best.label.toLowerCase()} booked ₹${ratio(best).toFixed(1)} for every ₹1 given — carried, not necessarily caused.`,
              ]
            : []),
        ]
      : ['No booking in this range carried a discount.'],
    csv: ['discounts'],
  };
}

function addons(r: Reports): Section {
  const a = r.addons;
  const top = a.addons[0];
  return {
    id: 'addons',
    title: 'Add-ons',
    tile: {
      value: lakh(a.revenuePaise),
      sub: `${pct(a.withAny, a.bookings)} of bookings took an extra`,
      mini: (
        <MiniBars
          values={a.addons
            .slice(0, 6)
            .map((x) => x.revenuePaise)
            .reverse()}
        />
      ),
    },
    facts: [
      ['Add-on revenue', inr(a.revenuePaise)],
      ['Attach rate', pct(a.withAny, a.bookings)],
      ['Top add-on', top ? top.name : '—'],
    ],
    chart: (
      <HBars
        label="Add-on revenue"
        name="Revenue"
        data={a.addons.slice(0, 10).map((x) => ({
          label: x.name,
          value: x.revenuePaise,
          text: inr(x.revenuePaise),
          note: `${x.bookings} of ${x.eligible} bookings that could (${pct(x.bookings, x.eligible)})`,
        }))}
      />
    ),
    table: (
      <DataTable
        caption="Add-ons"
        head={['Add-on', 'Bookings', 'Offered to', 'Attach', 'Revenue']}
        numeric={[1, 2, 3, 4]}
        rows={a.addons.map((x) => [
          x.name,
          x.bookings,
          x.eligible,
          pct(x.bookings, x.eligible),
          inr(x.revenuePaise),
        ])}
        total={[
          'Any add-on',
          a.withAny,
          a.bookings,
          pct(a.withAny, a.bookings),
          inr(a.revenuePaise),
        ]}
      />
    ),
    story: top
      ? [
          `${plural(a.withAny, 'booking')} of ${n(a.bookings)} added an extra, worth ${inr(a.revenuePaise)} (already inside booked).`,
          `${top.name} earned the most: ${inr(top.revenuePaise)}.`,
        ]
      : ['No booking in this range added an extra.'],
    csv: ['addons'],
  };
}

function channels(r: Reports): Section {
  const all = r.channels;
  const web = all.find((c) => c.channel === 'web')!;
  const counter = all.filter((c) => c.channel !== 'web');
  const cN = counter.reduce((s, c) => s + c.bookings, 0);
  const cR = counter.reduce((s, c) => s + c.bookedPaise, 0);
  const busiest = [...counter].sort((a, b) => b.bookings - a.bookings)[0];
  return {
    id: 'channels',
    title: 'Channels',
    tile: {
      value: pct(web.bookings, r.kpis.bookings),
      sub: `web · the counter added ${plural(cN, 'booking')}`,
      mini: <MiniSplit a={web.bookings} b={cN} />,
    },
    facts: [
      ['Web', plural(web.bookings, 'booking')],
      ['Counter', plural(cN, 'booking')],
      ['Counter booked', lakh(cR)],
    ],
    chart: (
      <HBars
        label="Bookings by channel"
        name="Bookings"
        data={all.map((c) => ({
          label: c.channel === 'web' ? 'Web' : `${CHANNEL_LABELS[c.channel]} (counter)`,
          value: c.bookings,
          text: n(c.bookings),
          note: `${lakh(c.bookedPaise)} · ${plural(c.travellers, 'traveller')}`,
        }))}
      />
    ),
    table: (
      <DataTable
        caption="Bookings by channel"
        head={['Channel', 'Bookings', 'Travellers', 'Booked', 'Share']}
        numeric={[1, 2, 3, 4]}
        rows={all.map((c) => [
          CHANNEL_LABELS[c.channel],
          c.bookings,
          c.travellers,
          inr(c.bookedPaise),
          pct(c.bookings, r.kpis.bookings),
        ])}
        total={[
          'Total',
          r.kpis.bookings,
          r.kpis.travellers,
          inr(r.kpis.bookedPaise),
          r.kpis.bookings ? '100%' : '—',
        ]}
      />
    ),
    story: [
      `Web took ${n(web.bookings)} of ${plural(r.kpis.bookings, 'booking')}; the counter added ${n(cN)}, worth ${lakh(cR)}.`,
      ...(busiest && busiest.bookings > 0
        ? [
            `${CHANNEL_LABELS[busiest.channel]} is the busiest counter channel (${n(busiest.bookings)}).`,
          ]
        : []),
    ],
    csv: ['channels'],
  };
}

function customers(r: Reports): Section {
  const c = r.customers;
  const avg = c.bookings ? (c.travellers / c.bookings).toFixed(1) : '—';
  const ahead = c.lead.slice(2).reduce((s, b) => s + b.bookings, 0);
  const couples = c.party.find((b) => b.label === '2')?.bookings ?? 0;
  return {
    id: 'customers',
    title: 'Customers',
    tile: {
      value: avg,
      sub: `travellers per booking · ${plural(c.repeat, 'repeat booking')}`,
      mini: <MiniBars values={c.party.map((b) => b.bookings)} />,
    },
    facts: [
      ['Travellers', n(c.travellers)],
      ['Average party', avg],
      ['Repeat', `${n(c.repeat)} (${pct(c.repeat, c.bookings)})`],
    ],
    chart: c.bookings ? (
      <div className="grid gap-4 sm:grid-cols-2">
        <section>
          <h3 className="text-[11px] font-extrabold tracking-[.12em] text-mute uppercase">
            Party size
          </h3>
          <Columns
            label="Bookings by party size"
            name="Bookings"
            data={c.party.map((b) => ({ label: b.label, value: b.bookings, text: n(b.bookings) }))}
          />
        </section>
        <section>
          <h3 className="text-[11px] font-extrabold tracking-[.12em] text-mute uppercase">
            Booked ahead
          </h3>
          <Columns
            label="Bookings by days booked ahead"
            name="Bookings"
            data={c.lead.map((b) => ({
              label: b.label.replace(' days', ' d').replace('Under ', '<'),
              value: b.bookings,
              text: n(b.bookings),
            }))}
          />
        </section>
      </div>
    ) : (
      <Empty />
    ),
    table: (
      <DataTable
        caption="Customers"
        head={['Measure', 'Group', 'Bookings', 'Share']}
        numeric={[2, 3]}
        rows={[
          ...c.party.map((b): Cell[] => [
            'Party size',
            b.label,
            b.bookings,
            pct(b.bookings, c.bookings),
          ]),
          ...c.lead.map((b): Cell[] => [
            'Booked ahead',
            b.label,
            b.bookings,
            pct(b.bookings, c.bookings),
          ]),
          ['Customers', 'Repeat', c.repeat, pct(c.repeat, c.bookings)],
          ['Customers', 'First trip', c.first, pct(c.first, c.bookings)],
        ]}
      />
    ),
    story: c.bookings
      ? [
          `${n(couples)} of ${plural(c.bookings, 'booking')} were for two; the average party was ${avg} travellers.`,
          `${pct(ahead, c.bookings)} booked a month or more ahead, and ${plural(c.repeat, 'booking')} came from returning customers.`,
        ]
      : ['No bookings in this range yet.'],
    csv: ['customers'],
  };
}

export function buildSections(r: Reports): Record<TileSection, Section> {
  return {
    money: money(r),
    packages: packages(r),
    occupancy: occupancy(r),
    funnel: funnel(r),
    cancellations: cancellations(r),
    discounts: discounts(r),
    addons: addons(r),
    channels: channels(r),
    customers: customers(r),
  };
}
