/**
 * `beforeSend` / `beforeSendTransaction` for the server and edge inits (not the browser, which
 * never sees these headers). The web's route handlers send `REVALIDATE_SECRET` to the api as
 * `X-Internal-Secret` and the visitor's address as `X-Client-Ip`; the incoming request carries
 * the session cookie and Vercel's forwarding headers. None of them belong in an error report,
 * so they are dropped from the request payload case-insensitively, with the user's ip — the
 * same list as api/app/infra/observability.py.
 */

export const SCRUBBED_HEADERS: ReadonlySet<string> = new Set([
  'x-internal-secret',
  'x-client-ip',
  'cookie',
  'set-cookie',
  'authorization',
  'proxy-authorization',
  'x-forwarded-for',
  'x-real-ip',
  'x-vercel-forwarded-for',
  'x-vercel-proxied-for',
  'forwarded',
]);

type Scrubbable = {
  request?: { headers?: Record<string, string>; cookies?: unknown; env?: Record<string, string> };
  user?: { ip_address?: unknown };
};

export function scrubEvent<E extends Scrubbable>(event: E): E {
  const request = event.request;
  if (request) {
    if (request.headers) {
      request.headers = Object.fromEntries(
        Object.entries(request.headers).filter(([k]) => !SCRUBBED_HEADERS.has(k.toLowerCase())),
      );
    }
    delete request.cookies;
    if (request.env) delete request.env.REMOTE_ADDR;
  }
  if (event.user) delete event.user.ip_address;
  return event;
}
