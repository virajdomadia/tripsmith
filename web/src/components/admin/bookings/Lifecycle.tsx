'use client';

import { Check, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useState } from 'react';
import { istFullDate, istTime } from '@/components/admin/enquiries/ist-date';
import { Button } from '@/components/ui/button';
import type { AdminBooking } from '@/lib/admin/booking-filters';
import { blocked, lifecycle, moves, type Move, type Step } from '@/lib/admin/lifecycle';
import { BookedAddons } from '@/components/site/booking/BookedAddons';
import { lineLabel, OCCUPANCY_LABEL } from '@/lib/booking';
import { formatDate, inr } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DeskActions } from './DeskActions';
import { EditTravellers } from './EditTravellers';
import { RemoveAddon } from './RemoveAddon';
import { ResolveDialog } from './ResolveCancellation';

const NODE = {
  done: 'border-ok bg-ok text-white',
  now: 'border-primary bg-bg text-primary ring-4 ring-primary-soft',
  todo: 'border-line bg-bg text-mute',
  bad: 'border-bad bg-bad text-white',
} as const;
const BECOMES = {
  ok: 'bg-ok-soft text-ok',
  mute: 'bg-bg2 text-ink2',
  bad: 'bg-bad-soft text-bad',
} as const;

/**
 * Mockup Booking detail C · Lifecycle (R59, P20): the booking as a state machine. The stepper
 * shows where it has been and where it stands; each step opens what happened there (from the
 * history, R54). "From here you can" lists only the moves the api accepts now — each says what
 * it will change before its dialog opens — and "Not available now" says why the rest are not.
 */
export function Lifecycle({ b }: { b: AdminBooking }) {
  const steps = lifecycle(b);
  const nowIndex = Math.max(
    0,
    steps.findLastIndex((s) => s.state === 'now'),
  );
  const [stage, setStage] = useState(nowIndex);
  const [open, setOpen] = useState<string | null>(null);
  const available = moves(b);
  const notNow = blocked(b);
  const current = steps[stage] ?? steps[nowIndex]!;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3.5">
      <ol
        aria-label="Lifecycle"
        className="grid auto-cols-[minmax(104px,1fr)] grid-flow-col overflow-x-auto rounded-card border border-line bg-bg px-2 py-3"
      >
        {steps.map((s, i) => (
          <li key={`${s.name}-${i}`} className="relative">
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  'absolute top-[15px] right-1/2 left-[-50%] h-0.5',
                  s.state === 'todo' ? 'bg-line' : 'bg-ok',
                )}
              />
            )}
            <button
              type="button"
              aria-pressed={i === stage}
              onClick={() => setStage(i)}
              className={cn(
                'relative grid w-full justify-items-center gap-1 rounded-xl px-1 py-1 text-center transition-colors',
                i === stage ? 'bg-primary-soft/60' : 'hover:bg-bg2',
              )}
            >
              <span
                className={cn(
                  'grid size-[30px] place-items-center rounded-full border-2 text-[12px] font-extrabold',
                  NODE[s.state],
                )}
              >
                {s.state === 'done' ? (
                  <Check className="size-4" aria-hidden />
                ) : s.state === 'bad' ? (
                  <X className="size-4" aria-hidden />
                ) : s.state === 'now' ? (
                  <span className="size-2.5 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
                ) : (
                  i + 1
                )}
              </span>
              <b className="text-[12.5px] leading-tight">{s.name}</b>
              <small className="text-[11.5px] text-mute">
                {s.state === 'now' ? 'Now' : s.state === 'todo' ? 'Not yet' : ''}
                {s.at && s.state !== 'todo'
                  ? `${s.state === 'now' ? ' · ' : ''}${istFullDate(s.at).slice(0, -5)}`
                  : ''}
              </small>
            </button>
          </li>
        ))}
      </ol>

      <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section aria-labelledby="moves" className="grid gap-2">
          <h2 id="moves" className="label-caps text-[11px] text-mute">
            {available.length ? `From “${steps[nowIndex]!.name}” you can` : 'Nothing to decide'}
          </h2>
          {available.length === 0 && (
            <p className="rounded-card border border-line bg-bg p-4 text-sm text-mute">
              Every move this booking allows has been made. The history below has the full story.
            </p>
          )}
          {available.map((m) => (
            <MoveCard
              key={m.key}
              move={m}
              b={b}
              open={open === m.key}
              toggle={() => setOpen(open === m.key ? null : m.key)}
            />
          ))}
          <details className="rounded-card border border-line bg-bg px-4 py-3 text-[13px]">
            <summary className="cursor-pointer font-bold text-mute">
              Not available now · {notNow.length}
            </summary>
            <ul className="mt-2 grid gap-1.5">
              {notNow.map(([what, why]) => (
                <li key={what} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3">
                  <b>{what}</b>
                  <span className="text-mute">{why}</span>
                </li>
              ))}
            </ul>
          </details>
        </section>

        <section
          aria-labelledby="stage"
          className="overflow-hidden rounded-card border border-line bg-bg lg:sticky lg:top-4"
        >
          <header className="flex items-center gap-2 border-b border-line px-4 py-3">
            <h2 id="stage" className="text-[15px] font-extrabold">
              {current.name}
            </h2>
            <span className="text-[12.5px] font-semibold text-mute">
              {current.state === 'todo'
                ? 'Ahead'
                : current.state === 'now'
                  ? 'Where it stands'
                  : 'What happened'}
            </span>
            <span className="ml-auto flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                aria-label="Earlier step"
                disabled={stage === 0}
                onClick={() => setStage(stage - 1)}
              >
                <ChevronLeft className="size-4" aria-hidden />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Later step"
                disabled={stage === steps.length - 1}
                onClick={() => setStage(stage + 1)}
              >
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </span>
          </header>
          <div key={stage} className="animate-rise grid gap-3 p-4 text-[13.5px]">
            <StageBody step={current} b={b} />
          </div>
          <dl className="grid grid-cols-3 border-t border-line bg-bg2 text-[13px]">
            <Money k="Total" v={inr(b.totalPaise)} />
            <Money k="Paid" v={inr(b.paidPaise)} />
            <Money
              k={b.refundNeeded ? 'To refund' : 'Balance'}
              v={
                b.refundNeeded
                  ? inr(b.refundToSendPaise + b.refundOfflinePaise)
                  : inr(Math.max(0, b.totalPaise - b.paidPaise))
              }
            />
          </dl>
        </section>
      </div>
    </div>
  );
}

