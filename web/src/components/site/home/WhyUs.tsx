import { Bed, File, Phone, Shield } from './icons';

// The mockup's four points; the PDF shipped in F11.
const WHY = [
  [
    Shield,
    'Real departures, real seats',
    'Every date on the site is a departure we run, with live seat counts.',
  ],
  [
    Phone,
    'A person calls within 2 hours',
    'Enquire and someone from our Bengaluru office calls you, 10 am to 8 pm.',
  ],
  [
    File,
    'Itineraries you can forward',
    'Day-by-day plans written out in full, as a PDF you can send to the family group and decide together.',
  ],
  [Bed, 'Hotels we have stayed in', 'Every property checked by us. No surprises on arrival.'],
] as const;

/** Review 2026-11-27 (M6): a two-column list on a tinted panel, not four equal cards. */
export function WhyUs() {
  return (
    <ul className="grid gap-x-12 gap-y-7 rounded-card bg-bg2 p-6 sm:grid-cols-2 sm:p-9">
      {WHY.map(([Icon, title, text]) => (
        <li key={title} className="grid grid-cols-[auto_1fr] gap-x-4">
          <Icon className="row-span-2 mt-0.5 size-7 text-primary" />
          <b className="block text-base font-extrabold">{title}</b>
          <p className="max-w-[46ch] text-sm text-ink2">{text}</p>
        </li>
      ))}
    </ul>
  );
}
