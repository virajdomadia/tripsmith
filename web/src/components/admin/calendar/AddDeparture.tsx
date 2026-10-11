'use client';

import { Check, X } from 'lucide-react';
import { useId, useState } from 'react';
import { NativeSelect } from '@/components/admin/NativeSelect';
import { Input } from '@/components/ui/input';
import { adminRequest } from '@/lib/admin/client';
import {
  addDays,
  busyTrip,
  dayLabel,
  type CalendarLeader,
  type CalendarPackage,
  type LeaderTrip,
} from '@/lib/admin/calendar';
import { ApiRequestError } from '@/lib/api-errors';
import type { components } from '@/lib/api-types';
import { inr } from '@/lib/format';
import { cn } from '@/lib/utils';

type NewDeparture = components['schemas']['NewDeparture'];
type Rates = { seats: string; double: string; triple: string; child: string; single: string };

const rupees = (paise: number | null | undefined) =>
  paise === null || paise === undefined ? '' : String(Math.round(paise / 100));

function ratesOf(p: CalendarPackage | undefined): Rates {
  return {
    seats: p?.seatsTotal ? String(p.seatsTotal) : '',
    double: rupees(p?.priceDoublePaise),
    triple: rupees(p?.priceTriplePaise),
    child: rupees(p?.priceChildPaise),
    single: rupees(p?.singleSupplementPaise),
  };
}

/** The package's own leader when free on these days, else the first free one, else none. */
function leaderFor(
  p: CalendarPackage | undefined,
  leaders: readonly CalendarLeader[],
  trips: readonly LeaderTrip[],
  day: string,
): string {
  if (!p) return '';
  const free = (id: string) => !busyTrip(trips, id, day, p.nights);
  if (p.leaderId && free(p.leaderId)) return p.leaderId;
  return leaders.find((l) => l.active && free(l.id))?.id ?? '';
}

const label = 'text-[12.5px] font-bold text-ink2';
const hint = 'text-[12px] text-mute';
const err = 'text-[12px] font-semibold text-bad';

/**
 * Mockup A's add form: a date clicked on the grid (or "+ Day" on a phone) → package, start day,
 * seats and price, prefilled from the package's latest date; the trip leader defaults to the
 * package's and leaders already on a trip those days are greyed out. One POST adds just this date
 * (`addDeparture`); the package page shows it straight away.
 */
