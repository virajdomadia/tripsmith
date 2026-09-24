/**
 * The itinerary download: the web's own route handler (`app/(site)/packages/[slug]/
 * itinerary.pdf/route.ts`), which forwards the visitor's address to the api so its per-IP
 * download ceiling is per visitor (the api 302s to the current Blob copy). First-party and
 * stable. Mirrored by `pdf_url` in the emails (api/app/services/email/render.py).
 */
export const itineraryPdfHref = (slug: string) =>
  `/packages/${encodeURIComponent(slug)}/itinerary.pdf`;
