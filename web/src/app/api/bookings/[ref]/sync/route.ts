import { forwardAuth, passThrough } from '@/lib/auth/forward';

const REF = /^TB-[A-Z0-9]{6}$/;

/**
 * `POST /api/bookings/{ref}/sync` — the Book-now sheet asks whether Razorpay took the money
 * after Checkout closed. A handler rather than the `/api` rewrite (review 2026-11-27, L2): the
 * api limits syncs per visitor address as well as per booking, and on the rewrite hop every
 * visitor shares the web function's address, so that limit would be site-wide.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ ref: string }> },
): Promise<Response> {
  const { ref } = await params;
  if (!REF.test(ref))
    return Response.json(
      { error: { code: 'not_found', message: 'No booking with that reference' } },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { code: 'validation', message: 'Send JSON' } },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return passThrough(await forwardAuth(`/bookings/${ref}/sync`, request, body));
}
