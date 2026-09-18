import type { EnquiryBody } from './enquiry-schema';

/**
 * Server-side hop web → api for enquiries. Vercel rewrites `X-Forwarded-For` to the web
 * function's own egress address on this hop, so the visitor's address travels under
 * `X-Client-Ip`, which the api trusts only alongside the shared `REVALIDATE_SECRET`
 * (api/app/routers/site/enquiries.py::client_ip). Without the secret the api falls back to
 * whatever Vercel stamps — the site-wide bucket — rather than refusing.
 */

const API_URL = (process.env.API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

/** The visitor's address as Vercel stamps it on the request that reached the web. */
export function visitorIp(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || request.headers.get('x-real-ip')?.trim() || undefined;
}

export type EnquiryCreated = {
  ref: string;
  firstName: string;
  package: { slug: string; name: string } | null;
  emailed: boolean;
};

/** POSTs to the api; returns the raw response (201 or an envelope) or `undefined` when unreachable. */
export async function forwardEnquiry(
  body: EnquiryBody,
  request: Request,
): Promise<Response | undefined> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': request.headers.get('user-agent') ?? 'tripsmith-web',
  };
  const ip = visitorIp(request);
  const secret = process.env.REVALIDATE_SECRET;
  if (ip && secret) {
    headers['X-Client-Ip'] = ip;
    headers['X-Internal-Secret'] = secret;
  }
  return fetch(`${API_URL}/enquiries`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    cache: 'no-store',
  }).catch(() => undefined);
}
