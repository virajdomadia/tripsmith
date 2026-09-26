import { stripDraftCookie } from '@/lib/enquiry-form-state';
import { ACCOUNT_PATH, ACCOUNT_SIGN_IN } from '@/lib/auth/gate';
import { seeOther } from '@/lib/auth/forward';

const REF = /^TB-[A-Z0-9]{6}$/;

/**
 * `GET /account/bookings/{ref}/voucher.pdf` — My trips' voucher download. The viewer's raw
 * Cookie goes to the api (never re-encoded — see api.ts), which answers the booking's own
 * customer or the owner (R18). A plain link the browser navigates to, so failures land on a
 * page, not on a JSON envelope: signed out → sign-in; not yours / no voucher / api down → My
 * trips with a notice.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ ref: string }> },
): Promise<Response> {
  const { ref } = await params;
  const back = (voucher: string) =>
    seeOther(new URL(`${ACCOUNT_PATH}?voucher=${voucher}`, request.url));
  if (!REF.test(ref)) return back('missing');

  const apiUrl = (process.env.API_URL ?? 'http://localhost:8000').replace(/\/$/, '');
  const headers: Record<string, string> = {};
  const cookie = stripDraftCookie(request.headers.get('cookie'));
  if (cookie) headers.cookie = cookie;
  const res = await fetch(`${apiUrl}/account/bookings/${ref}/voucher.pdf`, {
    headers,
    cache: 'no-store',
  }).catch(() => undefined);

  if (!res) return back('unavailable');
  if (res.status === 401) return seeOther(new URL(ACCOUNT_SIGN_IN, request.url));
  if (!res.ok) return back(res.status >= 500 ? 'unavailable' : 'missing');
  return new Response(res.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition':
        res.headers.get('content-disposition') ??
        `attachment; filename="Tripsmith-${ref}-voucher.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
