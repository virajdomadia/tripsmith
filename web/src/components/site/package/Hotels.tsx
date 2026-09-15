import type { components } from '@/lib/api-types';

type Hotel = components['schemas']['HotelOut'];

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

export function Hotels({ hotels }: { hotels: Hotel[] }) {
  return (
    <ul className="grid gap-3">
      {hotels.map((h) => (
        <li
          key={`${h.name}-${h.city}`}
          className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[14px] border border-line p-4"
        >
          <b className="text-lg">{h.name}</b>
          <span aria-label={`${h.stars} star`} className="tracking-wider text-action">
            {stars(h.stars)}
          </span>
          <span className="text-sm text-mute">
            {h.city} · {h.nights} {h.nights === 1 ? 'night' : 'nights'}
          </span>
        </li>
      ))}
    </ul>
  );
}
