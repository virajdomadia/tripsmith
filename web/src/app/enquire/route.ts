import { errorFromResponse } from '@/lib/api-errors';
import {
  DRAFT_COOKIE,
  draftCookieHeader,
  draftCookieValue,
  PUBLIC_FIELDS,
  thanksHref,
} from '@/lib/enquiry-form-state';
import { type EnquiryCreated, forwardEnquiry } from '@/lib/enquiry-forward';
import { enquiryFromForm, enquirySchema, fieldErrorsOf } from '@/lib/enquiry-schema';

/**
 * `POST /enquire` — the no-JavaScript path (06 C3). A native form post lands here; the zod mirror
 * rejects junk locally, otherwise the body goes to the api. Every outcome is a 303 redirect: the
 * thanks page on success, back to the form otherwise — choices and error codes in the query, what
 * the visitor typed (name, phone, email, messages) in a short-lived httpOnly cookie, never the URL.
 */

const isHttps = (request: Request) => new URL(request.url).protocol === 'https:';

function redirect(url: URL, cookie?: string): Response {
  const headers = new Headers({ Location: url.toString() });
  if (cookie) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 303, headers });
}

function formUrl(raw: Record<string, string>, request: Request): URL {
  const back =
    raw.packageSlug && /^[a-z0-9-]+$/.test(raw.packageSlug)
      ? `/packages/${raw.packageSlug}/enquire`
      : '/contact';
  return new URL(back, request.url);
}

function backWith(
  request: Request,
  url: URL,
  raw: Record<string, string>,
  extra: Record<string, string>,
): Response {
  for (const k of PUBLIC_FIELDS) if (raw[k]) url.searchParams.set(k, raw[k]);
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  if (url.pathname === '/contact') url.hash = 'enquire';
  const draft = draftCookieValue(raw);
  return redirect(url, draft ? draftCookieHeader(draft, isHttps(request)) : undefined);
}

export async function POST(request: Request): Promise<Response> {
  const raw = enquiryFromForm(await request.formData());
  const url = formUrl(raw, request);
  const back = (extra: Record<string, string>) => backWith(request, url, raw, extra);
  const parsed = enquirySchema.safeParse(raw);
  if (!parsed.success) return back({ fieldErrors: JSON.stringify(fieldErrorsOf(parsed.error)) });

  const res = await forwardEnquiry(parsed.data, request);

  if (res?.status === 201) {
    const body = (await res.json()) as EnquiryCreated;
    const hadDraft = request.headers.get('cookie')?.includes(`${DRAFT_COOKIE}=`);
    return redirect(
      new URL(
        thanksHref({
          ref: body.ref,
          firstName: body.firstName,
          packageSlug: body.package?.slug,
          emailed: body.emailed,
        }),
        request.url,
      ),
      hadDraft ? draftCookieHeader(undefined, isHttps(request)) : undefined,
    );
  }
  if (!res) return back({ error: 'internal' });
  const err = errorFromResponse(
    res.status,
    res.statusText,
    await res.json().catch(() => undefined),
  );
  if (err.body.code === 'validation' && err.body.fieldErrors)
    return back({ fieldErrors: JSON.stringify(err.body.fieldErrors) });
  return back({ error: err.body.code === 'rate_limited' ? 'rate_limited' : 'internal' });
}
