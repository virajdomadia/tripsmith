/**
 * `beforeSend` / `beforeSendTransaction` for the server and edge inits (not the browser, which
 * never sees these headers or secrets). The web's route handlers send `REVALIDATE_SECRET` to the
 * api as `X-Internal-Secret` and the visitor's address as `X-Client-Ip`; the incoming request
 * carries the session cookie and Vercel's forwarding headers. None of them belong in an error
 * report, so:
 * - those headers are dropped from the request payload case-insensitively, with the user's ip —
 *   the same list as api/app/infra/observability.py;
 * - every server secret's value (and an 8+ character prefix of it cut short by an ellipsis or
 *   the end of a string) is masked anywhere in the event — message, exception values,
 *   breadcrumbs, extra, contexts, keys included — like the api's `_mask`.
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

export const FILTERED = '[Filtered]';
const SECRET_MIN_LENGTH = 8; // shorter values (or prefixes) would mask ordinary words
const SECRET_NAME = /(SECRET|TOKEN|PASSWORD|_KEY)$/;

/** Values of the server env vars that look like secrets (never the `NEXT_PUBLIC_` ones). */
export function secretValues(env: Record<string, string | undefined>): string[] {
  return Object.entries(env)
    .filter(([name, v]) => SECRET_NAME.test(name) && !name.startsWith('NEXT_PUBLIC_') && v)
    .map(([, v]) => v as string)
    .filter((v) => v.length >= SECRET_MIN_LENGTH);
}

function leaks(text: string, secrets: string[]): boolean {
  if (secrets.some((s) => text.includes(s))) return true;
  const cuts = [text.length];
  for (const m of text.matchAll(/\.\.\.|…/g)) cuts.push(m.index);
  return secrets.some((s) =>
    cuts.some((cut) => {
      const head = text.slice(0, cut);
      for (let n = SECRET_MIN_LENGTH; n < s.length; n++) {
        if (head.endsWith(s.slice(0, n))) return true;
      }
      return false;
    }),
  );
}

function mask(value: unknown, secrets: string[]): unknown {
  if (typeof value === 'string') return leaks(value, secrets) ? FILTERED : value;
  if (Array.isArray(value)) return value.map((v) => mask(v, secrets));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [mask(k, secrets), mask(v, secrets)]),
    );
  }
  return value;
}

type Scrubbable = {
  request?: { headers?: Record<string, string>; cookies?: unknown; env?: Record<string, string> };
  user?: { ip_address?: unknown };
};

/** Headers, cookies and addresses only — see `makeScrubber` for the full hook. */
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

/** The `beforeSend` hook: `scrubEvent`, then mask the given env's secret values anywhere. */
export function makeScrubber(env: Record<string, string | undefined>) {
  const secrets = secretValues(env);
  return <E extends Scrubbable>(event: E): E => {
    const scrubbed = scrubEvent(event);
    return secrets.length ? (mask(scrubbed, secrets) as E) : scrubbed;
  };
}
