# WA OTP — Backend

The FastAPI hot path plus the PocketBase control plane, for a **self-hosted**
WhatsApp/Telegram OTP gateway. You run this for your own apps, with your own
WhatsApp Business account or your own Telegram bot, against your own database.

Integrator API reference: [docs/api.md](docs/api.md). Product overview and the
full install guide: [../README.md](../README.md). Docker/systemd/reverse-proxy
details: [../docs/self-hosting.md](../docs/self-hosting.md).

```
Your app backend ──▶ FastAPI :8000  ──▶ Meta Cloud API / Telegram Bot API
                        │  ▲
          reads/writes  ▼  │ superuser REST
                   PocketBase :8090  ◀── your browser (admin UI = back office)
```

> [!IMPORTANT]
> This project provides the software only. It does not provide WhatsApp messaging
> infrastructure, WhatsApp Business accounts, Meta credentials, phone numbers,
> hosting, or message credits. WhatsApp delivery requires **your own** approved
> Meta Business account, and Meta bills you directly at Meta's rates.

## Quick start (local dev)

```bash
cd backend

# 1. one-time setup
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
cp .env.example .env                       # then fill it in — the file documents every variable

# 2. PocketBase (download the v0.40.x binary into pocketbase/; collections auto-migrate on start)
cd pocketbase
./pocketbase superuser upsert you@local 'a-strong-password'
./pocketbase serve --http=127.0.0.1:8090   # admin UI at http://127.0.0.1:8090/_/
cd ..

# 3. API
.venv/bin/uvicorn app.main:app --port 8000  # OpenAPI docs at http://127.0.0.1:8000/docs

# 4. create YOUR operator account — there is no public signup
.venv/bin/python scripts/create_admin.py you@example.com
```

With `WAOTP_MOCK_DELIVERY=1` the full send → verify → quota → throttle → audit
flow runs without any Meta or Telegram credentials: delivery is faked, but every
database row is real. It must be `0` or absent in production, and
`APP_ENV=production` refuses to boot if it is not.

## Configuration

Credentials are **environment-first**. `META_ACCESS_TOKEN`,
`TELEGRAM_BOT_TOKEN` and the rest come from `.env`, so a Docker or PaaS install
is configured entirely from that file. The PocketBase `settings` row can still
override any of them — the app merges env values with the row and the row wins
where it is set — which is what lets you rotate a provider token from the admin
UI without a redeploy. `backend/.env.example` documents the whole surface.

Two hard rules:

- **In `APP_ENV=production` the app refuses to start** if `SECRET_KEY`,
  `WAOTP_FERNET_KEY` or `PB_SUPERUSER_PASSWORD` is missing, or if mock delivery
  is on. A silent security downgrade is worse than no boot.
- **`WAOTP_FERNET_KEY` must stay stable.** It encrypts the Meta token at rest
  and signs Telegram link tokens. Changing it makes previously stored ciphertext
  unreadable and invalidates outstanding link tokens.

Policy numbers (cap, TTL, attempts, throttles, rate limits) are row-first: the
`settings` row is the source of truth and the env values are fallbacks, so they
can be tuned from the admin UI with no redeploy.

## API (base path `/v1`)

