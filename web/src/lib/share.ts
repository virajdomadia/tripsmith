/**
 * Share helpers for the package page (R7). Pure so the buttons can stay thin and the strings
 * are tested; `navigator.share` / clipboard live in the component.
 */

/** `North Goa Beaches — 3N / 4D · Goa` on one line, the URL on the next (WhatsApp unfurls it). */
export const shareText = (name: string, line: string, url: string) => `${name} — ${line}\n${url}`;

/** Share *to a contact*: `wa.me/?text=…` with no number, unlike `whatsappHref` which messages us. */
export const whatsappShareHref = (text: string) =>
  `https://wa.me/?text=${encodeURIComponent(text)}`;
