/**
 * The one place the business's contact details live (header, footer, callback band, JSON-LD,
 * F8 contact page). The WhatsApp number comes from the env so preview/prod can differ.
 */
const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '919845012345';

export const BUSINESS = {
  name: 'Tripsmith',
  legalName: 'Tripsmith Holidays',
  address: '14 Church Street',
  city: 'Bengaluru 560001',
  phoneDisplay: '+91 98450 12345',
  phoneHref: 'tel:+919845012345',
  email: 'hello@tripsmith.in',
  hours: '10 am – 8 pm, every day',
  callbackPromise: 'A person calls you back within two hours',
} as const;

/** `https://wa.me/<number>[?text=…]` — the only WhatsApp deep link the site uses. */
export function whatsappHref(text?: string): string {
  const base = `https://wa.me/${WHATSAPP_NUMBER}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
