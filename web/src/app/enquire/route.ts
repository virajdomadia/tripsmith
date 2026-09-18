import { errorFromResponse } from '@/lib/api-errors';
import { ECHOED_FIELDS, thanksHref } from '@/lib/enquiry-form-state';
import { type EnquiryCreated, forwardEnquiry } from '@/lib/enquiry-forward';
import { enquiryFromForm, enquirySchema, fieldErrorsOf } from '@/lib/enquiry-schema';

/**
 * `POST /enquire` — the no-JavaScript path (06 C3). A native form post lands here; the zod mirror
 * rejects junk locally, otherwise the body goes to the api. Every outcome is a 303 redirect: the
 * thanks page on success, back to the form (values + errors in the query) otherwise.
 */

function formUrl(raw: Record<string, string>, request: Request): URL {
  const back =
    raw.packageSlug && /^[a-z0-9-]+$/.test(raw.packageSlug)
      ? `/packages/${raw.packageSlug}/enquire`
      : '/contact';
  return new URL(back, request.url);
}

function backWith(url: URL, raw: Record<string, string>, extra: Record<string, string>): Response {
  for (const k of ECHOED_FIELDS) if (raw[k]) url.searchParams.set(k, raw[k]);
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  if (url.pathname === '/contact') url.hash = 'enquire';
  return Response.redirect(url, 303);
}

export async function POST(request: Request): Promise<Response> {
  const raw = enquiryFromForm(await request.formData());
  const url = formUrl(raw, request);
  const parsed = enquirySchema.safeParse(raw);
  if (!parsed.success)
    return backWith(url, raw, { fieldErrors: JSON.stringify(fieldErrorsOf(parsed.error)) });

  const res = await forwardEnquiry(parsed.data, request);

  if (res?.status === 201) {
    const body = (await res.json()) as EnquiryCreated;
    return Response.redirect(
      new URL(
        thanksHref({ ref: body.ref, firstName: body.firstName, packageSlug: body.package?.slug }),
        request.url,
      ),
      303,
    );
  }
  if (!res) return backWith(url, raw, { error: 'internal' });
  const err = errorFromResponse(
    res.status,
    res.statusText,
    await res.json().catch(() => undefined),
  );
  if (err.body.code === 'validation' && err.body.fieldErrors)
    return backWith(url, raw, { fieldErrors: JSON.stringify(err.body.fieldErrors) });
  return backWith(url, raw, {
    error: err.body.code === 'rate_limited' ? 'rate_limited' : 'internal',
  });
}