Auth for OTP routes: `X-Api-Key` header (sha256-hashed in `api_keys`, cached
60 s; regenerated/deactivated keys are evicted immediately).
Dashboard routes: `Authorization: Bearer <PocketBase user token>`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/v1/otp/send` | api key | `{to, channel: whatsapp\|telegram, code?}` + optional `Idempotency-Key` header (replay-deduped for the code's lifetime) → per-key lock → cap → throttle → deliver → audit row + hashed code. Returns `{ok, channel, request_id, message_id, expires_in, used, limit, reset_utc}` |
| POST | `/v1/otp/verify` | api key | `{to, code}` — configurable TTL, 3 attempts, single-use (per-(owner, phone) lock prevents concurrent double-spend) |
| GET | `/v1/otp/usage` | api key | `{used, limit, reset_utc}` — `used` counts WhatsApp-delivered sends only |
| GET/POST | `/v1/keys` | PB user token | list masked keys / issue (201, plaintext shown once; max **5 active keys** per owner) |
| POST | `/v1/keys/regenerate` | PB user token | deactivate old (cache-invalidated), issue new |
| DELETE | `/v1/keys/{id}` | PB user token | retire one key (soft delete: `active=false` + cache invalidation; `404 key_not_found` for foreign/unknown ids) |
| POST | `/v1/keys/deactivate` | PB user token | deprecated alias of `DELETE /v1/keys/{id}`, kept for existing clients |
| GET | `/v1/usage` | PB user token | dashboard usage view |
| POST | `/telegram/webhook` | secret header | `/start` + contact share → `tg_links` (PB failures → `503` so Telegram retries) |
| GET/POST | `/webhooks/whatsapp` | verify token / signature | Meta verification handshake (`GET`) and delivery-status callbacks (`POST`). Always answers `200` fast so Meta does not retry-storm |
| GET | `/health` | — | liveness. Touches no dependency, so it cannot flap when PocketBase is briefly busy |
| GET | `/health/ready` | — | readiness: PocketBase reachable + provider configuration state. `503` when PocketBase is down |
| GET | `/v1/health` | — | deprecated alias of `/health/ready`, kept for existing monitors |

Interactive OpenAPI docs are served at `/docs` (Swagger UI; the Authorize button
works with both the `X-Api-Key` and dashboard-bearer schemes) and
`/openapi.json` — error responses and their example bodies are declared on every
route, generated from the same catalog as [docs/api.md](docs/api.md) §7.

### Cap semantics

The monthly cap counts **WhatsApp sends the provider accepted** — Telegram is
never metered against it, so a Telegram-only install is unaffected by it.
`monthly_used`, `used` and `/v1/otp/usage.used` all count them; a Telegram send
reports the current WhatsApp count without incrementing it. A cap of `0` means
the operator set no limit.

Usage is counted from `messages.billable`, which the send path writes **once**,
when the provider accepts the message, and never updates again. It is
deliberately not derived from `status`: status moves to `delivered`/`read` as
callbacks arrive, so counting it made the cap shrink every time a message was
delivered successfully. Status callbacks therefore cannot change what has been
counted, and a message the provider rejected outright is written with
`billable=false` and never counts — it is still logged with `status=failed`, so
the audit trail stays complete.

One consequence, stated plainly because it is a behaviour change: a message the
provider accepted and *later* reported failed stays counted. The provider took
it; whether Meta bills for it is not something this app can know, and
under-counting is the failure mode that costs the operator money.

The per-phone hourly throttle applies to **both** channels (victim-number
protection), as does the per-key and per-IP rate limit.

### Concurrency

A **single uvicorn worker** is a correctness requirement, not a tuning choice.
A per-owner `asyncio` lock wraps each send (cap check → throttle check →
provider delivery → audit writes) and a per-(owner, phone) lock wraps each
verify. The idempotency replay store, the rate limiters and the cached
PocketBase superuser token are process-global too. Two workers would each hold
their own locks and their own replay cache, so a retried request could deliver
twice and two concurrent sends could each pass the same quota check.

The send lock is keyed on the **owner**, not the API key, because the monthly
cap and the per-phone throttle are owner-scoped while one owner may hold up to
five active keys — a key-scoped lock would leave the double-spend open across
any two of them.

Move that state into a shared store before scaling out. Until then this
limitation is real and is not worked around: it is enforced by the single
`--workers 1` in every deployment path this repo ships (Dockerfile, render.yaml)
and by the fact that nothing here reads a shared lock or counter.

### Errors

`400` bad input · `401` bad key/token · `403` key disabled · `404`
`key_not_found` · `409` `user_not_linked` (+ `link_url` deep link) /
`key_limit_reached` · `429` `quota_exceeded` / `phone_throttled` /
`rate_limited` · `502` `delivery_failed` · `503` `not_configured` /
`upstream_unavailable` · `500` `internal_error`. Body shape:
`{"ok": false, "error": "<code>", ...}`. 429 responses carry `Retry-After`
(`60` for per-key rate limit, `3600` for per-phone throttle, seconds-until-
monthly-reset for `quota_exceeded`); `delivery_failed` carries `retryable`
(`true` only for provider timeouts/unreachable — HTTP rejections and audit
failures are not retryable). Validation errors return whitelisted
`detail: [{loc, msg, type}]` — raw input is never echoed.

Known limitation: if the PocketBase audit write fails *after* a successful
delivery, the API returns `502 delivery_failed` (retryable: false) and logs the
provider `message_id` for manual reconciliation. The provider call already
happened, so this cannot be made atomic; instead the failure is made replayable
under the caller's `Idempotency-Key`, so a same-key retry returns that error
rather than double-sending. Without an `Idempotency-Key` a retry will send a
second code. Documented in [docs/api.md](docs/api.md) §3.

Operator note: deactivating a key from the PB admin UI (as opposed to via
`DELETE /v1/keys/{id}`) takes effect only after the 60 s auth-cache TTL. The API
routes evict the cache immediately; the admin UI cannot.

### Never logged, never returned

Tokens, API keys, OTP codes, `Authorization` headers and webhook signatures are
never logged at any level in any environment, and `/health/ready` reports which
configuration variables are **missing, by name** — never their values. There is
no code path that puts a code or a credential into a response body.

## Telegram link flow

Telegram bots cannot message someone who has never started them, so the first
send to an unlinked number returns a link instead of a code.

1. Your app calls `/v1/otp/send` with `channel:"telegram"` for an unlinked
   phone → `409 {error:"user_not_linked", link_url:"https://t.me/<your-bot>?start=<signed token>"}`.
   The bot username is `TELEGRAM_BOT_USERNAME` (or the `tg_bot_username` setting);
   there is no default bot, and the send fails configuration rather than pointing
   at one.
2. Your app shows a "Connect Telegram" button opening that URL.
3. Your bot replies with a *share contact* keyboard (`/telegram/webhook` handles
   `/start`); the shared contact is accepted **only if `contact.user_id == from.id`**
   — otherwise anyone could share a friend's number and receive their OTPs.
4. `tg_links` is upserted; your app retries `/send` — the OTP arrives on Telegram.

Register the webhook once, after setting the bot token:

```bash
.venv/bin/python scripts/set_telegram_webhook.py https://api.example.com
```

Use `openssl rand -hex 32` for the secret — **hex, not base64**: Telegram's
`secret_token` allows only letters, digits, `_` and `-`, and base64 emits `+`,
`/` and `=` which it rejects. Set the same value as `TELEGRAM_WEBHOOK_SECRET` in
the environment the service runs in **and** in the `.env` you run the script
from. The script registers the secret with Telegram; the service checks incoming
updates against its own copy. If the two differ, every update is rejected with
403 — which looks like a dead bot with no error anywhere.

## WhatsApp webhook

Your URL is derived from `APP_URL`:

```
{APP_URL}/webhooks/whatsapp
```

`GET` answers Meta's verification handshake by comparing `hub.verify_token`
against `META_VERIFY_TOKEN` in constant time and echoing `hub.challenge`; a wrong
token gets `403`. `POST` maps Meta's `statuses[]` (`sent` / `delivered` / `read`
/ `failed`) onto the `messages` audit rows. When `META_APP_SECRET` is set,
`X-Hub-Signature-256` is verified before the payload is trusted; when it is
unset, signature checking is skipped and `/health/ready` reports
`signature_check_enabled: false` rather than hiding it.

Full walkthrough for obtaining these credentials: [../docs/meta-setup.md](../docs/meta-setup.md).

## Going live with WhatsApp

1. Meta developer app → WhatsApp → test number + temporary token; create the
   `verification_code` authentication template (en_US, `{{1}}` in the body plus a
   Copy-Code button); allow-list your test numbers.
2. Put `META_PHONE_NUMBER_ID`, `META_ACCESS_TOKEN`, `META_TEMPLATE` and
   `META_TEMPLATE_LANG` in `.env`. Alternatively encrypt the token into the PB
   `settings` row, which then takes precedence:
   ```bash
   .venv/bin/python -c "from app.core.security import encrypt_secret; print(encrypt_secret('YOUR_META_TOKEN'))"
   ```
   Paste into `meta_token_enc` and fill `meta_phone_number_id`.
3. Set `META_VERIFY_TOKEN` to a random string you choose, register
   `{APP_URL}/webhooks/whatsapp` in the Meta app dashboard, and subscribe to the
   `messages` field. Set `META_APP_SECRET` so inbound calls are signature-checked.
4. Set `WAOTP_MOCK_DELIVERY=0` and `APP_ENV=production`.

Confirm the result with `curl https://api.example.com/health/ready` — it tells
you exactly which piece is still missing, by variable name.

