'use client';

import { Minus, Plus } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { adminGet, adminRequest } from '@/lib/admin/client';
import { reportAdminError } from '@/lib/admin/errors';
import { ApiRequestError } from '@/lib/api-errors';
import type { components } from '@/lib/api-types';
import { formatDate, inr } from '@/lib/format';
import { cn } from '@/lib/utils';

type Options = components['schemas']['MoveOptions'];
type MoveQuote = components['schemas']['MoveQuote'];
type Traveller = components['schemas']['CounterTraveller'];
type Occupancy = Traveller['occupancy'];

const ROOMS: [Occupancy, string][] = [
  ['double', 'Double'],
  ['triple', 'Triple'],
  ['single', 'Single'],
  ['child', 'Child'],
];
const MAX_PARTY = 12;
const rupees = (paise: number) => String(Math.round(paise / 100));

/**
 * R45 (P7b): the owner's Move on the booking — another date of the trip and/or a different
 * party, at any time. The api prices every change (the earned discounts kept in ₹, the add-ons
 * re-counted for a new party, the fee the tier suggests, editable with a reason) and the form
 * shows what the customer then owes or gets back. A rise is recorded paid now offline or added
 * to the balance; a fall is refunded through Razorpay. The move is made at once.
 */
export function MoveBooking({ bookingRef }: { bookingRef: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const id = useId();
  const [, startTransition] = useTransition();
  const [options, setOptions] = useState<Options | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [editParty, setEditParty] = useState(false);
  const [party, setParty] = useState<Traveller[]>([]);
  const [fee, setFee] = useState('');
  const [reason, setReason] = useState('');
  const [settle, setSettle] = useState<'offline' | 'balance' | null>(null);
  const [method, setMethod] = useState<'cash' | 'upi' | 'bank'>('upi');
  const [reference, setReference] = useState('');
  const [quote, setQuote] = useState<MoveQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const asked = useRef(0);

  useEffect(() => {
    adminGet<Options>(`/admin/bookings/${bookingRef}/move`, {})
      .then((o) => {
        setOptions(o);
        setDate(o.dates.find((d) => !d.current)?.departureId ?? o.dates[0]?.departureId ?? '');
        setParty(o.travellers);
        setFee(rupees(o.suggestedFeePaise));
      })
      .catch((e: unknown) =>
        setFailed(e instanceof Error ? e.message : 'The dates could not be loaded'),
      );
  }, [bookingRef]);

  const feePaise = fee === '' ? null : Number(fee) * 100;
  const feeOff = options && feePaise !== null && feePaise !== options.suggestedFeePaise;
  const body = {
    departureId: date,
    travellers: editParty ? party : null,
    feePaise,
  };
  const key = JSON.stringify(body);

  useEffect(() => {
    if (!options || !date) return;
    const n = ++asked.current;
    setQuoting(true);
    const timer = setTimeout(() => {
      adminRequest<MoveQuote>(`/admin/bookings/${bookingRef}/move/quote`, {
        method: 'POST',
        body: JSON.parse(key),
      })
        .then((q) => {
          if (n !== asked.current) return;
          setQuote(q);
          setQuoteError(null);
        })
        .catch((e: unknown) => {
          if (n !== asked.current) return;
          setQuote(null);
          // The server's words: a party it won't take ("Doubles go in pairs"), a date gone.
          setQuoteError(
            e instanceof ApiRequestError
              ? (Object.values(e.body.fieldErrors ?? {})[0] ?? e.body.message)
              : 'This move could not be priced',
          );
        })
        .finally(() => n === asked.current && setQuoting(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [bookingRef, key, options, date]);

  if (failed) return <p className="text-[13px] font-semibold text-bad">{failed}</p>;
  if (!options) return <p className="text-[13px] text-mute">Loading the trip’s dates…</p>;

  const rise = quote ? Math.max(0, Math.min(quote.netPaise, quote.owedPaise)) : 0;
  const ready =
    !!quote &&
    !quoting &&
    quote.fits &&
    (!feeOff || reason.trim().length > 0) &&
    (rise === 0 || settle !== null);

  async function submit() {
    if (!quote || !ready) return;
    setBusy(true);
    try {
      await adminRequest(`/admin/bookings/${bookingRef}/move`, {
        method: 'POST',
        body: {
          ...body,
          feeReason: feeOff ? reason.trim() : null,
          settle: rise ? settle : null,
          method: rise && settle === 'offline' ? method : null,
          reference: rise && settle === 'offline' ? reference.trim() || null : null,
          expectedNetPaise: quote.netPaise,
        },
      });
      toast.success('Booking moved — the customer has the new voucher');
      startTransition(() => router.refresh());
    } catch (e) {
      reportAdminError(e, { router, pathname, fallback: 'The move did not go through' });
      setBusy(false);
    }
  }

  const setRoom = (i: number, occupancy: Occupancy) =>
    setParty(party.map((t, j) => (j === i ? { ...t, occupancy } : t)));

  return (
    <div className="grid gap-3.5 text-[13px]">
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-date`}>Move to</Label>
        <select
          id={`${id}-date`}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-10 w-full min-w-0 rounded-btn border border-line bg-bg px-3 text-[14px]"
        >
          {options.dates.map((d) => (
            <option key={d.departureId} value={d.departureId}>
              {formatDate(d.date)} ·{' '}
              {d.current ? 'its date now (party or fee only)' : `${d.seatsLeft} seats free`}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 font-semibold">
        <input
          type="checkbox"
          checked={editParty}
          onChange={(e) => {
            setEditParty(e.target.checked);
            if (!e.target.checked) setParty(options.travellers);
          }}
        />
        Change the party
      </label>
      {editParty && (
        <fieldset className="grid gap-2 rounded-xl border border-line p-3">
          <legend className="px-1 text-[12px] font-bold text-mute">
            Travellers · {party.length}
          </legend>
          {party.map((t, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_64px_96px_32px] gap-1.5">
              <Input
                aria-label={`Traveller ${i + 1} name`}
                value={t.name ?? ''}
                placeholder={`Traveller ${i + 1}`}
                onChange={(e) =>
                  setParty(party.map((p, j) => (j === i ? { ...p, name: e.target.value } : p)))
                }
              />
              <Input
                aria-label={`Traveller ${i + 1} age`}
                inputMode="numeric"
                value={t.age ?? ''}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 3);
                  setParty(
                    party.map((p, j) => (j === i ? { ...p, age: v === '' ? null : Number(v) } : p)),
                  );
                }}
              />
              <select
                aria-label={`Traveller ${i + 1} room`}
                value={t.occupancy}
                onChange={(e) => setRoom(i, e.target.value as Occupancy)}
                className="h-9 w-full min-w-0 rounded-btn border border-line bg-bg px-2"
              >
                {ROOMS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`Remove traveller ${i + 1}`}
                disabled={party.length === 1}
                onClick={() => setParty(party.filter((_, j) => j !== i))}
              >
                <Minus className="size-4" aria-hidden />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={party.length >= MAX_PARTY}
            onClick={() => setParty([...party, { name: null, age: null, occupancy: 'single' }])}
          >
            <Plus className="size-4" aria-hidden /> Add a traveller
          </Button>
        </fieldset>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-fee`}>Change fee (₹)</Label>
        <Input
          id={`${id}-fee`}
          inputMode="numeric"
          value={fee}
          onChange={(e) => setFee(e.target.value.replace(/\D/g, '').slice(0, 7))}
        />
        <span className="text-[12px] text-mute">
          The tier suggests {inr(options.suggestedFeePaise)}. Set 0 to waive it.
        </span>
      </div>
      {feeOff && (
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-reason`}>Why the fee differs</Label>
          <Textarea
            id={`${id}-reason`}
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Goodwill — our date mix-up"
          />
          <span className="text-[12px] text-mute">Kept in the history and on the invoice.</span>
        </div>
      )}

      <section
        aria-label="What the move does"
        aria-busy={quoting}
        className={cn(
          'grid gap-1 rounded-xl bg-bg2 p-3 transition-opacity',
          quoting && 'opacity-60',
        )}
      >
        {quote ? (
          <>
            <Row k="Fare now" v={inr(quote.currentFarePaise)} />
            <Row k="Fare after" v={inr(quote.farePaise)} />
            {quote.addonsChangePaise !== 0 && (
              <Row k="Add-ons" v={signed(quote.addonsChangePaise)} />
            )}
            {quote.feePaise > 0 && <Row k="Fee" v={inr(quote.feePaise)} />}
            <Row k="New total" v={inr(quote.totalPaise)} strong />
            <Row k="Paid" v={inr(quote.paidPaise)} />
            {!quote.fits && (
              <p className="font-bold text-bad">
                Not enough seats for the whole party on that date ({quote.seatsLeft} free).
              </p>
            )}
            {quote.refundPaise > 0 && (
              <p className="font-semibold text-ok">
                {inr(quote.refundPaise)} goes back through Razorpay, with a credit note.
              </p>
            )}
            {quote.owedPaise > 0 && rise === 0 && (
              <p className="text-ink2">
                Still {inr(quote.owedPaise)} on the balance, due by {formatDate(quote.dueOn)}.
              </p>
            )}
          </>
        ) : (
          <p className={quoteError && !quoting ? 'font-semibold text-bad' : 'text-mute'}>
            {quoting ? 'Pricing…' : (quoteError ?? 'Pick what changes')}
          </p>
        )}
      </section>

      {rise > 0 && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 font-bold">The customer owes {inr(rise)} more</legend>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name={`${id}-settle`}
              checked={settle === 'offline'}
              onChange={() => setSettle('offline')}
            />
            <span>Paid now offline</span>
          </label>
          {settle === 'offline' && (
            <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-1.5 pl-6">
              <select
                aria-label="How it was paid"
                value={method}
                onChange={(e) => setMethod(e.target.value as 'cash' | 'upi' | 'bank')}
                className="h-9 w-full min-w-0 rounded-btn border border-line bg-bg px-2"
              >
                <option value="upi">UPI</option>
                <option value="cash">Cash</option>
                <option value="bank">Bank transfer</option>
              </select>
              <Input
                aria-label="Reference"
                placeholder="Reference (optional)"
                value={reference}
                maxLength={80}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          )}
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name={`${id}-settle`}
              checked={settle === 'balance'}
              onChange={() => setSettle('balance')}
            />
            <span>
              Add to the balance
              {quote && (
                <span className="block text-[12px] text-mute">
                  Due by {formatDate(quote.dueOn)} — they pay it in My trips; reminders go out
                </span>
              )}
            </span>
          </label>
        </fieldset>
      )}

      <Button type="button" disabled={!ready || busy} onClick={() => void submit()}>
        {busy ? 'Moving…' : 'Move the booking'}
      </Button>
    </div>
  );
}

function signed(paise: number) {
  return `${paise > 0 ? '+' : '−'}${inr(Math.abs(paise))}`;
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-3', strong && 'font-bold')}>
      <span className="text-ink2">{k}</span>
      <span className="num">{v}</span>
    </div>
  );
}
