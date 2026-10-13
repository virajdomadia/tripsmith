/**
 * The contact-field rules the enquiry form, the Book-now sheet and the counter share — kept
 * apart from `enquiry-schema.ts` so the package page's client code doesn't pull in zod (P19).
 */

export const PHONE_MESSAGE = 'Enter a 10-digit Indian mobile number';
export const PHONE_RE = /^[6-9][0-9]{9}$/;
/** C0 + DEL + C1 controls and U+2028/9 — mirrors `CONTROL_RE` in the api schema. */
export const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** `+91 98450-22110` / `09845022110` / `919845022110` → `9845022110`. Never invents digits. */
export function normalisePhone(raw: string): string {
  let digits = raw.trim().replace(/[\s\-.()]/g, '');
  if (digits.startsWith('+91')) digits = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}