## Limits

Defaults: 500 WhatsApp sends per month for the whole installation (0 =
unlimited), 5 per phone per hour on both channels, 300 s TTL, 3 attempts,
10 req/min per key, 30 req/min per IP, 5 active keys per owner. All of these
live in the single `settings` row and are editable from the PB admin UI with no
code changes; env values are only fallbacks.

## Sharing one PocketBase instance

All collections can be namespaced with a prefix (`WAOTP_PB_COLLECTIONS_PREFIX`,
default `waotp_`) so one PocketBase can host several projects. With a prefix set,
this app also gets its **own auth collection** (`waotp_users`) — accounts, tokens
and data are then fully separate from other apps on the instance, and their
collections are never touched. Provision with:

```bash
.venv/bin/python scripts/provision_pb.py --url https://pb.example.com \
    --email you@example.com --password '***'      # or PB_SUPERUSER_* env vars
```

Idempotent: existing collections are never modified (stale `owner` relations from
an earlier run are rebuilt only when the collections are empty), and the settings
seed row is only created when empty.

**Public signup is off.** The `waotp_users` collection is created with
`createRule = null`, so nobody can register against your installation — not
through the dashboard, and not by calling PocketBase directly. Create operator
accounts with `scripts/create_admin.py` or the PB admin UI. `ALLOW_SIGNUP=true`
reopens it deliberately for a shared team instance.

