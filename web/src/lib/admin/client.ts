import { errorFromResponse } from '@/lib/api-errors';
import type { components } from '@/lib/api-types';

/**
 * Browser-side writes for the owner area. Requests go through the `/api/:path*` rewrite, so the
 * HttpOnly session cookie travels same-origin and the api's `require_owner` does the gating;
 * SameSite=Lax plus a JSON body is what stops a cross-site page from posting here. Reads stay in
 * server components via `api(..., { auth: true })`.
 */

export type UploadedImage = components['schemas']['UploadedImage'];

type Method = 'POST' | 'PUT' | 'DELETE';

export async function adminRequest<T = undefined>(
  path: `/admin/${string}`,
  init: { method: Method; body?: unknown },
): Promise<T> {
  const headers = new Headers();
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  const res = await fetch(`/api${path}`, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  return settle<T>(res);
}

export async function uploadCover(file: File): Promise<UploadedImage> {
  const form = new FormData();
  form.append('file', file, file.name);
  const res = await fetch('/api/admin/destinations/cover', {
    method: 'POST',
    body: form,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  return settle<UploadedImage>(res);
}

async function settle<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const raw = await res.json().catch(() => undefined);
  if (!res.ok) throw errorFromResponse(res.status, res.statusText, raw);
  return raw as T;
}
