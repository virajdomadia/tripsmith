'use client';

import { Check, Info, Link2, Minus, Plus, Search, UserPlus, X } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useId, useState } from 'react';
import { NativeSelect } from '@/components/admin/NativeSelect';
import { AddonMenu } from '@/components/site/booking/MakeItYours';
import { Input } from '@/components/ui/input';
import { adminGet } from '@/lib/admin/client';
import {
  CHANNEL_LABEL,
  COUNTER_CHANNELS,
  METHOD_LABEL,
  REFERENCE_LABEL,
  canAddCounter,
  childAgeError,
  initials,
  newCustomerErrors,
  type CounterPackage,
  type Customer,
  type CustomerMatch,
  type Draft,
  linkAmount,
  linkProblem,
  type Manual,
  type Offer,
  type Method,
  type NewCustomer,
  type Traveller,
} from '@/lib/admin/counter';
import {
  CHILD_MAX_AGE,
  CHILD_MIN_AGE,
  canRemove,
  partySize,
  slotsFor,
  type AddonPicks,
  type Quote,
  type RoomKind,
  type Rooms,
} from '@/lib/booking';
import { formatDate, inr } from '@/lib/format';
import { STATE_NAMES } from '@/lib/gst';
import { cn } from '@/lib/utils';
import { heldUntil } from './LinkPanel';

/* ------------------------------------------------------------- controls */

