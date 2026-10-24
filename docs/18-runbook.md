# 18 — Runbook

What to do when something breaks in production, and how to do the few risky routine jobs
(rotating a secret, restoring the database, rolling back, going live with Razorpay). Written in
v2.6 V6 (findings OP-3, OP-8, OP-9 in [12-security-performance.md](12-security-performance.md)).
Each entry says how you notice, what to check first, and what to do.

**Where things are**

| | |
|---|---|
| Web | Vercel project `tripsmith` → https://tripsmith.virajdomadia.com (also `tripsmith.vercel.app`) |
| Api | Vercel project `tripsmith-api` → **https://tripsmith-api.vercel.app** (there is no custom api domain) |
| Database | Supabase project `tripsmith` (ref `yxlqhzjszwlpxttlbwqj`, Mumbai `ap-south-1`). Runtime: transaction pooler `:6543`. Migrations, seeds, dumps: session pooler `:5432` (`aws-0-ap-south-1.pooler.supabase.com`) |
| Backups | **None.** The `db-backup.yml` workflow exists but is disabled by choice (Viraj, 2026-10-24: a portfolio project, losing the data is acceptable) — see §6 |
| Scheduled jobs | Vercel crons `/cron/daily` (01:00 IST) and `/cron/emails` (09:00 IST); GitHub `waitlist-tick.yml` every 15 min (runs ~5×/day in practice) |
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
non-demo code requests are capped at 200 a day before Gmail's limit (SA-5). Every automatic
email is claimed in the `email_sends` ledger first, so a retry never sends twice.

**Fix:**

1. Wait: the cap is a rolling 24 hours. Nothing is lost — failed ledger rows are retried by
   `/cron/emails` (09:00 IST) and by the 15-minute tick between 09:00 and 21:00 IST.
2. If it will not wait (a burst of code requests is draining it): find the source in Sentry /
   the Vercel logs; the per-IP and per-email limits already apply, so it is many IPs — lower the
   daily code budget or switch transport.
3. Switch to Resend: remove `SMTP_HOST` from `tripsmith-api` Production (the app uses Resend
   when SMTP is not fully configured, and `RESEND_API_KEY` must be set and the sending domain
   verified in Resend), redeploy the api. Switch back the same way.
4. Re-send what matters by hand from the owner Emails page once mail flows.

## 3. Database down

**You notice:** pages render their error state, `/health/ready` answers 503, Sentry fills with
connection errors, the crons fail.

**First, stop the bleeding:** a dead database turns every request into an uncached error render
(2026-10-23: a 1/min pinger on the web burned the Vercel Hobby CPU allowance in five days). If
you know an outage will last, point any uptime monitor at api `/health` (no database) rather
than the web.

**Check, in order:**

1. `curl -s https://tripsmith-api.vercel.app/health/ready` — 503 means the api is fine and the
   database is not.
2. Supabase dashboard → project `tripsmith`: **paused?** (Free projects pause after a week of
   low activity — the crons normally prevent it) → *Restore project*. **Status page**
   (status.supabase.com) for an `ap-south-1` incident → wait.
3. Usage → over a Free plan limit (database size 500 MB, egress)? Delete what can go (old
   `package_views`, expired PDFs) or move plan.
4. The connection string: `DATABASE_URL` on `tripsmith-api` Production must be the
   **transaction pooler** on port 6543 (`connect_args()` turns the statement caches off only on
   that port). A password reset in Supabase invalidates it.

**If the project is gone or will not come back:** there is no backup (§6), so start fresh, as
the Neon → Supabase move did on 2026-10-23: create a new Supabase project in Mumbai, run
`alembic upgrade head` and the seeds (catalogue, `--demo-traveller`, `--demo-coupon`,
`--history`, `--urgency`) against its session pooler, point `DATABASE_URL` at its transaction
pooler, redeploy the api, then the web (§7). Bookings, enquiries and accounts are lost.

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
4. Leave `SESSION_SECRET_PREVIOUS` until the next rotation overwrites it — unsubscribe links in
   old emails depend on it. Enquiry IP hashes start from the new key (they are only stored, so
   nothing breaks).

**After a leak:** do steps 1–3 **without** `SESSION_SECRET_PREVIOUS` (remove it if set). A
leaked key must stop verifying at once. Cost: links in mailboxes stop opening (customers can
still reach their voucher and calendar from their account, and ask for a new sign-in code),
and old unsubscribe links fail — reply-to-unsubscribe by hand.

## 5. Rotating CRON_SECRET

Two consumers: Vercel's own crons (Vercel sends `Authorization: Bearer $CRON_SECRET` from the
api project's env) and the GitHub tick (`secrets.CRON_SECRET`). Vercel's copy is write-only, so
generate once and set both from the same value.

