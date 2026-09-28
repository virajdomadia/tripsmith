/**
 * GST at checkout and on the booking pages (R51, P13b). The State list and the GSTIN rule mirror
 * `api/app/services/gst/tax.py` STATES and `schemas/bookings.py` GSTIN_RE — change both. The api
 * re-checks everything.
 */

/** State or UT → its GST code (a GSTIN's first two digits). */
export const GST_STATES: Record<string, string> = {
  'Andaman and Nicobar Islands': '35',
  'Andhra Pradesh': '37',
  'Arunachal Pradesh': '12',
  Assam: '18',
  Bihar: '10',
  Chandigarh: '04',
  Chhattisgarh: '22',
  'Dadra and Nagar Haveli and Daman and Diu': '26',
  Delhi: '07',
  Goa: '30',
  Gujarat: '24',
  Haryana: '06',
  'Himachal Pradesh': '02',
  'Jammu and Kashmir': '01',
  Jharkhand: '20',
  Karnataka: '29',
  Kerala: '32',
  Ladakh: '38',
  Lakshadweep: '31',
  'Madhya Pradesh': '23',
  Maharashtra: '27',
  Manipur: '14',
  Meghalaya: '17',
  Mizoram: '15',
  Nagaland: '13',
  Odisha: '21',
  Puducherry: '34',
  Punjab: '03',
  Rajasthan: '08',
  Sikkim: '11',
  'Tamil Nadu': '33',
  Telangana: '36',
  Tripura: '16',
  'Uttar Pradesh': '09',
  Uttarakhand: '05',
  'West Bengal': '19',
};
export const STATE_NAMES = Object.keys(GST_STATES);
const isState = (s: string) => Object.hasOwn(GST_STATES, s);

export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const normaliseGstin = (raw: string) => raw.trim().toUpperCase().replace(/\s+/g, '');

/** The checkout's State / GSTIN / company errors, keyed as the api names them. */
export function billingErrors(state: string, gstin: string, companyName: string) {
  const errors: Record<string, string> = {};
  if (!isState(state)) errors['contact.state'] = 'Pick your State — it goes on the invoice';
  const g = normaliseGstin(gstin);
  if (g) {
    if (!GSTIN_RE.test(g))
      errors['contact.gstin'] = 'Enter a 15-character GSTIN, like 29ABCDE1234F1Z5';
    else if (isState(state) && GST_STATES[state] !== g.slice(0, 2))
      errors['contact.gstin'] =
        `This GSTIN is registered in another State (code ${g.slice(0, 2)}) — pick that State, or check the number`;
    if (!companyName.trim())
      errors['contact.companyName'] = 'Enter the company name registered to this GSTIN';
  }
  return errors;
}

export type GstDocument = {
  key: string;
  kind: 'receipt' | 'invoice' | 'credit_note';
  title: string;
  number: string | null;
  amountPaise: number;
  dated: string;
};

/** The download link — the web route that proxies the api with the viewer's cookie. */
export const documentHref = (ref: string, key: string) =>
  `/account/bookings/${encodeURIComponent(ref)}/documents/${encodeURIComponent(key)}`;
