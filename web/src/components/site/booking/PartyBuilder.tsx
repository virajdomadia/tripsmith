'use client';

import { Minus, Plus } from 'lucide-react';
import {
  adultsIn,
  canAdd,
  canRemove,
  CHILD_MAX_AGE,
  CHILD_MIN_AGE,
  MAX_TRAVELLERS,
  type RoomKind,
} from '@/lib/booking';
import { formatDate, inr } from '@/lib/format';
import { control } from '../enquiry/Field';
import type { BookingFlow } from './use-booking';

const ROWS: { kind: RoomKind; title: string; hint: string }[] = [
  { kind: 'double', title: 'Double room', hint: '2 adults, twin sharing' },
  { kind: 'triple', title: 'Triple room', hint: '3 adults, with an extra bed' },
  { kind: 'single', title: 'Single room', hint: '1 adult, with a supplement' },
  {
    kind: 'children',
    title: `Children ${CHILD_MIN_AGE}–${CHILD_MAX_AGE}`,
    hint: 'Share a parent’s room, child rate',
  },
];

/**
 * Step 2 (B0 `.rooms`): rooms rather than headcounts, because a room is what the api prices —
 * a double is filled by two adults, so the party can never break the occupancy rule the api
 * 400s on. Then one name + age per traveller (the order needs both), grouped by room.
 */
export function PartyBuilder({ flow }: { flow: BookingFlow }) {
  const { rooms, party, departure, reason, slots, travellers, errors } = flow;
  const adults = adultsIn(rooms);
  const step = (kind: RoomKind, by: 1 | -1) =>
    flow.setRooms((r) => ({ ...r, [kind]: Math.max(0, r[kind] + by) }));

  return (
    <div className="grid gap-3">
      <div className="grid">
        {ROWS.map(({ kind, title, hint }) => (
          <div
            key={kind}
            className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-line py-2 last:border-b-0"
          >
            <div>
              <b className="block text-[15px]">{title}</b>
              <small className="text-[12.5px] font-semibold text-mute">
                {kind === 'single' && departure
                  ? `1 adult, +${inr(departure.singleSupplementPaise)} supplement`
                  : hint}
              </small>
            </div>
            <div className="inline-flex items-center overflow-hidden rounded-[10px] border-[1.5px] border-line">
              <button
                type="button"
                aria-label={`Fewer: ${title}`}
                disabled={!canRemove(rooms, kind)}
                onClick={() => step(kind, -1)}
                className="grid size-10 place-items-center transition-colors hover:bg-bg2 disabled:cursor-default disabled:text-[#c3c9cf] disabled:hover:bg-transparent"
              >
                <Minus className="size-4" />
              </button>
              <output
                aria-live="polite"
                aria-label={title}
                className="num min-w-8 text-center font-extrabold"
              >
                {rooms[kind]}
              </output>
              <button
                type="button"
                aria-label={`More: ${title}`}
                disabled={!canAdd(rooms, kind)}
                onClick={() => step(kind, 1)}
                className="grid size-10 place-items-center transition-colors hover:bg-bg2 disabled:cursor-default disabled:text-[#c3c9cf] disabled:hover:bg-transparent"
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {reason === 'short' && departure && (
        <p
          role="status"
          className="rounded-[10px] bg-warn-soft px-2.5 py-2 text-[13px] font-bold text-warn"
        >
          Only {departure.seatsLeft} {departure.seatsLeft === 1 ? 'seat' : 'seats'} left on{' '}
          {formatDate(departure.date)}, and your party needs {party}. Pick another date or fewer
          travellers.
        </p>
      )}
      <p className="text-[12.5px] text-mute">
        {adults} {adults === 1 ? 'adult' : 'adults'}, {rooms.children}{' '}
        {rooms.children === 1 ? 'child' : 'children'} · up to {MAX_TRAVELLERS} per booking.
      </p>

      <fieldset className="grid gap-2.5">
        <legend className="label-caps mb-2 text-mute">Names, as on their ID</legend>
        {slots.map((s, i) => {
          const t = travellers[s.key] ?? { name: '', age: '' };
          const nameErr = errors[`travellers.${i}.name`];
          const ageErr = errors[`travellers.${i}.age`];
          const newRoom = i === 0 || slots[i - 1].room !== s.room;
          return (
            <div key={s.key} className="grid gap-1 animate-rise">
              {newRoom && <span className="mt-1 text-xs font-bold text-ink2">{s.room}</span>}
              <div className="grid grid-cols-[1fr_84px] gap-2">
                <label className="sr-only" htmlFor={`t-${s.key}-name`}>
                  Traveller {i + 1} name
                </label>
                <input
                  id={`t-${s.key}-name`}
                  className={control}
                  placeholder={`Traveller ${i + 1}`}
                  autoComplete={i === 0 ? 'name' : 'off'}
                  maxLength={80}
                  value={t.name}
                  aria-invalid={nameErr ? true : undefined}
                  aria-describedby={nameErr ? `t-${s.key}-name-err` : undefined}
                  onChange={(e) => flow.setTraveller(s.key, { name: e.target.value })}
                  onBlur={() => {
                    // The first traveller is usually the one booking: offer their name as the contact.
                    if (i === 0 && !flow.contact.name.trim() && t.name.trim())
                      flow.updateContact({ name: t.name.trim() });
                  }}
                />
                <label className="sr-only" htmlFor={`t-${s.key}-age`}>
                  Traveller {i + 1} age
                </label>
                <input
                  id={`t-${s.key}-age`}
                  className={`${control} num`}
                  placeholder="Age"
                  inputMode="numeric"
                  maxLength={3}
                  value={t.age}
                  aria-invalid={ageErr ? true : undefined}
                  aria-describedby={ageErr ? `t-${s.key}-age-err` : undefined}
                  onChange={(e) =>
                    flow.setTraveller(s.key, { age: e.target.value.replace(/[^0-9]/g, '') })
                  }
                />
              </div>
              {nameErr && (
                <p id={`t-${s.key}-name-err`} className="text-xs font-semibold text-warn">
                  {nameErr}
                </p>
              )}
              {ageErr && (
                <p id={`t-${s.key}-age-err`} className="text-xs font-semibold text-warn">
                  {ageErr}
                </p>
              )}
            </div>
          );
        })}
      </fieldset>
    </div>
  );
}