1. `openssl rand -hex 32`.
2. `tripsmith-api` Production: `vercel env rm CRON_SECRET production --yes`,
   `vercel env add CRON_SECRET production`; redeploy the api; wait for Ready.
3. Right after: `gh secret set CRON_SECRET --repo virajdomadia/tripsmith` (paste the value).
4. `gh workflow run waitlist-tick.yml`, then `gh run watch` — it must end green with a waitlist
   report. Between steps 2 and 3 a tick fails loudly; that is expected and harmless.

## 6. Restore from a backup

**Status: backups are off.** Viraj decided on 2026-10-24 that a portfolio project does not need
them: the workflow is disabled in GitHub Actions, the `tripsmith_backup` role, the
`BACKUP_DATABASE_URL` secret and the age key were never created, and no drill has run. Everything
below is ready if that changes: do the **Backups set-up**, then `gh workflow enable
db-backup.yml`, run it once by hand and run the drill.

**What it does when on:** `.github/workflows/db-backup.yml` runs at 02:10 IST: `pg_dump -Fc` of the `public`
schema as the read-only role `tripsmith_backup`, with every table's row count read in the same
exported snapshot; restored at once into a throwaway Postgres on the runner and the counts
compared, then both the dump and the counts
are `age`-encrypted and kept as a 30-day artifact `tripsmith-db-<UTC stamp>`. The repo is public,
so only the encrypted files leave the runner. The private key is
`C:\Users\Viraj\.age\tripsmith-backup.txt` and a copy in the password manager — without it every
backup is useless. A failed run emails the repo owner (GitHub's default for scheduled runs).
GitHub disables scheduled workflows after 60 days without a commit: re-enable it in Actions.

**Drill / restore into a scratch database** (local Postgres on 5433; needs `gh`, `age`,
`psql`, `pg_restore` on PATH):

```powershell
# from api/ in any checkout
uv run python -m scripts.restore_drill --key C:\Users\Viraj\.age\tripsmith-backup.txt
#   --run <id>       a given workflow run instead of the newest successful one
#   --prod-url <url> also show how production differs now (informational; read-only URL)
#   --drop           drop the scratch database afterwards
```

It downloads the newest artifact, decrypts it to a temp folder (deleted on exit), re-creates
`tripsmith_restore_drill`, restores, compares the counts and prints the alembic revision and the
timings. It refuses any target that is not local.

**Restore into a real database** (a new Supabase project, §3) — by hand, against its **session
pooler** URL, with the decrypted dump:

```sh
age --decrypt --identity tripsmith-backup.txt --output tripsmith.dump tripsmith-<stamp>.dump.age
psql "$NEW_SESSION_URL" -Xc "drop schema public cascade"   # a new project only: the dump creates it
pg_restore --dbname="$NEW_SESSION_URL" --no-owner --no-privileges --exit-on-error tripsmith.dump
psql "$NEW_SESSION_URL" -XAtc "select version_num from alembic_version"   # = the repo's head
```

Then delete `tripsmith.dump`, re-create the `tripsmith_backup` role on the new project
(§Backups set-up below) and update the `BACKUP_DATABASE_URL` secret.

**Drill log**

| Date | Backup | Download | Decrypt | Restore | Total | Counts | Revision |
|---|---|---|---|---|---|---|---|
| _none — backups are off_ | | | | | | | |

**Backups set-up** (not done; only if backups are turned on): in the Supabase SQL editor, as
`postgres`:

```sql
create role tripsmith_backup login password '<openssl rand -hex 24>'
  nosuperuser nocreatedb nocreaterole noinherit;
alter role tripsmith_backup set default_transaction_read_only = on;
grant usage on schema public to tripsmith_backup;
grant select on all tables in schema public to tripsmith_backup;
grant select on all sequences in schema public to tripsmith_backup;
-- tables created by later migrations (run as postgres) are readable too:
alter default privileges for role postgres in schema public grant select on tables to tripsmith_backup;
alter default privileges for role postgres in schema public grant select on sequences to tripsmith_backup;
```

Then the repo secret `BACKUP_DATABASE_URL` =
`postgresql://tripsmith_backup.yxlqhzjszwlpxttlbwqj:<pw>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require`
and the repo variable `BACKUP_AGE_RECIPIENT` = the `age1…` public key from `age-keygen`.

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
2. **Monitoring** (deferred in V4 until now): healthchecks.io checks for `/cron/daily` (daily,
   grace 90 min) and `/cron/emails` (grace 30 min) with `HEALTHCHECK_DAILY_URL` /
   `HEALTHCHECK_EMAILS_URL` set on the api; UptimeRobot on the web `/` and api `/health` every
   5 min, `/health/ready` hourly; Sentry alert rules reach the phone.
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