export function AddDeparture({
  day: firstDay,
  packageId,
  packages,
  leaders,
  trips,
  today,
  onCancel,
  onCreated,
}: {
  day: string;
  packageId: string;
  packages: readonly CalendarPackage[];
  leaders: readonly CalendarLeader[];
  trips: readonly LeaderTrip[];
  today: string;
  onCancel: () => void;
  onCreated: (out: NewDeparture) => void;
}) {
  const uid = useId();
  const byId = (id: string) => packages.find((p) => p.id === id);
  const [pkgId, setPkgId] = useState(packageId);
  const [day, setDay] = useState(firstDay);
  const [rates, setRates] = useState<Rates>(() => ratesOf(byId(packageId)));
  const [leaderId, setLeaderId] = useState(() =>
    leaderFor(byId(packageId), leaders, trips, firstDay),
  );
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);

  const pkg = byId(pkgId);
  const nights = pkg?.nights ?? 0;
  const returns = addDays(day, nights);
  const taken = (id: string) => busyTrip(trips, id, day, nights);

  function pickPackage(id: string) {
    setPkgId(id);
    setRates(ratesOf(byId(id)));
    setLeaderId(leaderFor(byId(id), leaders, trips, day));
    setErrors({});
  }

  function pickDay(next: string) {
    setDay(next);
    if (leaderId && pkg && busyTrip(trips, leaderId, next, pkg.nights)) {
      setLeaderId(leaderFor(pkg, leaders, trips, next));
    }
  }

  const set = (k: keyof Rates) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setRates((r) => ({ ...r, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pkg) {
      setErrors({ package: 'Choose a package' });
      return;
    }
    const paise = (v: string) => Math.round(Number(v || 0) * 100);
    setBusy(true);
    setErrors({});
    setProblem(null);
    try {
      const out = await adminRequest<NewDeparture>(
        `/admin/packages/${encodeURIComponent(pkg.id)}/departures`,
        {
          method: 'POST',
          body: {
            date: day,
            seatsTotal: Number(rates.seats),
            priceDoublePaise: paise(rates.double),
            priceTriplePaise: paise(rates.triple),
            priceChildPaise: paise(rates.child),
            singleSupplementPaise: paise(rates.single),
            leaderId: leaderId || null,
          },
        },
      );
      onCreated(out);
    } catch (x) {
      if (x instanceof ApiRequestError) {
        setErrors(x.body.fieldErrors ?? {});
        setProblem(x.body.fieldErrors ? null : x.body.message);
      } else setProblem('That didn’t go through — try again.');
      setBusy(false);
    }
  }

  const fieldErr = (...keys: string[]) => keys.map((k) => errors[k]).find(Boolean);
  const leaderNote = !pkg
    ? null
    : leaderId
      ? `${leaders.find((l) => l.id === leaderId)?.name ?? 'They'} ${leaderId === pkg.leaderId ? '(the package’s leader) ' : ''}is free ${dayLabel(day)} → ${dayLabel(returns)}. Leaders already on a trip are greyed out.`
      : leaders.some((l) => l.active && !taken(l.id))
        ? 'No leader picked — add one later in Edit departure.'
        : 'Every leader is on a trip these days. Pick another day, or add a leader later.';

  return (
    <form onSubmit={submit} className="grid gap-0" aria-label="Add departure" noValidate>
      <section className="grid gap-1 border-b border-line p-4">
        <div className="flex items-center gap-2">
          <span className="rounded-chip bg-primary-soft px-2 py-0.5 text-[11.5px] font-bold text-primary-ink">
            New departure
          </span>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            className="ml-auto rounded-md p-1 text-mute hover:bg-bg2 hover:text-ink"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <h2 className="text-[20px] leading-tight font-extrabold">Add departure</h2>
        <p className="text-[13px] text-mute">
          {dayLabel(day)}
          {pkg ? ` → ${dayLabel(returns)} · ${nights} nights` : ''}.{' '}
          {pkg?.draft
            ? 'The package is a draft: the date goes live with it.'
            : 'Bookable on the package page the moment you create it.'}
        </p>
      </section>

      <section className="grid gap-3.5 border-b border-line p-4">
        <div className="grid gap-1">
          <label htmlFor={`${uid}-pkg`} className={label}>
            Package
          </label>
          <NativeSelect
            id={`${uid}-pkg`}
            value={pkgId}
            onChange={(e) => pickPackage(e.target.value)}
            aria-invalid={!!errors.package}
          >
            <option value="">Choose a package</option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.draft ? ' (draft)' : ''}
              </option>
            ))}
          </NativeSelect>
          {errors.package && <span className={err}>{errors.package}</span>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1">
            <label htmlFor={`${uid}-day`} className={label}>
              Starts
            </label>
            <Input
              id={`${uid}-day`}
              type="date"
              min={today}
              value={day}
              onChange={(e) => e.target.value && pickDay(e.target.value)}
              aria-invalid={!!errors.date}
            />
          </div>
          <div className="grid gap-1">
            <label htmlFor={`${uid}-seats`} className={label}>
              Seats
            </label>
            <Input
              id={`${uid}-seats`}
              type="number"
              inputMode="numeric"
              min={1}
              max={200}
              value={rates.seats}
              onChange={set('seats')}
              aria-invalid={!!errors.seatsTotal}
            />
          </div>
        </div>
        {fieldErr('date', 'seatsTotal') && (
          <span className={err}>{fieldErr('date', 'seatsTotal')}</span>
        )}
        <div className="grid gap-1">
          <label htmlFor={`${uid}-double`} className={label}>
            Price per person, double sharing (₹)
          </label>
          <Input
            id={`${uid}-double`}
            type="number"
            inputMode="numeric"
            min={1}
            value={rates.double}
            onChange={set('double')}
            aria-invalid={!!errors.priceDoublePaise}
          />
          <span className={hint}>
            {pkg?.priceDoublePaise
              ? `Its latest date is ${inr(pkg.priceDoublePaise)}. Deals and early-bird apply on top.`
              : 'Deals and early-bird apply on top.'}
          </span>
        </div>
        <details className="group rounded-btn border border-line p-3" open={!pkg?.priceTriplePaise}>
          <summary className="cursor-pointer text-[12.5px] font-bold text-ink2">
            Other rates
            {pkg?.priceTriplePaise
              ? ` · triple ₹${rates.triple}, child ₹${rates.child}, single +₹${rates.single}`
              : ''}
          </summary>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(
              [
                ['triple', 'Triple (₹)'],
                ['child', 'Child (₹)'],
                ['single', 'Single +(₹)'],
              ] as const
            ).map(([k, t]) => (
              <div key={k} className="grid gap-1">
                <label htmlFor={`${uid}-${k}`} className={label}>
                  {t}
                </label>
                <Input
                  id={`${uid}-${k}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={rates[k]}
                  onChange={set(k)}
                />
              </div>
            ))}
          </div>
        </details>
        {fieldErr(
          'priceDoublePaise',
          'priceTriplePaise',
          'priceChildPaise',
          'singleSupplementPaise',
        ) && (
          <span className={err}>
            Every price needs at least ₹1 (the single supplement can be ₹0).
          </span>
        )}
        <div className="grid gap-1">
          <label htmlFor={`${uid}-leader`} className={label}>
            Trip leader
          </label>
          <NativeSelect
            id={`${uid}-leader`}
            value={leaderId}
            onChange={(e) => setLeaderId(e.target.value)}
            aria-invalid={!!errors.leaderId}
          >
            <option value="">No leader yet</option>
            {leaders
              .filter((l) => l.active)
              .map((l) => {
                const b = pkg ? taken(l.id) : undefined;
                return (
                  <option key={l.id} value={l.id} disabled={!!b}>
                    {l.name}
                    {b ? ` (on ${b.packageName} till ${dayLabel(b.returns)})` : ''}
                  </option>
                );
              })}
          </NativeSelect>
          {errors.leaderId ? (
            <span className={err}>{errors.leaderId}</span>
          ) : (
            leaderNote && <span className={hint}>{leaderNote}</span>
          )}
        </div>
        <p className={hint}>
          The meeting point is the package’s; give this date its own in Edit departure.
        </p>
        {problem && (
          <p
            role="alert"
            className="rounded-btn bg-warn-soft px-3 py-2 text-[13px] font-semibold text-warn"
          >
            {problem}
          </p>
        )}
      </section>

      <section className="flex gap-2 p-4">
        <button
          type="submit"
          disabled={busy || !pkg}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-btn bg-action px-4 py-2 text-[14px] font-bold text-ink transition-colors hover:bg-action-ink disabled:opacity-50',
          )}
        >
          <Check className="size-4" aria-hidden />
          {busy ? 'Creating…' : 'Create departure'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-btn px-3 py-2 text-[14px] font-bold text-ink2 hover:bg-bg2"
        >
          Cancel
        </button>
      </section>
    </form>
  );
}
