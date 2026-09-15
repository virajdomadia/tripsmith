import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';

/**
 * `POST /revalidate` — the api calls this after every admin mutation with the cache tags it
 * touched (`packages`, `package:<slug>`, `destination:<slug>`); see docs/04 §1 and
 * api/app/infra/revalidate.py. Shared secret `REVALIDATE_SECRET` on both sides.
 */

const bodySchema = z.object({
  secret: z.string(),
  tags: z.array(z.string().min(1)).min(1),
});

function secretMatches(given: string): boolean {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected) return false; // unset = closed, never open
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  const raw: unknown = await request.json().catch(() => undefined);
  // The secret is checked first so a caller without it learns nothing about the body shape.
  const secret =
    typeof raw === 'object' && raw !== null && 'secret' in raw && typeof raw.secret === 'string'
      ? raw.secret
      : '';
  if (!secretMatches(secret)) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: 'invalid body' }, { status: 400 });

  for (const tag of parsed.data.tags) revalidateTag(tag);
  return Response.json({ revalidated: parsed.data.tags });
}