function MoveCard({
  move: m,
  b,
  open,
  toggle,
}: {
  move: Move;
  b: AdminBooking;
  open: boolean;
  toggle: () => void;
}) {
  return (
    <article className={cn('rounded-card border bg-bg', open ? 'border-ink' : 'border-line')}>
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="grid gap-0.5">
          <b className="text-sm">{m.title}</b>
          <small className="text-[12px] text-mute">
            becomes{' '}
            <span className={cn('rounded-chip px-2 py-px font-bold', BECOMES[m.tone])}>
              {m.becomes}
            </span>
          </small>
        </span>
        <ChevronDown
          className={cn('size-4 text-mute transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      <dl className="grid gap-1 px-4 pb-3 text-[13px]">
        {m.effects.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[64px_1fr] gap-2">
            <dt className="font-bold text-mute">{k}</dt>
            <dd className="m-0 text-ink2">{v}</dd>
          </div>
        ))}
      </dl>
      {open && (
        <div className="border-t border-line px-4 py-3">
          {(m.key === 'approve' || m.key === 'reject') && b.cancellation ? (
            <ResolveDialog
              bookingRef={b.ref}
              c={b.cancellation}
              decision={m.key}
              paidPaise={b.paidPaise}
              totalPaise={b.totalPaise}
              payments={b.payments}
            />
          ) : (
            <DeskActions booking={b} only={m.key as 'mark-paid' | 'release' | 'refund-made'} />
          )}
        </div>
      )}
    </article>
  );
}

