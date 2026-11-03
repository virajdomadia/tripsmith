# 18 — Runbook

What to do when something breaks in production, and how to do the few risky routine jobs
(rotating a secret, rebuilding the database, rolling back, going live with Razorpay). Written in
v2.6 V6 (findings OP-3, OP-8, OP-9 in [12-security-performance.md](12-security-performance.md)).
Each entry says how you notice, what to check first, and what to do.

**Where things are**

| | |
|---|---|
| Web | Vercel project `tripsmith` → https://tripsmith.virajdomadia.com (also `tripsmith.vercel.app`) |
| Api | Vercel project `tripsmith-api` → **https://tripsmith-api.vercel.app** (there is no custom api domain) |
| Database | Supabase project `tripsmith` (ref `yxlqhzjszwlpxttlbwqj`, Mumbai `ap-south-1`). Runtime: transaction pooler `:6543`. Migrations and seeds: session pooler `:5432` (`aws-0-ap-south-1.pooler.supabase.com`) |
| Backups | **None**, by choice — see §6 |
| Scheduled jobs | **None** since 2026-11-04 (lean cleanup). The upkeep runs on demand from the reads — [05-architecture.md §6](05-architecture.md) |
| Errors | Sentry (api + web). Readiness: `GET /health/ready` (db `SELECT 1`, 503 when down) |

The Vercel CLI commands below run from the main checkout's `web/` or `api/` folder (each has its
`.vercel` link). Prod env vars on Vercel are write-only once saved as sensitive: keep every
secret's current value in the password manager, or a rotation becomes a hard cut.

---

## 1. Razorpay webhook failing

**You notice:** a Sentry issue *"Razorpay webhook signature did not verify"* (fingerprint
`razorpay-webhook-bad-signature`), a Sentry error *"RAZORPAY_WEBHOOK_SECRET is unset"*, or
failed deliveries on the webhook in the Razorpay dashboard (Settings → Webhooks).

**Why it matters less than it looks:** the webhook is the backstop. A booking is confirmed by
the browser's `confirm` call (Razorpay's payment signature) or by `sync`; the webhook catches
the visitor who paid and closed the tab. Razorpay retries a failed delivery for about a day, and
a capture that arrives late is still honoured — even after the 01:00 sweep cancelled the hold as
`hold_expired`, `settle_capture` confirms it if the seats are free.

**Check:**

```sh
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://tripsmith-api.vercel.app/webhooks/razorpay
```

- `400` — the route is up and has a secret (an unsigned call is refused). If Sentry shows
  bad signatures, the two sides hold different secrets.
- `503` — `RAZORPAY_WEBHOOK_SECRET` is unset on `tripsmith-api` Production.
- `500` / timeout — the api or the database is down: go to §3.

**Fix:**

1. Razorpay dashboard → Webhooks → the `https://tripsmith-api.vercel.app/webhooks/razorpay`
   webhook → edit → set a new secret (`openssl rand -hex 32`), keep it **Active**. The api acts
   on `payment.captured`, `payment.failed`, `refund.processed` and `refund.failed`; anything else
   is answered 200 and ignored.
2. The same value on Vercel: `vercel env rm RAZORPAY_WEBHOOK_SECRET production --yes`, then
   `vercel env add RAZORPAY_WEBHOOK_SECRET production` (from `api/`).
3. Redeploy the api: `vercel redeploy <current tripsmith-api production url>`; wait for Ready.
4. In the Razorpay dashboard, re-send the failed events (they are idempotent here). If the
   webhook was disabled after repeated failures, enable it.
5. Any booking still pending with a captured payment: open it on the owner Bookings desk, or the
   customer's booking page runs `sync` against Razorpay.

## 2. Email: Gmail SMTP daily cap

**You notice:** the owner *Emails* page shows sends `failed`; Sentry errors from
`infra/email.py` with SMTP code `550 5.4.5` ("Daily user sending limit exceeded"); customers say
the sign-in code never came.

**Context:** prod sends through Gmail SMTP (~500 messages a day). Sign-in codes share that cap;
non-demo code requests are capped at 200 a day before Gmail's limit (SA-5). The refund email is
claimed in the `email_sends` ledger first, so a replayed webhook never sends it twice.