## Tests

```bash
.venv/bin/pytest -q     # full suite, no network needed (PocketBase/Meta/Telegram faked)
```

The suite runs against an in-memory PocketBase stand-in (`FakePB`) with mock
delivery, so it needs no credentials and no network. It covers failure paths on
purpose — expired codes, exhausted attempts, replayed idempotency keys, throttled
numbers, provider rejections and timeouts, malformed webhook payloads, bad
signatures, and the production startup refusals.

## Deployment

**Docker Compose is the primary install** — see
[../docker-compose.yml](../docker-compose.yml) and
[../docs/self-hosting.md](../docs/self-hosting.md). It runs PocketBase, this API
and the dashboard together, with a named volume for `pb_data`.

**Render** is a free alternative for operators without a VPS:
[../render.yaml](../render.yaml) is a Blueprint that provisions just this API.
Render prompts for every `sync: false` value on first deploy, and the file
explains the two caveats up front — Render's free tier cannot host PocketBase
(no persistent disk), and free instances sleep, which is a poor fit for an OTP
send on a user's critical path.

Four things about that Blueprint are deliberate:

- **`--workers 1` is a correctness constraint, not a default.** See
  [Concurrency](#concurrency) above.
- **`healthCheckPath: /health`**, which is safe now that liveness is
  dependency-free. `/health/ready` does query PocketBase, so using it as a
  deploy gate would fail deploys whenever the database was briefly busy.
- **`WAOTP_MOCK_DELIVERY=0`.** Any other value fakes delivery while still writing
  every DB row — a silent outage in production.
- **`DASHBOARD_ORIGIN` is required,** not optional. It is a single-origin CORS
  allowlist; a missing or mismatched value (trailing slash, wrong host) presents
  as a dead backend. See `../frontend/docs/deployment.md`.

**PocketBase** needs a persistent disk wherever it runs. Bound to localhost
behind a TLS-terminating reverse proxy is the intended shape. Back up `pb_data`
(Litestream or a daily copy, plus a restore drill) — it holds every API key hash,
every OTP audit row, the linked Telegram accounts and your settings. Pin
PocketBase **v0.40.x**: the JSVM migration uses the v0.40 collection/field API
with explicit `autodate` fields, which indexes on `created`/`updated` require.

## Layout

```
app/
  core/       config (env) · security (sha256/Fernet/link tokens) · error types
  providers/  WhatsAppProvider interface + the Meta implementation
  services/   pocketbase REST client · settings cache · quota/throttle ·
              otp store · meta Cloud API · telegram Bot API
  routers/    otp (send/verify/usage) · keys+dashboard usage ·
              telegram webhook · whatsapp webhook · health
  dependencies.py   X-Api-Key auth (+60 s cache) · PB-user-token auth · per-key and
                    per-IP rate limiters · send-idempotency store · asyncio locks
pocketbase/   pb_migrations · pb_data (runtime, gitignored) · Dockerfile (pinned binary)
scripts/      create_admin.py · set_telegram_webhook.py · provision_pb.py · seed_dev.py
tests/        pytest suite (FakePB in-memory control plane, mock delivery)
```
