import { BUSINESS } from '@/lib/business';

/**
 * Contact links for one enquiry. These point at the **visitor**, not at the business — unlike
 * `whatsappHref` in lib/business.ts, which always opens a chat with Tripsmith.
 *
 * Phones are stored as the bare ten digits the enquiry form normalises to, so every link here
 * adds the country code itself.
 */

interface EnquiryLike {
  name: string;
  ref: string;
  package?: { name: string } | null;
}

export const telHref = (phone: string) => `tel:+91${phone}`;

export const waHref = (phone: string, text: string) =>
  `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;

export const mailtoHref = (email: string, subject: string) =>
  `mailto:${email}?subject=${encodeURIComponent(subject)}`;

/** The opener the owner sends: who is calling, about which trip, and the ref to quote back. */
export function replyMessage(e: EnquiryLike): string {
  const first = e.name.trim().split(/\s+/)[0] ?? e.name;
  const trip = e.package ? ` for ${e.package.name}` : '';
  return `Hi ${first}, this is ${BUSINESS.name} about your enquiry${trip} (${e.ref}).`;
}

export const emailSubject = (e: EnquiryLike) => `${BUSINESS.name} · your enquiry ${e.ref}`;
