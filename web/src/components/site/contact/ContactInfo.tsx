import type { ReactNode, SVGProps } from 'react';
import { BUSINESS, whatsappHref, whatsappInterest } from '@/lib/business';
import { Clock, Mail, Phone, Pin, WhatsApp } from '../home/icons';

type Row = { icon: (p: SVGProps<SVGSVGElement>) => ReactNode; main: ReactNode; sub?: ReactNode };

/** S9 info list: phone, WhatsApp, email, address, hours — every fact from `BUSINESS`. */
export function ContactInfo() {
  const rows: Row[] = [
    {
      icon: Phone,
      main: (
        <a href={BUSINESS.phoneHref} className="num font-bold no-underline hover:underline">
          {BUSINESS.phoneDisplay}
        </a>
      ),
      sub: 'Rohan, Anita or Sneha — no call centre',
    },
    {
      icon: WhatsApp,
      main: (
        <a
          href={whatsappHref(whatsappInterest())}
          className="font-bold no-underline hover:underline"
        >
          WhatsApp
        </a>
      ),
      sub: 'Send us a trip link and your dates',
    },
    {
      icon: Mail,
      main: (
        <a href={`mailto:${BUSINESS.email}`} className="font-bold no-underline hover:underline">
          {BUSINESS.email}
        </a>
      ),
    },
    {
      icon: Pin,
      main: (
        <a
          href={BUSINESS.mapsHref}
          target="_blank"
          rel="noreferrer"
          className="font-bold no-underline hover:underline"
        >
          {BUSINESS.address}, {BUSINESS.city}
        </a>
      ),
      sub: BUSINESS.addressLine2,
    },
    { icon: Clock, main: <b>{BUSINESS.hours}</b>, sub: BUSINESS.afterHours },
  ];
  return (
    <ul className="grid gap-4">
      {rows.map(({ icon: Icon, main, sub }, i) => (
        <li key={i} className="flex items-start gap-3.5">
          <Icon className="mt-0.5 size-6 shrink-0 text-action-ink" />
          <div className="leading-snug">
            {main}
            {sub && <span className="block text-sm text-mute">{sub}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}
