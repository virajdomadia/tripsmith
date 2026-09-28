'use client';

import { ImageIcon, Minus, Plus } from 'lucide-react';
import Image from 'next/image';
import { type Addon, addonUnit } from '@/lib/booking';
import { cn } from '@/lib/utils';
import type { BookingFlow } from './use-booking';

const stepper =
  'grid size-9 place-items-center transition-colors hover:bg-bg2 disabled:cursor-default disabled:text-[#c3c9cf] disabled:hover:bg-transparent';

/**
 * "Make it yours" (R46, P8; Book now B's menu): one row per add-on the owner has on sale — a
 * switch for a per-booking one, a traveller stepper for a per-traveller one, a nights picker for
 * a per-night one (the whole party stays on). Nothing is priced here: each tap re-asks the quote,
 * and the receipt beside it shows the server's line. Discounts never touch these.
 */
export function MakeItYours({ flow }: { flow: BookingFlow }) {
  const { offered, picks, party } = flow;
  return (
    <div className="grid gap-2">
      {/* Mounted before it has anything to say, so screen readers announce the change. */}
      <p
        role="status"
        className={
          flow.addonNotice
            ? 'rounded-[10px] bg-warn-soft px-2.5 py-2 text-[13px] font-bold text-warn'
            : 'sr-only'
        }
      >
        {flow.addonNotice}
      </p>
      <ul className="grid overflow-hidden rounded-[14px] border border-line">
        {offered.map((a) => {
          const n = Math.min(picks[a.id] ?? 0, a.basis === 'traveller' ? party : Infinity);
          return (
            <li
              key={a.id}
              className={cn(
                'grid grid-cols-[40px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-3.5 py-3 transition-[background-color,box-shadow] duration-200 sm:grid-cols-[40px_minmax(0,1fr)_auto] [&+&]:border-t [&+&]:border-line',
                n > 0 && 'bg-primary-soft/60 shadow-[inset_3px_0_0_var(--color-primary)]',
              )}
            >
              <span
                aria-hidden
                className="relative grid size-10 place-items-center overflow-hidden rounded-full bg-bg2 text-mute"
              >
                {a.image ? (
                  <Image src={a.image.url} alt="" fill sizes="40px" className="object-cover" />
                ) : (
                  <ImageIcon className="size-4" />
                )}
              </span>
              <span className="grid min-w-0">
                <b className="text-[15px] leading-snug">{a.name}</b>
                <small className="num text-[12.5px] font-bold text-mute">{addonUnit(a)}</small>
              </span>
              <span className="col-start-2 row-start-3 sm:col-start-3 sm:row-start-1">
                <Control addon={a} value={n} party={party} set={(v) => flow.setPick(a.id, v)} />
              </span>
              {a.description && (
                <p className="col-start-2 text-[12.5px] leading-snug text-ink2 sm:col-end-4">
                  {a.description}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Control({
  addon: a,
  value,
  party,
  set,
}: {
  addon: Addon;
  value: number;
  party: number;
  set: (n: number) => void;
}) {
  if (a.basis === 'booking')
    return (
      <button
        type="button"
        role="switch"
        aria-checked={value > 0}
        aria-label={`${a.name}, ${addonUnit(a)}`}
        onClick={() => set(value > 0 ? 0 : 1)}
        className={cn(
          'relative h-7 w-[46px] flex-none rounded-full transition-colors duration-200',
          value > 0 ? 'bg-primary' : 'bg-[#c3ccd6]',
        )}
      >
        <i
          aria-hidden
          className={cn(
            'absolute top-[3px] left-[3px] size-[22px] rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-300 ease-(--ease-out) motion-reduce:transition-none',
            value > 0 && 'translate-x-[18px]',
          )}
        />
      </button>
    );
  if (a.basis === 'traveller')
    return (
      <span
        role="group"
        aria-label={`${a.name}: travellers`}
        className="inline-flex items-center overflow-hidden rounded-[10px] border-[1.5px] border-line"
      >
        <button
          type="button"
          aria-label={`One fewer traveller for ${a.name}`}
          disabled={value === 0}
          onClick={() => set(value - 1)}
          className={stepper}
        >
          <Minus className="size-4" />
        </button>
        <output
          aria-live="polite"
          aria-label={`${a.name}: ${value} ${value === 1 ? 'traveller' : 'travellers'}`}
          className="num min-w-7 text-center font-extrabold"
        >
          {value}
        </output>
        <button
          type="button"
          aria-label={`One more traveller for ${a.name}`}
          disabled={value >= party}
          onClick={() => set(value + 1)}
          className={stepper}
        >
          <Plus className="size-4" />
        </button>
      </span>
    );
  const nights = Array.from({ length: (a.maxNights ?? 1) + 1 }, (_, i) => i);
  return (
    <span
      role="group"
      aria-label={`${a.name}: nights`}
      className="inline-flex overflow-hidden rounded-[10px] border-[1.5px] border-line"
    >
      {nights.map((i) => (
        <button
          key={i}
          type="button"
          aria-pressed={value === i}
          onClick={() => set(i)}
          className={cn(
            'px-2.5 py-2 text-[13px] font-bold transition-colors [&+&]:border-l-[1.5px] [&+&]:border-line',
            value === i ? 'bg-ink text-white' : 'bg-bg text-ink hover:bg-bg2',
          )}
        >
          {i === 0 ? 'None' : `${i} ${i === 1 ? 'night' : 'nights'}`}
        </button>
      ))}
    </span>
  );
}
