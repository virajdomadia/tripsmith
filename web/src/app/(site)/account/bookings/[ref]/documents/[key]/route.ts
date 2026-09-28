import { stripDraftCookie } from '@/lib/enquiry-form-state';
import { ACCOUNT_PATH, ACCOUNT_SIGN_IN } from '@/lib/auth/gate';
import { seeOther } from '@/lib/auth/forward';

const REF = /^TB-[A-Z0-9]{6}$/;
const KEY = /^(invoice|receipt-[a-z0-9]{8,40}|credit-[a-z0-9]{2,40})$/;

/**
 * `GET /account/bookings/{ref}/documents/{key}` — a GST receipt, tax invoice or credit note (R51,
 * P13b), for My trips and the desk alike: the viewer's raw Cookie goes to the api, which answers
 * the booking's own customer or the owner. Same shape as the voucher download: a plain link, so
 * a failure lands on a page — signed out → sign-in; anything else → My trips with a notice.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ ref: string; key: string }> },
): Promise<Response> {
  const { ref, key } = await params;
  const back = (why: string) => seeOther(new URL(`${ACCOUNT_PATH}?document=${why}`, request.url));
  if (!REF.test(ref) || !KEY.test(key)) return back('missing');

  const apiUrl = (process.env.API_URL ?? 'http://localhost:8000').replace(/\/$/, '');
  const headers: Record<string, string> = {};
  const cookie = stripDraftCookie(request.headers.get('cookie'));
  if (cookie) headers.cookie = cookie;
  const res = await fetch(`${apiUrl}/account/bookings/${ref}/documents/${key}.pdf`, {
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
        res.headers.get('content-disposition') ?? `attachment; filename="Tripsmith-${ref}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
