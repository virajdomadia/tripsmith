import { Bed, Calendar, Phone, Rupee } from './icons';

/** Four proof points under the chips; the departure count is live, the rest are promises. */
export function TrustStrip({ departures }: { departures: number }) {
  const items = [
    [Calendar, `${departures} departures`, 'this season, live seats'],
    [Phone, '2-hour callback', '10 am – 8 pm, every day'],
    [Bed, 'Hotels we’ve stayed in', 'checked by us'],
    [Rupee, 'Honest pricing', 'what you see is what you pay'],
  ] as const;
  return (
    <ul className="mt-11 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(([Icon, title, sub]) => (
        <li
          key={title}
          className="flex items-center gap-3 rounded-[14px] bg-bg2 px-4 py-3.5 text-sm"
        >
          <Icon className="size-[22px] shrink-0 text-primary" />
          <span>
            <b className="num block font-extrabold">{title}</b>
            <span className="text-mute">{sub}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
