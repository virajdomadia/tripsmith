import { forwardEnquiry } from '@/lib/enquiry-forward';
import { enquirySchema, fieldErrorsOf } from '@/lib/enquiry-schema';

/**
 * `POST /api/enquiries` — the JavaScript path. A route handler rather than the `/api/:path*`
 * rewrite so the visitor's real address reaches the api's rate limiter (see enquiry-forward.ts).
 * The body is re-validated by the zod mirror; the api's envelope passes through as-is.
 */
export async function POST(request: Request): Promise<Response> {
  const raw: unknown = await request.json().catch(() => undefined);
  const parsed = enquirySchema.safeParse(raw);
  if (!parsed.success)
    return Response.json(
      {
        error: {
          code: 'validation',
          message: 'Request validation failed',
          fieldErrors: fieldErrorsOf(parsed.error),
        },
      },
      { status: 400 },
    );
  const res = await forwardEnquiry(parsed.data, request);
  if (!res)
    return Response.json(
      { error: { code: 'internal', message: 'Could not reach the api' } },
      { status: 502 },
    );
  const retryAfter = res.headers.get('retry-after');
  return new Response(res.body, {
    status: res.status,
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-store',
      ...(retryAfter ? { 'Retry-After': retryAfter } : {}),
    },
  });
}