function Seg<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'inline-flex flex-wrap overflow-hidden rounded-[10px] border-[1.5px] border-line',
        className,
      )}
    >
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          aria-pressed={v === value}
          onClick={() => onChange(v)}
          className={cn(
            'px-3 py-1.5 text-[13.5px] font-bold transition-colors [&+&]:border-l-[1.5px] [&+&]:border-line',
            v === value ? 'bg-ink text-bg' : 'text-ink2 hover:bg-bg2',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function Stepper({
  label,
  value,
  canLess,
  canMore,
  onStep,
}: {
  label: string;
  value: number;
  canLess: boolean;
  canMore: boolean;
  onStep: (by: 1 | -1) => void;
}) {
  const btn =
    'grid size-10 place-items-center transition-colors hover:bg-bg2 disabled:cursor-default disabled:text-[#c3c9cf] disabled:hover:bg-transparent';
  return (
    <div className="inline-flex items-center overflow-hidden rounded-[10px] border-[1.5px] border-line">
      <button
        type="button"
        aria-label={`Fewer: ${label}`}
        disabled={!canLess}
        onClick={() => onStep(-1)}
        className={btn}
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <output
        aria-live="polite"
        aria-label={label}
        className="num min-w-8 text-center font-extrabold"
      >
        {value}
      </output>
      <button
        type="button"
        aria-label={`More: ${label}`}
        disabled={!canMore}
        onClick={() => onStep(1)}
        className={btn}
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 flex items-start gap-1.5 text-[12.5px] text-mute">
      <Info className="mt-0.5 size-3.5 flex-none" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

const field = 'grid gap-1 text-[13px]';
const labelCls = 'text-xs font-bold text-mute';

/* ------------------------------------------------------------------ 1 trip */

export function TripStep({
  packages,
  packageId,
  onPackage,
  departureId,
  onDeparture,
}: {
  packages: CounterPackage[];
  packageId: string | null;
  onPackage: (id: string) => void;
  departureId: string | null;
  onDeparture: (id: string) => void;
}) {
  const pkg = packages.find((p) => p.id === packageId) ?? null;
  return (
    <div className="grid gap-3.5">
      <div className="grid gap-3 rounded-[14px] border border-line p-3 sm:grid-cols-[84px_minmax(0,1fr)_minmax(0,260px)] sm:items-center">
        <span className="relative hidden h-16 w-[84px] overflow-hidden rounded-[10px] bg-bg2 sm:block">
          {pkg?.coverUrl && (
            <Image src={pkg.coverUrl} alt="" fill sizes="84px" className="object-cover" />
          )}
        </span>
        <div className="min-w-0">
          <b className="block truncate">{pkg?.name ?? 'Pick a package'}</b>
          {pkg && (
            <small className="text-[12.5px] text-mute">
              {pkg.destination} · {pkg.nights} nights ·{' '}
              {pkg.departures.length
                ? `${pkg.departures.length} departure${pkg.departures.length === 1 ? '' : 's'} ahead`
                : 'no departures ahead'}
            </small>
          )}
        </div>
        <label className={field}>
          <span className="sr-only">Package</span>
          <NativeSelect value={packageId ?? ''} onChange={(e) => onPackage(e.target.value)}>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>
      {pkg && pkg.departures.length === 0 && (
        <p className="text-[13px] font-bold text-warn">
          No departures ahead on this package — add one on the package first.
        </p>
      )}
      <div role="group" aria-label="Departure" className="grid gap-2.5 sm:grid-cols-2">
        {pkg?.departures.map((d) => {
          const booked = d.seatsTotal - d.seatsLeft;
          const off = d.onRequest || d.seatsLeft <= 0;
          const on = d.id === departureId;
          return (
            <button
              key={d.id}
              type="button"
              aria-pressed={on}
              disabled={off}
              onClick={() => onDeparture(d.id)}
              className={cn(
                'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 rounded-[14px] border-[1.5px] border-line px-4 py-3.5 text-left transition-[border-color,box-shadow] hover:border-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line',
                on &&
                  'border-primary bg-primary-soft/40 shadow-[inset_0_0_0_1px_var(--color-primary)]',
              )}
            >
              <span className="min-w-0">
                <b className="block">{formatDate(d.date)}</b>
                <small className="text-[12px] text-mute">
                  {booked} of {d.seatsTotal} booked
                </small>
              </span>
              <span className="text-right">
                <b className="num block">{d.onRequest ? 'On request' : inr(d.priceDoublePaise)}</b>
                {!d.onRequest && <small className="text-[12px] text-mute">per adult, twin</small>}
              </span>
              <span aria-hidden className="col-span-2 h-1.5 overflow-hidden rounded-full bg-bg2">
                <i
                  className="ctr-meter block h-full rounded-full bg-primary"
                  style={{
                    width: `${d.seatsTotal ? Math.round((booked / d.seatsTotal) * 100) : 0}%`,
                  }}
                />
              </span>
              <span
                className={cn(
                  'num col-span-2 text-[12.5px] font-bold',
                  d.seatsLeft <= 4 ? 'text-warn' : 'text-ink2',
                )}
              >
                {d.seatsLeft} left
              </span>
            </button>
          );
        })}
      </div>
      <Hint>
        The counter can book until the morning of departure; the website closes 2 days before.
      </Hint>
    </div>
  );
}

/* ----------------------------------------------------------------- 2 party */

const ROOMS: { kind: RoomKind; title: string; hint: string }[] = [
  { kind: 'double', title: 'Double rooms', hint: '2 adults, twin sharing' },
  { kind: 'triple', title: 'Triple rooms', hint: '3 adults, with an extra bed' },
  { kind: 'single', title: 'Single rooms', hint: '1 adult, with a supplement' },
  {
    kind: 'children',
    title: `Children ${CHILD_MIN_AGE}–${CHILD_MAX_AGE}`,
    hint: 'Share a room, child rate',
  },
];

export function PartyStep({
  rooms,
  names,
  seatsLeft,
  date,
  onRooms,
  onNames,
}: {
  rooms: Rooms;
  names: Record<string, Traveller>;
  seatsLeft: number | null;
  date: string | null;
  onRooms: (r: Rooms) => void;
  onNames: (n: Record<string, Traveller>) => void;
}) {
  const n = partySize(rooms);
  const cap = seatsLeft ?? 0;
  const kids = slotsFor(rooms).filter((s) => s.occupancy === 'child');
  return (
    <div className="grid gap-3">
      <div className="grid">
        {ROOMS.map(({ kind, title, hint }) => (
          <div
            key={kind}
            className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-line py-2 last:border-b-0"
          >
            <div>
              <b className="block text-[15px]">{title}</b>
              <small className="text-[12.5px] font-semibold text-mute">{hint}</small>
            </div>
            <Stepper
              label={title}
              value={rooms[kind]}
              canLess={canRemove(rooms, kind)}
              canMore={seatsLeft !== null && canAddCounter(rooms, kind, seatsLeft)}
              onStep={(by) => onRooms({ ...rooms, [kind]: Math.max(0, rooms[kind] + by) })}
            />
          </div>
        ))}
      </div>
      {kids.length > 0 && (
        <div className="grid gap-2 rounded-[12px] bg-bg2 p-3 sm:grid-cols-3">
          {kids.map((s, i) => {
            const age = names[s.key]?.age ?? '';
            const err = age ? childAgeError(age) : null;
            return (
              <label key={s.key} className={field}>
                <span className={labelCls}>Child {i + 1} · age</span>
                <Input
                  inputMode="numeric"
                  value={age}
                  aria-invalid={!!err}
                  placeholder={`${CHILD_MIN_AGE}–${CHILD_MAX_AGE}`}
                  onChange={(e) =>
                    onNames({
                      ...names,
                      [s.key]: {
                        name: names[s.key]?.name ?? '',
                        age: e.target.value.replace(/\D/g, '').slice(0, 2),
                      },
                    })
                  }
                />
                {err && <span className="text-[12px] font-bold text-warn">{err}</span>}
              </label>
            );
          })}
        </div>
      )}
      <div className="grid gap-1.5">
        <span aria-hidden className="h-2 overflow-hidden rounded-full bg-bg2">
          <i
            className="ctr-meter block h-full rounded-full bg-primary"
            style={{ width: `${cap ? Math.min(100, Math.round((n / cap) * 100)) : 0}%` }}
          />
        </span>
        <p className="num text-[13px] text-ink2">
          Party of <b>{n}</b>
          {date && seatsLeft !== null ? (
            <>
              {' '}
              · <b>{seatsLeft}</b> seats left on {formatDate(date)}, so the cap is {seatsLeft}
            </>
          ) : (
            ' · pick a departure to see the cap'
          )}
          {seatsLeft !== null && n >= seatsLeft && (
            <span className="ml-2 rounded-full bg-warn-soft px-2 py-0.5 text-[12px] font-bold text-warn">
              At the seat limit
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- 3 add-ons */

export function AddonsStep({
  offered,
  picks,
  party,
  onPick,
}: {
  offered: CounterPackage['addons'];
  picks: AddonPicks;
  party: number;
  onPick: (id: string, n: number) => void;
}) {
  if (offered.length === 0)
    return <p className="text-[14px] text-mute">This package has no add-ons switched on.</p>;
  return (
    <div>
      <AddonMenu offered={offered} picks={picks} party={party} onPick={onPick} notice={null} />
      <Hint>Add-ons are never discounted, and they count toward the deposit.</Hint>
    </div>
  );
}

/* ------------------------------------------------------------- 4 discounts */

export function DiscountsStep({
  quote,
  coupon,
  couponMsg,
  onCoupon,
  manual,
  manualError,
  onManual,
}: {
  quote: Quote | null;
  coupon: string | null;
  couponMsg: string | null;
  onCoupon: (code: string | null) => void;
  manual: Manual;
  manualError: string | null;
  onManual: (m: Manual) => void;
}) {
  const [code, setCode] = useState(coupon ?? '');
  const id = useId();
  const deal =
    quote?.lines.filter((l) => l.kind === 'deal').reduce((s, l) => s - l.amountPaise, 0) ?? 0;
  const eb =
    quote?.lines.filter((l) => l.kind === 'early_bird').reduce((s, l) => s - l.amountPaise, 0) ?? 0;
  const value = Number(manual.value);
  const needReason = value > 0 && manual.reason.trim().length < 3;
  const auto = (on: boolean, title: string, detail: string, paise: number) => (
    <div className="flex items-center gap-2.5 border-b border-line py-2 last:border-b-0">
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold',
          on ? 'bg-ok-soft text-ok' : 'bg-bg2 text-mute',
        )}
      >
        {on && <Check className="size-3" aria-hidden />}
        {on ? 'Auto' : 'None'}
      </span>
      <span className="min-w-0 flex-1 text-[13.5px]">
        <b>{title}</b> · {detail}
      </span>
      <b className="num">{paise ? `−${inr(paise)}` : '₹0'}</b>
    </div>
  );
  return (
    <div className="grid gap-4">
      <div className="rounded-[12px] border border-line px-3">
        {auto(
          !!deal,
          quote?.deal?.label || 'Deal',
          deal ? 'off every traveller' : 'none on this date',
          deal,
        )}
        {auto(
          !!eb,
          'Early bird',
          quote?.earlyBird ? `book by ${formatDate(quote.earlyBird.bookBy)}` : 'no tier applies',
          eb,
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={field}>
          <label htmlFor={`${id}-cp`} className={labelCls}>
            Coupon
          </label>
          <div className="flex gap-2">
            <Input
              id={`${id}-cp`}
              value={code}
              placeholder="Code"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            {coupon ? (
              <button
                type="button"
                className="rounded-md border px-3 text-[13px] font-bold"
                onClick={() => {
                  setCode('');
                  onCoupon(null);
                }}
              >
                Remove
              </button>
            ) : (
              <button
                type="button"
                className="rounded-md border px-3 text-[13px] font-bold disabled:opacity-50"
                disabled={!code.trim()}
                onClick={() => onCoupon(code.trim())}
              >
                Apply
              </button>
            )}
          </div>
          <span className="text-[12.5px]" role="status">
            {coupon && quote?.coupon ? (
              <span className="font-bold text-ok">
                {quote.coupon.code} applied · −{inr(quote.coupon.offPaise)} on fares
              </span>
            ) : couponMsg ? (
              <span className="font-bold text-warn">{couponMsg}</span>
            ) : (
              <span className="text-mute">
                Checked like the website: dates, limit, one use per email.
              </span>
            )}
          </span>
        </div>
        <div className={field}>
          <label htmlFor={`${id}-mv`} className={labelCls}>
            Manual discount
          </label>
          <div className="flex items-center gap-2">
            <Seg
              label="Discount in"
              className="flex-none flex-nowrap"
              value={manual.mode}
              options={[
                ['inr', '₹'],
                ['percent', '%'],
              ]}
              onChange={(mode) => onManual({ ...manual, mode })}
            />
            <Input
              id={`${id}-mv`}
              inputMode="numeric"
              className="num"
              value={manual.value}
              placeholder={manual.mode === 'percent' ? '1–100' : 'Amount'}
              onChange={(e) =>
                onManual({ ...manual, value: e.target.value.replace(/\D/g, '').slice(0, 7) })
              }
            />
            {manual.value && (
              <button
                type="button"
                aria-label="Remove manual discount"
                className="grid size-9 flex-none place-items-center rounded-md border"
                onClick={() => onManual({ ...manual, value: '', reason: '' })}
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>
        </div>
      </div>
      <div className={field}>
        <label htmlFor={`${id}-rs`} className={labelCls}>
          Reason for the manual discount{' '}
          <em className="font-semibold not-italic">{value > 0 ? '· required' : '· if used'}</em>
        </label>
        <Input
          id={`${id}-rs`}
          value={manual.reason}
          maxLength={120}
          aria-invalid={needReason}
          placeholder="e.g. Repeat customer, 2024 Goa trip"
          onChange={(e) => onManual({ ...manual, reason: e.target.value })}
        />
        <span className="text-[12.5px]" role="status">
          {manualError ? (
            <span className="font-bold text-warn">{manualError}</span>
          ) : needReason ? (
            <span className="font-bold text-warn">
              A reason is required. It prints on the invoice and in the history.
            </span>
          ) : quote?.manual && manual.mode === 'inr' && quote.manual.offPaise < value * 100 ? (
            <span className="font-bold text-warn">
              Capped at −{inr(quote.manual.offPaise)}: fares can’t go below ₹1.
            </span>
          ) : quote?.manual ? (
            <span className="font-bold text-ok">
              −{inr(quote.manual.offPaise)} · shows on the invoice and in the booking history
            </span>
          ) : (
            <span className="text-mute">
              Optional. ₹ or % of fares, after every other discount, never below ₹1 and never an
              increase.
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- 5 customer */

export function CustomerStep({
  customer,
  initialQuery,
  onCustomer,
}: {
  customer: Customer | null;
  initialQuery: string;
  onCustomer: (c: Customer | null) => void;
}) {
  const [q, setQ] = useState(initialQuery);
  const [hits, setHits] = useState<CustomerMatch[] | null>(null);
  const [searching, setSearching] = useState(false);
  const id = useId();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits(null);
      return;
    }
    const ctl = new AbortController();
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await adminGet<{ items: CustomerMatch[] }>(
          '/admin/customers',
          { q: term },
          ctl.signal,
        );
        setHits(res.items);
        // Converting an enquiry: its email already has a customer — pick them.
        const same = res.items.find((c) => c.email === term.toLowerCase());
        if (same && customer?.kind === 'new' && customer.draft.email.toLowerCase() === same.email)
          onCustomer({ kind: 'match', match: same });
      } catch {
        if (!ctl.signal.aborted) setHits([]);
      } finally {
        if (!ctl.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
    // Searching follows the typed text only; picking a customer must not search again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  if (customer?.kind === 'new')
    return (
      <NewCustomerForm
        draft={customer.draft}
        onChange={(draft) => onCustomer({ kind: 'new', draft })}
        onBack={() => onCustomer(null)}
      />
    );

  const picked = customer?.kind === 'match' ? customer.match : null;
  const list = hits ?? (picked ? [picked] : []);
  return (
    <div className="grid gap-3">
      <label htmlFor={`${id}-q`} className="sr-only">
        Find a customer by phone, email or name
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute"
          aria-hidden
        />
        <Input
          id={`${id}-q`}
          type="search"
          value={q}
          placeholder="Phone, email or name"
          className="pl-9"
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <ul className="grid gap-2" aria-busy={searching}>
        {list.map((c) => {
          const on = picked?.email === c.email;
          return (
            <li
              key={c.email}
              className={cn(
                'rounded-[14px] border-[1.5px] border-line transition-colors',
                on && 'border-primary bg-primary-soft/40',
              )}
            >
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onCustomer(on ? null : { kind: 'match', match: c })}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
              >
                <span className="grid size-9 flex-none place-items-center rounded-full bg-ink text-[12px] font-extrabold text-bg">
                  {initials(c.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate">{c.name}</b>
                  <small className="block truncate text-[12.5px] text-mute">
                    {c.phone} · {c.email}
                  </small>
                </span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[12px] font-bold whitespace-nowrap',
                    c.tripCount ? 'bg-primary-soft text-primary' : 'bg-bg2 text-mute',
                  )}
                >
                  {c.tripCount
                    ? `${c.tripCount} past trip${c.tripCount === 1 ? '' : 's'}`
                    : 'No trips yet'}
                </span>
              </button>
              {on && (
                <div className="grid gap-1.5 border-t border-line px-3 py-2.5 text-[12.5px]">
                  {c.trips.map((t) => (
                    <span key={t.ref} className="flex flex-wrap gap-x-2">
                      <b>{t.packageName}</b> · {formatDate(t.departs)} · {t.ref} · {t.status}
                    </span>
                  ))}
                  <p className="flex items-start gap-1.5 text-ink2">
                    <Link2 className="mt-0.5 size-3.5 flex-none" aria-hidden />
                    {c.hasAccount
                      ? `Account linked by email: this booking shows in ${c.name.split(' ')[0]}'s My trips.`
                      : `Linked by email: it shows in My trips when ${c.name.split(' ')[0]} signs in with ${c.email}.`}
                    {c.state ? ` GST state: ${c.state}.` : ''}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {hits && hits.length === 0 && !searching && (
        <p className="text-[13px] text-mute">No customer matches “{q.trim()}”.</p>
      )}
      <button
        type="button"
        className="inline-flex w-fit items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] font-bold"
        onClick={() =>
          onCustomer({
            kind: 'new',
            draft: {
              name: /@|\d/.test(q) ? '' : q.trim(),
              phone: /^\+?[\d\s-]+$/.test(q.trim()) ? q.trim() : '',
              email: q.includes('@') ? q.trim() : '',
              state: '',
            },
          })
        }
      >
        <UserPlus className="size-4" aria-hidden />
        Create a new customer
      </button>
    </div>
  );
}

function NewCustomerForm({
  draft,
  onChange,
  onBack,
}: {
  draft: NewCustomer;
  onChange: (d: NewCustomer) => void;
  onBack: () => void;
}) {
  const errors = newCustomerErrors(draft);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const id = useId();
  const one = (key: keyof NewCustomer, label: string, props: React.ComponentProps<'input'>) => (
    <div className={field}>
      <label htmlFor={`${id}-${key}`} className={labelCls}>
        {label}
      </label>
      <Input
        id={`${id}-${key}`}
        value={draft[key]}
        aria-invalid={touched[key] && !!errors[key]}
        onBlur={() => setTouched((t) => ({ ...t, [key]: true }))}
        onChange={(e) => onChange({ ...draft, [key]: e.target.value })}
        {...props}
      />
      {touched[key] && errors[key] && (
        <span className="text-[12px] font-bold text-warn">{errors[key]}</span>
      )}
    </div>
  );
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {one('name', 'Full name', { autoComplete: 'off' })}
        {one('phone', 'Mobile', { inputMode: 'tel', autoComplete: 'off' })}
        {one('email', 'Email', {
          type: 'email',
          autoComplete: 'off',
          placeholder: 'Links the booking to their My trips',
        })}
        <div className={field}>
          <label htmlFor={`${id}-state`} className={labelCls}>
            State (for GST)
          </label>
          <NativeSelect
            id={`${id}-state`}
            value={draft.state}
            onChange={(e) => onChange({ ...draft, state: e.target.value })}
          >
            <option value="">Karnataka (default)</option>
            {STATE_NAMES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <button type="button" onClick={onBack} className="w-fit text-[13px] font-bold text-primary">
        Back to search
      </button>
    </div>
  );
}

/* ------------------------------------------------------------ 6 travellers */

export function TravellersStep({
  rooms,
  names,
  detailsNow,
  lead,
  onDetailsNow,
  onNames,
}: {
  rooms: Rooms;
  names: Record<string, Traveller>;
  detailsNow: boolean;
  lead: string;
  onDetailsNow: (v: boolean) => void;
  onNames: (n: Record<string, Traveller>) => void;
}) {
  const slots = slotsFor(rooms);
  const first = lead === 'Not picked' ? 'The customer' : lead;
  return (
    <div className="grid gap-3">
      <Seg
        label="Traveller details"
        value={detailsNow ? 'now' : 'later'}
        options={[
          ['now', 'Enter now'],
          ['later', 'Fill in later'],
        ]}
        onChange={(v) => onDetailsNow(v === 'now')}
      />
      {detailsNow ? (
        <div className="grid gap-2">
          {slots.map((s, i) => {
            const t = names[s.key] ?? { name: '', age: '' };
            const kid = s.occupancy === 'child';
            return (
              <div
                key={s.key}
                className="grid grid-cols-[minmax(0,1fr)_72px] items-end gap-2 sm:grid-cols-[150px_minmax(0,1fr)_72px]"
              >
                <span className="col-span-2 text-[12.5px] font-bold text-mute sm:col-span-1 sm:pb-2">
                  {s.room}
                  {i === 0 ? ' · lead' : ''}
                </span>
                <Input
                  value={t.name}
                  maxLength={80}
                  placeholder={i === 0 ? `${first} (lead)` : 'Full name as on ID'}
                  aria-label={`Traveller ${i + 1} name`}
                  onChange={(e) => onNames({ ...names, [s.key]: { ...t, name: e.target.value } })}
                />
                <Input
                  className="num"
                  inputMode="numeric"
                  value={t.age}
                  placeholder={kid ? 'Age' : 'Age?'}
                  aria-label={`Traveller ${i + 1} age${kid ? '' : ' (optional)'}`}
                  onChange={(e) =>
                    onNames({
                      ...names,
                      [s.key]: { ...t, age: e.target.value.replace(/\D/g, '').slice(0, 3) },
                    })
                  }
                />
              </div>
            );
          })}
          <Hint>
            Empty names are fine: the lead takes the customer’s name and the rest show as “Traveller
            2…” until filled in. Adults’ ages are optional.
          </Hint>
        </div>
      ) : (
        <p className="flex items-start gap-2 rounded-[12px] bg-bg2 px-3 py-2.5 text-[13.5px] text-ink2">
          <Info className="mt-0.5 size-4 flex-none" aria-hidden />
          <span>
            The lead traveller takes {first === 'The customer' ? 'the customer’s' : `${first}’s`}{' '}
            name and the rest show as “Traveller 2…”. Fill names and ages in later from the booking
            page (<b>Edit travellers</b>); children’s ages are already in.
          </span>
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- 7 settle */

export function SettleStep({
  quote,
  draft,
  offer,
  owner,
  enquiryRef,
  onChange,
}: {
  quote: Quote | null;
  draft: Draft;
  offer: Offer;
  owner: string;
  /** Converting: the channel is the enquiry, fixed. */
  enquiryRef: string | null;
  onChange: (p: Partial<Draft>) => void;
}) {
  const id = useId();
  const dep = quote?.deposit ?? null;
  const opt = (v: Draft['settle'], title: string, detail: string, disabled = false) => (
    <button
      type="button"
      aria-pressed={draft.settle === v}
      disabled={disabled}
      onClick={() => onChange({ settle: v })}
      className={cn(
        'grid gap-0.5 rounded-[14px] border-[1.5px] border-line px-3.5 py-3 text-left transition-[border-color,box-shadow] hover:border-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line',
        draft.settle === v &&
          'border-primary bg-primary-soft/40 shadow-[inset_0_0_0_1px_var(--color-primary)]',
      )}
    >
      <b>{title}</b>
      <small className="text-[12.5px] text-mute">{detail}</small>
    </button>
  );
  const amount = draft.settle === 'deposit' ? dep?.amountPaise : quote?.totalPaise;
  const problem = draft.settle === 'link' ? linkProblem(draft, offer) : null;
  const linkNow = linkAmount(draft, offer);
  return (
    <div className="grid gap-4">
      <div role="group" aria-label="How to settle" className="grid gap-2.5 sm:grid-cols-3">
        {opt(
          'link',
          'Send payment link',
          offer.linkUntil === null
            ? 'Closed: too close to departure'
            : 'Full or 25% deposit · holds seats 24 h',
          offer.linkUntil === null,
        )}
        {opt('paid', 'Paid now', 'Cash, UPI or bank · confirms at once')}
        {opt(
          'deposit',
          'Deposit now',
          dep
            ? `${dep.percent}% today · balance by ${formatDate(dep.dueOn)}`
            : 'Closed: under 30 days to departure',
          !dep,
        )}
      </div>
      {draft.settle === 'link' ? (
        <div className="grid gap-3 rounded-[14px] bg-bg2 p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={labelCls}>Link amount</span>
            <Seg
              label="Link amount"
              value={draft.linkPay}
              options={[
                ['full', `Full ${offer.totalPaise ? inr(offer.totalPaise) : ''}`.trim()],
                ['deposit', `Deposit ${offer.depositPaise ? inr(offer.depositPaise) : ''}`.trim()],
              ]}
              onChange={(linkPay) => onChange({ linkPay })}
            />
          </div>
          <p className="text-[13px] text-ink2">
            A Razorpay Payment Link
            {linkNow ? ` for ${inr(linkNow)}` : ''} · seats held until{' '}
            {offer.linkUntil ? heldUntil(offer.linkUntil) : '—'} · share by copy, WhatsApp or email.
            A paid link settles through the same capture as the website; if it lapses the seats are
            released.
          </p>
          {problem && (
            <p role="status" className="text-[13px] font-bold text-warn">
              {problem}
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-3 rounded-[14px] bg-bg2 p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={labelCls}>Received by</span>
            <Seg<Method>
              label="Received by"
              value={draft.method}
              options={(['cash', 'upi', 'bank'] as const).map((m) => [m, METHOD_LABEL[m]] as const)}
              onChange={(method) => onChange({ method })}
            />
          </div>
          <div className={field}>
            <label htmlFor={`${id}-ref`} className={labelCls}>
              {REFERENCE_LABEL[draft.method]}
            </label>
            <Input
              id={`${id}-ref`}
              value={draft.reference}
              maxLength={80}
              autoComplete="off"
              placeholder={
                draft.method === 'upi'
                  ? '4271 9953 0187'
                  : draft.method === 'bank'
                    ? 'NEFT UTR'
                    : 'Counter book no.'
              }
              onChange={(e) => onChange({ reference: e.target.value })}
            />
          </div>
          <p className="text-[13px] text-ink2">
            {amount === undefined || !quote
              ? 'The amount comes from the server quote.'
              : draft.settle === 'paid'
                ? `${inr(amount)} received. Confirms at once and issues the receipt and the tax invoice.`
                : `${inr(amount)} received today; ${inr(dep!.balancePaise)} balance due ${formatDate(dep!.dueOn)}, with reminders at 7 and 3 days. The customer can pay it in parts from My trips.`}
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className={labelCls}>Channel</span>
        {enquiryRef ? (
          <span className="rounded-full bg-bg2 px-2.5 py-1 text-[13px] font-bold text-ink2">
            Enquiry {enquiryRef}
          </span>
        ) : (
          <Seg
            label="Channel"
            value={draft.channel}
            options={COUNTER_CHANNELS.filter((c) => c !== 'enquiry').map(
              (c) => [c, CHANNEL_LABEL[c]] as const,
            )}
            onChange={(channel) => onChange({ channel })}
          />
        )}
        <span className="text-[12.5px] text-mute">
          Created by <b className="text-ink">{owner}</b>
        </span>
      </div>
    </div>
  );
}
