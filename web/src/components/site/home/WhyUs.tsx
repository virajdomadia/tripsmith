import { Bed, File, Phone, Shield } from './icons';

// The mockup's four points; the PDF shipped in F11.
const WHY = [
  [
    Shield,
    'Real departures, real seats',
    'Every date on the site is a departure we run — with live seat counts.',
  ],
  [
    Phone,
    'A person calls within 2 hours',
    'Enquire and someone from our Bengaluru office calls you, 10 am – 8 pm.',
  ],
  [
    File,
    'Itineraries you can forward',
    'Day-by-day plans written out in full, as a PDF you can send to the family group and decide together.',
  ],
  [Bed, 'Hotels we have stayed in', 'Every property checked by us. No surprises on arrival.'],
] as const;

export function WhyUs() {
  return (
    <ul className="grid gap-4.5 sm:grid-cols-2 lg:grid-cols-4">
      {WHY.map(([Icon, title, text]) => (
        <li key={title} className="rounded-[16px] border border-line p-5.5">
          <Icon className="mb-3 size-7 text-action-ink" />
          <b className="mb-1 block text-base font-extrabold">{title}</b>
          <p className="text-sm text-mute">{text}</p>
        </li>
      ))}
    </ul>
  );
}
