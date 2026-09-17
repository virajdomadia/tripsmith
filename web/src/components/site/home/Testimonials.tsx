import Link from 'next/link';
import type { components } from '@/lib/api-types';
import { Pin } from './icons';

type Testimonial = components['schemas']['TestimonialOut'];

/** "Priya and Rohan Mehta" → "PR"; "Sneha Iyer" → "SI". */
const initials = (name: string) =>
  name
    .split(/\s+and\s+|\s+/)
    .filter((w) => /^[A-Z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('');

const TILT = ['-rotate-[0.6deg]', 'rotate-[0.7deg]', '-rotate-[0.4deg]'];

/** Notepaper cards (S1): a strip of marigold tape, initials, stars, the quote, the trip pill. */
export function Testimonials({ items }: { items: Testimonial[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="grid gap-4.5 md:grid-cols-3">
      {items.map((t, i) => (
        <li
          key={`${t.name}-${i}`}
          className={`relative grid content-start gap-2.5 rounded-[12px] border border-line bg-bg p-5.5 shadow-[0_16px_34px_-22px_rgb(20_32_42/0.35)] ${TILT[i % TILT.length]}`}
        >
          <span
            aria-hidden
            className="absolute -top-2.5 left-1/2 h-[22px] w-[70px] -translate-x-1/2 -rotate-3 rounded-[2px] bg-action/45"
          />
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="grid size-[42px] shrink-0 place-items-center rounded-full bg-primary font-extrabold text-white"
            >
              {initials(t.name)}
            </span>
            <span>
              <b className="block">{t.name}</b>
              <small className="text-mute">{t.city}</small>
            </span>
          </div>
          <span
            role="img"
            aria-label={`${t.rating} out of 5 stars`}
            className="text-[13px] tracking-[2px] text-action"
          >
            {'★'.repeat(t.rating)}
            <span className="text-line">{'★'.repeat(5 - t.rating)}</span>
          </span>
          <p className="text-[15px]">“{t.text}”</p>
          {t.packageSlug && t.packageName ? (
            <Link
              href={`/packages/${t.packageSlug}`}
              className="inline-flex w-max items-center gap-1.5 rounded-chip bg-bg2 px-2.5 py-1 text-xs font-bold text-primary no-underline hover:bg-primary-soft"
            >
              <Pin className="size-3.5" />
              {t.packageName}
            </Link>
          ) : (
            <span className="inline-flex w-max items-center gap-1.5 rounded-chip bg-bg2 px-2.5 py-1 text-xs font-bold text-primary">
              <Pin className="size-3.5" />
              Verified traveller
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
