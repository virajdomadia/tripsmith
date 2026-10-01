'use client';

import { BellRing, Check, Minus, Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { errorFromResponse } from '@/lib/api-errors';
import type { Departure } from '@/lib/booking';
import { formatDate } from '@/lib/format';
import type { WaitlistJoined } from '@/lib/waitlist';
import { control, Field } from '../enquiry/Field';

const MAX_PARTY = 12;

type State =
  | { kind: 'closed' }
  | { kind: 'open' }
  | { kind: 'sending' }
  | { kind: 'joined'; place: WaitlistJoined; email: string };

/**
 * R44 (P6): "Join waitlist · N waiting" under a sold-out date. Name, email and party — no
 * account. The api puts the party in line; when seats free up the first party that fits gets
 * them held for 24 hours and an email with a claim link. Refusals (already on it, seats free
 * after all, the list closed, too many tries) come back in the api's words.
 */
export function WaitlistJoin({
  departure,
  party: initialParty,
  name: initialName,
  email: initialEmail,
  onSeatsFree,
}: {
  departure: Departure;
  party: number;
  name: string;
  email: string;
  /** The api found seats for the party after all: re-read the dates. */
  onSeatsFree: () => void;
}) {
  const id = useId();
  const [state, setState] = useState<State>({ kind: 'closed' });
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [party, setParty] = useState(Math.min(Math.max(initialParty, 1), MAX_PARTY));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const waiting = departure.waiting ?? 0;

  if (state.kind === 'joined')
    return (
      <p
        role="status"
        className="flex items-start gap-2 rounded-btn bg-ok-soft px-3 py-2.5 text-[13px] font-semibold text-ok animate-rise"
      >
        <Check className="mt-0.5 size-4 flex-none" aria-hidden />
        <span>
          You’re <b className="num">#{state.place.position}</b> in line for{' '}
          {formatDate(departure.date)}. If seats free up we’ll hold them for you for 24 hours and
          email <b>{state.email}</b>.
        </span>
      </p>
    );

  if (state.kind === 'closed')
    return (
      <button
        type="button"
        onClick={() => setState({ kind: 'open' })}
        aria-expanded={false}
        aria-controls={id}
        className="inline-flex items-center gap-1.5 justify-self-start rounded-chip border-[1.5px] border-primary/40 bg-primary-soft px-3 py-1.5 text-[12.5px] font-extrabold text-primary-ink transition-colors hover:border-primary"
      >
        <BellRing className="size-3.5" aria-hidden />
        {waiting > 0 ? `Join waitlist · ${waiting} waiting` : 'Join waitlist'}
      </button>
    );

  const describe = (field: string) => ({
    id: `${id}-${field}`,
    'aria-invalid': errors[field] ? (true as const) : undefined,
    'aria-describedby': errors[field] ? `${id}-${field}-error` : undefined,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (name.trim().length < 2) found.name = 'Enter your name';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) found.email = 'Enter a valid email address';
    setErrors(found);
    setProblem(null);
    if (Object.keys(found).length) return;
    setState({ kind: 'sending' });
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departureId: departure.id, name: name.trim(), email, party }),
      });
      if (res.status === 201) {
        setState({
          kind: 'joined',
          place: (await res.json()) as WaitlistJoined,
          email: email.trim().toLowerCase(),
        });
        return;
      }
      const err = errorFromResponse(
        res.status,
        res.statusText,
        await res.json().catch(() => undefined),
      );
      if (err.body.fieldErrors) setErrors(err.body.fieldErrors);
      setProblem(
        res.status === 429
          ? 'Too many tries from this connection. Try again in a few minutes, or WhatsApp us.'
          : err.body.message,
      );
      if (err.body.reason === 'seats_available') onSeatsFree();
    } catch {
      setProblem('We couldn’t reach Tripsmith. Check your connection and try again.');
    }
    setState({ kind: 'open' });
  }

  return (
    <form
      id={id}
      onSubmit={(e) => void submit(e)}
      noValidate
      aria-label={`Join the waitlist for ${formatDate(departure.date)}`}
      className="grid gap-3 rounded-btn border-[1.5px] border-primary/30 bg-bg p-3 animate-rise"
    >
      <p className="text-[13px] leading-relaxed text-ink2">
        <b className="text-ink">No account needed.</b> If seats free up, the first party in line
        that fits gets them held for 24 hours, with a link to book in full or with a deposit.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Your name" name={`${id}-name`} error={errors.name}>
          <input
            {...describe('name')}
            className={control}
            autoComplete="name"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Email" name={`${id}-email`} error={errors.email}>
          <input
            {...describe('email')}
            className={control}
            type="email"
            autoComplete="email"
            maxLength={120}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span id={`${id}-party`} className="label-caps text-mute">
            Seats needed
          </span>
          <div
            role="group"
            aria-labelledby={`${id}-party`}
            className="inline-flex items-center rounded-btn border-[1.5px] border-line"
          >
            <button
              type="button"
              aria-label="One fewer seat"
              disabled={party <= 1}
              onClick={() => setParty((p) => Math.max(1, p - 1))}
              className="grid size-9 place-items-center disabled:opacity-35"
            >
              <Minus className="size-4" aria-hidden />
            </button>
            <output aria-live="polite" className="num w-7 text-center font-extrabold">
              {party}
            </output>
            <button
              type="button"
              aria-label="One more seat"
              disabled={party >= MAX_PARTY}
              onClick={() => setParty((p) => Math.min(MAX_PARTY, p + 1))}
              className="grid size-9 place-items-center disabled:opacity-35"
            >
              <Plus className="size-4" aria-hidden />
            </button>
          </div>
        </div>
        <button
          type="submit"
          disabled={state.kind === 'sending'}
          aria-busy={state.kind === 'sending'}
          className="rounded-btn bg-primary px-4 py-2.5 text-sm font-bold text-white transition-[background-color,opacity] hover:bg-primary-ink disabled:opacity-50"
        >
          {state.kind === 'sending' ? 'Joining…' : 'Join the waitlist'}
        </button>
      </div>
      {problem && (
        <p role="alert" className="text-[13px] font-semibold text-warn">
          {problem}
        </p>
      )}
    </form>
  );
}