**Fix:**

1. Wait: the cap is a rolling 24 hours. A failed send is not retried (no scheduled job since
   2026-11-04); it shows as failed in the booking's history.
2. If it will not wait (a burst of code requests is draining it): find the source in Sentry /
   the Vercel logs; the per-IP and per-email limits already apply, so it is many IPs — lower the
   daily code budget or switch transport.
3. Switch to Resend: remove `SMTP_HOST` from `tripsmith-api` Production (the app uses Resend
   when SMTP is not fully configured, and `RESEND_API_KEY` must be set and the sending domain
   verified in Resend), redeploy the api. Switch back the same way.
4. Re-send what matters by hand from the booking desk (payment link, details link) or the
   enquiry inbox once mail flows.

## 3. Database down

**You notice:** pages render their error state, `/health/ready` answers 503, Sentry fills with
connection errors.

**First, stop the bleeding:** a dead database turns every request into an uncached error render
(2026-10-23: a 1/min pinger on the web burned the Vercel Hobby CPU allowance in five days). If
you know an outage will last, point any uptime monitor at api `/health` (no database) rather
than the web.

**Check, in order:**

1. `curl -s https://tripsmith-api.vercel.app/health/ready` — 503 means the api is fine and the
   database is not.
2. Supabase dashboard → project `tripsmith`: **paused?** (Free projects pause after a week of
   low activity — with no crons since 2026-11-04 nothing keeps a quiet week busy) → *Restore
   project*. **Status page**
   (status.supabase.com) for an `ap-south-1` incident → wait.
3. Usage → over a Free plan limit (database size 500 MB, egress)? Delete what can go (old
   `package_views`, expired PDFs) or move plan.
4. The connection string: `DATABASE_URL` on `tripsmith-api` Production must be the
   **transaction pooler** on port 6543 (`connect_args()` turns the statement caches off only on
   that port). A password reset in Supabase invalidates it.

**If the project is gone or will not come back:** there is no backup (§6), so start fresh, as
the Neon → Supabase move did on 2026-10-23. Create a new Supabase project in Mumbai, then from
`api/`, with its **session pooler** URL in the asyncpg form
`postgresql+asyncpg://postgres.<ref>:<pw>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?ssl=require`
(`ssl=require`, not `sslmode`; neither tool falls back to `DATABASE_URL`):

```powershell
$env:ALEMBIC_URL = "<that URL>"; uv run alembic upgrade head; uv run alembic current
uv run python scripts/seed.py --database-url $env:ALEMBIC_URL                  # catalogue
foreach ($f in "--demo-traveller", "--demo-coupon", "--history", "--urgency") {
  uv run python scripts/seed.py $f --database-url $env:ALEMBIC_URL }
```

Point `DATABASE_URL` on `tripsmith-api` Production at the new **transaction pooler** (`:6543`),
redeploy the api, then the web (§7). Everything written since the seed is lost: bookings,
payments and refunds, enquiries, customer accounts and sessions, reviews, waitlist entries, the
email and webhook ledgers, and every owner edit made in /admin (prices, departures, deals,
coupons and their uses, early-bird tiers, leaders) — the catalogue comes back as `api/content/`
has it.

## 4. Rotating SESSION_SECRET

`SESSION_SECRET` keys the HMAC on every signed link (voucher PDF 30 min, calendar links until
30 days after the trip, waitlist claim links, unsubscribe links — these never expire), the
sign-in code hashes, and the enquiry IP hashes. It does **not** sign sessions (those are random
tokens, stored hashed). Since V6 the api also reads `SESSION_SECRET_PREVIOUS`: accepted when a
link or code is **checked**, never used to sign.

**Routine rotation** (nothing leaked):

1. `openssl rand -hex 32` → the new value. Have the current value at hand (password manager).
2. `tripsmith-api` Production: set `SESSION_SECRET_PREVIOUS` = the **current** value, then
   `SESSION_SECRET` = the new one (`vercel env rm … production --yes` + `vercel env add …
   production` for each, from `api/`).
3. Redeploy the api; wait for Ready. New links are signed with the new key; links and codes
   already sent keep working.