function StageBody({ step, b }: { step: Step; b: AdminBooking }) {
  const events = b.history.entries.filter((e) => step.kinds.includes(e.kind));
  const list = events.length > 0 && (
    <ul className="grid gap-2">
      {events.map((e) => (
        <li key={e.id} className="grid gap-px">
          <small className="text-[11.5px] font-bold text-mute">
            {istFullDate(e.at)} · {e.approx ? '≈ ' : ''}
            {istTime(e.at)} · {e.actorLabel}
          </small>
          <span>{e.text}</span>
        </li>
      ))}
    </ul>
  );
  if (step.name === 'Booked') {
    return (
      <>
        <p>
          {b.travellers.length} traveller{b.travellers.length === 1 ? '' : 's'} · {b.package.name},{' '}
          {formatDate(b.departs)} → {formatDate(b.returns)}.
        </p>
        <div className="grid gap-1">
          {b.quote.lines.map((l) => (
            <div key={`${l.kind}-${l.occupancy}`} className="flex justify-between gap-3">
              <span className="text-ink2">
                {lineLabel(l, b.quote.deal?.label)} · {l.count} × {l.unitPaise < 0 ? '−' : ''}
                {inr(Math.abs(l.unitPaise))}
              </span>
              <span className="num">
                {l.amountPaise < 0 ? '−' : ''}
                {inr(Math.abs(l.amountPaise))}
              </span>
            </div>
          ))}
          {b.quote.coupon && (
            <div className="flex justify-between gap-3 font-bold text-ok">
              <span>Coupon {b.quote.coupon.code}</span>
              <span className="num">−{inr(b.quote.coupon.offPaise)}</span>
            </div>
          )}
          {b.quote.manual && (
            <div className="flex justify-between gap-3 font-bold text-ok">
              <span className="min-w-0">
                Manual discount{b.quote.manual.percent ? ` (${b.quote.manual.percent} %)` : ''}
                <span className="block text-[12px] font-semibold text-mute">
                  “{b.quote.manual.reason}”
                </span>
              </span>
              <span className="num">−{inr(b.quote.manual.offPaise)}</span>
            </div>
          )}
          {b.quote.changeFeePaise > 0 && (
            <div className="flex justify-between gap-3">
              <span className="text-ink2">Date-change fee</span>
              <span className="num">{inr(b.quote.changeFeePaise)}</span>
            </div>
          )}
          <BookedAddons
            quote={b.quote}
            addons={b.addons ?? []}
            action={
              b.canRemoveAddons ? (a) => <RemoveAddon bookingRef={b.ref} addon={a} /> : undefined
            }
          />
          <div className="flex justify-between border-t border-ink pt-1.5 font-bold">
            <span>Total</span>
            <span className="num">{inr(b.totalPaise)}</span>
          </div>
        </div>
        <ol className="grid gap-1 text-[13px]">
          {b.travellers.map((t, i) => (
            <li key={`${t.name}-${i}`} className="flex justify-between gap-2">
              <span>
                {i + 1}. <b>{t.name}</b>{' '}
                {t.age != null && <span className="text-mute">· {t.age}</span>}
              </span>
              <span className="text-mute">{OCCUPANCY_LABEL[t.occupancy]}</span>
            </li>
          ))}
        </ol>
        {b.canEditTravellers && (
          <div>
            <EditTravellers booking={b} />
          </div>
        )}
        {list}
      </>
    );
  }
  if (step.name === 'Cancel requested' && b.cancellation) {
    const c = b.cancellation;
    return (
      <>
        <blockquote className="border-l-2 border-warn pl-3 break-words italic">
          “{c.reason}”
        </blockquote>
        <p>
          Asked {istFullDate(c.requestedAt)}, <b>{c.daysOut} days</b> before departure. Policy:{' '}
          <b>{c.tier}</b> — {inr(c.suggestedRefundPaise)} of {inr(b.paidPaise)} would go back.
        </p>
      </>
    );
  }
  if (list) return list;
  const AHEAD: Record<string, string> = {
    Paid: 'Reached when the customer pays, or when you mark it paid.',
    Departs: `${formatDate(b.departs)} · back ${formatDate(b.returns)}.`,
    Completed: 'Marked by the daily tidy the day after departure; then the customer can review.',
    'Checkout open': `The seats are held until ${istTime(b.holdExpiresAt)}.`,
    'Hold lapsed': `The hold lapsed at ${istTime(b.holdExpiresAt)}, ${istFullDate(b.holdExpiresAt)}; its seats are free for others.`,
    Refunded: 'Reached when Razorpay processes the refund, or you record an offline one.',
    Refunding: 'Razorpay has the refund and is processing it; it reports back when done.',
    Closed: 'Nothing owed either way. The booking stays in the desk and in the history.',
  };
  return <p className="text-ink2">{AHEAD[step.name] ?? 'Nothing recorded at this step yet.'}</p>;
}

function Money({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid gap-0.5 px-4 py-2.5 [&+&]:border-l [&+&]:border-line">
      <dt className="label-caps text-[10.5px] text-mute">{k}</dt>
      <dd className="num m-0 text-[15px] font-extrabold">{v}</dd>
    </div>
  );
}
