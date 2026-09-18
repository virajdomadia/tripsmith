/**
 * The one place the business's contact details live (header, footer, callback band, JSON-LD,
 * contact page). The WhatsApp number comes from the env so preview/prod can differ.
 */
const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '919845012345';

export const BUSINESS = {
  name: 'Tripsmith',
  legalName: 'Tripsmith Holidays',
  address: '14 Church Street',
  addressLine2: '2nd floor · walk-ins welcome',
  city: 'Bengaluru 560001',
  phoneDisplay: '+91 98450 12345',
  phoneHref: 'tel:+919845012345',
  email: 'hello@tripsmith.in',
  hours: '10 am – 8 pm, every day',
  afterHours: 'After hours, WhatsApp us — we reply first thing next morning.',
  callbackPromise: 'A person calls you back within two hours',
  founded: 2019,
  /** Keyless classic embed — no API key, no cookies until the visitor interacts with the map. */
  mapEmbedSrc:
    'https://maps.google.com/maps?q=Church%20Street%2C%20Bengaluru%20560001&z=16&output=embed',
  mapsHref: 'https://maps.google.com/?q=Church+Street,+Bengaluru+560001',
} as const;

/** `https://wa.me/<number>[?text=…]` — the only WhatsApp deep link the site uses. */
export function whatsappHref(text?: string): string {
  const base = `https://wa.me/${WHATSAPP_NUMBER}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