4. Leave `SESSION_SECRET_PREVIOUS` until the next rotation overwrites it — signed links in old
   emails (waitlist claims, calendar links) depend on it. Enquiry IP hashes start from the new key (they are only stored, so
   nothing breaks).

**After a leak:** do steps 1–3 **without** `SESSION_SECRET_PREVIOUS` (remove it if set). A
leaked key must stop verifying at once. Cost: links in mailboxes stop opening (customers can
still reach their voucher and calendar from their account, and ask for a new sign-in code).

## 5. Rotating CRON_SECRET (retired)

There is nothing to rotate since 2026-11-04: the lean cleanup removed every scheduled job (the
Vercel crons and the GitHub tick), so nothing reads `CRON_SECRET` any more. Delete it from
`tripsmith-api` (`vercel env rm CRON_SECRET production --yes`) and the repo
(`gh secret delete CRON_SECRET --repo virajdomadia/tripsmith`), along with
`HEALTHCHECK_DAILY_URL` / `HEALTHCHECK_EMAILS_URL` if they were ever set.

## 6. Backups

**None, by choice** (Viraj, 2026-10-24: a portfolio project, losing the data is acceptable). The
backup workflow and restore drill were deleted in the 2026-11-04 lean cleanup. To recover, rebuild
from migrations + seeds (§3).

## 7. Rolling back a bad deploy

The web prerenders package pages against **whichever api is live**, so order matters. Migrations
are expand-only (a new column or table, never a drop or rename in the same release), so the
previous api runs on the new schema and there is **no database downgrade** — never run
`alembic downgrade` on production.

1. **Api first.** `vercel ls tripsmith-api --prod` (from `api/`): find the last good
   deployment. Rows marked *Canceled* are the `ignoreCommand` skipping a build because `api/`
   did not change — not failures. Then `vercel rollback <good url>` (or `vercel promote <good
   url>`). Wait until it is the current production deployment and Ready.
2. **Then the web.** `vercel ls tripsmith --prod` (from `web/`): roll back the same way if the
   web change is the bad one; otherwise `vercel redeploy <current web production url>` so its
   pages are prerendered against the api that is now live.
3. **Check:** both top rows Ready; the GitHub deployment for each project names the sha you
   meant; `/health/ready` 200; a package page and a quote work.
4. **Afterwards:** a rollback switches off Vercel's automatic promotion of new production
   builds for that project. Fix forward with a PR, then promote its deployment (`vercel promote`)
   or undo the rollback in the dashboard, or the next merge will build but not go live.

## 8. Razorpay go-live (test mode → live)

Tripsmith runs Razorpay in test mode. Before taking real money, in this order:

1. **Owner demo off.** While `PUBLIC_DEMO_OWNER` is on (production default), the api refuses an
   `rzp_live_` key. Set `PUBLIC_DEMO_OWNER=false` on `tripsmith-api` Production, change
   `OWNER_PASSWORD`, and remove the demo login from the site footer (web `NEXT_PUBLIC_DEMO_*`).
2. **Monitoring** (deferred in V4 until now): UptimeRobot on the web `/` and api `/health`
   every 5 min, `/health/ready` hourly; Sentry alert rules reach the phone. (No crons to watch
   since 2026-11-04 — consider bringing back the balance auto-cancel and the automatic emails
   first, see docs/17.)
3. **Razorpay account:** KYC activated; auto-capture on; live API keys generated.
4. **Keys:** `RAZORPAY_KEY_ID` (`rzp_live_…`) and `RAZORPAY_KEY_SECRET` on `tripsmith-api`
   Production; Checkout gets the key id from the api's booking order (`keyId`), nothing to set
   on the web.
5. **Webhook in Live mode** (a separate list from test mode): URL
   `https://tripsmith-api.vercel.app/webhooks/razorpay`, a new secret →
   `RAZORPAY_WEBHOOK_SECRET`, the four events in §1, Active.
6. Redeploy the api, then the web (§7 order).
7. **Prove it with ₹1:** a real booking for a test departure, paid with a real card or UPI;
   confirm the booking, the webhook delivery (dashboard), the receipt email, then refund it
   from the owner desk and see the refund land.
8. Re-read the terms, cancellation and privacy pages (V5) — they now describe real money.
