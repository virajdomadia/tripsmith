import type { components } from '@/lib/api-types';
import { mealsLabel } from '@/lib/format';
import { Bed, Meal } from './icons';

type Day = components['schemas']['ItineraryDayOut'];

/**
 * Day-by-day timeline. Ships fully lit (`is-lit` on every day) so no-JS and reduced-motion readers
 * see the finished state; `ItineraryMotion` draws the route and re-lights the days with scroll.
 */
export function Itinerary({ days }: { days: Day[] }) {
  return (
    <div className="relative">
      <span
        data-route
        aria-hidden
        className="absolute top-5 bottom-5 left-[16px] w-0.5 origin-top bg-primary"
      />
      <ol data-itinerary className="grid">
        {days.map((d) => (
          <li
            key={d.dayNo}
            data-day
            className="is-lit relative border-t border-line py-5 pl-[46px] last:border-b"
          >
            <span className="absolute top-5 left-0 grid h-[34px] w-[34px] place-items-center rounded-[10px] bg-primary-soft text-sm font-extrabold text-primary transition-colors duration-500 [.is-lit>&]:bg-primary [.is-lit>&]:text-white">
              {d.dayNo}
            </span>
            <h3 className="mb-1.5 text-[19px]">{d.title}</h3>
            <p className="mb-2.5 max-w-[62ch] text-ink2">{d.description}</p>
            <div className="flex flex-wrap gap-2 text-xs font-bold text-mute">
              <span className="inline-flex items-center gap-1.5 rounded-chip bg-bg2 px-2.5 py-1">
                <Meal className="h-3.5 w-3.5 text-primary" />
                {mealsLabel(d.meals)}
              </span>
              {d.stay && (
                <span className="inline-flex items-center gap-1.5 rounded-chip bg-bg2 px-2.5 py-1">
                  <Bed className="h-3.5 w-3.5 text-primary" />
                  Stay · {d.stay}
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
