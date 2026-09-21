/**
 * The api's itinerary route, reached through the web's `/api` rewrite so the link is first-party
 * and stable (the api 302s to the current Blob copy). Mirrored by `pdf_url` in the emails.
 */
export const itineraryPdfHref = (slug: string) =>
  `/api/packages/${encodeURIComponent(slug)}/itinerary.pdf`;
