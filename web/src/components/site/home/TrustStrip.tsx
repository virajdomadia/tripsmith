import { Calendar, Phone } from './icons';

/**
 * Two proof points under the chips; the departure count is live. Review 2026-11-27 (M6): one
 * line of text, not a third row of four cards repeating "Why book with Tripsmith" below.
 */
export function TrustStrip({ departures }: { departures: number }) {
  const items = [
    [Calendar, `${departures} departures this season, with live seats`],
    [Phone, 'A person calls back within 2 hours, 10 am to 8 pm'],
  ] as const;
  return (
    <ul className="mt-8 flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm font-semibold text-ink2">
      {items.map(([Icon, text]) => (
        <li key={text} className="flex items-center gap-2">
          <Icon className="size-[18px] shrink-0 text-primary" />
          <span className="num">{text}</span>
        </li>
      ))}
    </ul>
  );
}
