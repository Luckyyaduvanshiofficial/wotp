# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> [!CAUTION]
> **`main` is the single trunk, and it may be deployed.**
> - The old `main` / `feat/self-host` split is **retired**. Every feature, fix and doc change lands on
>   `main`, via short-lived feature branches.
> - If a deployment is attached to `main`, every push ships to real users, and the PocketBase migrations
>   run against a real database on start. Confirm with the owner before pushing.
> - Always check `git branch --show-current` before making changes. See `AGENTS.md` for the full policy.

## What this is

WOTP — an open-source, self-hosted, bring-your-own-credentials OTP gateway. You run it on your own
Meta WhatsApp Cloud API account or your own Telegram bot. Two-call REST API (`/v1/otp/send`,
`/v1/otp/verify`); a configurable monthly WhatsApp cap (default 500 for the installation) that
Telegram is never metered against.

**`PRD.md` is the canonical spec** (architecture, data model, API semantics, limits, milestones).
Deeper docs: `backend/README.md` (API + ops), `backend/docs/api.md` (integrator reference),
`frontend/CLAUDE.md` + `frontend/AGENTS.md` (dashboard conventions).

Monorepo layout:

- `backend/` — FastAPI hot path + PocketBase control plane (Python, own venv at `backend/.venv`)
- `frontend/` — Next.js 16 dashboard + public site (Bun, TypeScript, shadcn/ui). One repo: the root is the only git repository.
- `graphify-out/` — generated artifacts, ignore

## Architecture (the golden rule)

```
Mini app backend ──▶ FastAPI :8000 (hot path)  ──▶ Meta Cloud API / Telegram Bot API
                        │  ▲
          reads/writes  ▼  │ superuser REST
                   PocketBase :8090  ◀── operator browser (admin UI = back office)
Next.js dashboard ──▶ PocketBase (login/keys/usage) + FastAPI (tester, key mgmt routes)
```

- **PocketBase is never exposed to customers.** FastAPI owns all OTP send/verify/quota/throttle/provider logic; it talks to PocketBase as a superuser via REST. PocketBase is pure data + back office (its admin UI is the operator's dashboard).
- All WOTP data lives in PocketBase collections (`api_keys`, `otp_codes`, `messages`, `tg_links`, single `settings` row), all admin-only. The hosted-era `wallet_txns` and `rate_cards` collections are removed by the self-host migration. With `WOTP_PB_COLLECTIONS_PREFIX=waotp_` (default) collections are prefixed and the app uses its own `waotp_users` auth collection — this is how one PocketBase instance is shared across projects.
- **Limits are data, not code**: the single `settings` row holds quota (500/mo WhatsApp-only), throttle (5/phone/hour, both channels), TTL (300 s), attempts (3), per-key rate limit, max keys. Editable from the PB admin UI; env values are fallbacks only.
- Quota semantics that trip people up: the monthly quota counts **WhatsApp-delivered sends only**; Telegram is unlimited. Failed sends never consume quota, and delivered sends stay counted even if a later status callback reports a failure: usage is recorded once, on the immutable `billable` flag written at send time. That is deliberate — a counter that drops when messages succeed is not a spend limit. Per-phone throttle and per-key rate limit apply to **both** channels.
- Concurrency: a single uvicorn worker holds a per-OWNER asyncio lock around sends (the cap and the throttle are owner-scoped, and one owner may hold five keys) and per-(owner, phone) locks around verifies — don't add a second worker without rethinking this.
- `POST /v1/otp/send` accepts an optional `Idempotency-Key` header: responses are replay-deduped per (api_key, header value) for the code's TTL (process-local store in `app/dependencies.py`, same single-worker assumption as the rate limiter). Successes are cached, and so is the one failure where the provider accepted the message but the ledger write afterwards failed — replaying that error is what stops a retry from double-sending. Ordinary failures stay retryable. Replays carry `Idempotency-Replayed: true`.
- `WOTP_MOCK_DELIVERY=1` fakes provider delivery while keeping every DB row real — the whole send→verify→quota→ledger flow runs with no Meta/Telegram credentials. Must be `0`/absent in production.
- Secrets (Meta token, Telegram bot token) are Fernet-encrypted **in the PB `settings` row**, not env; the app reads config from there so going live needs no redeploy. API keys and OTP codes are stored sha256-hashed only.

## Commands

### Backend (run from `backend/`)

```bash
.venv/bin/pip install -r requirements-dev.txt   # one-time setup

# PocketBase (binary in backend/pocketbase/, collections auto-migrate on start)
cd pocketbase && ./pocketbase superuser upsert you@local devpass123 && ./pocketbase serve --http=127.0.0.1:8090

.venv/bin/uvicorn app.main:app --port 8000      # API, docs at /docs
.venv/bin/python scripts/seed_dev.py dev@wotp.local devpass123   # dev developer + API key

.venv/bin/pytest -q                             # full suite, no network (FakePB + mock delivery)
.venv/bin/pytest tests/test_quota.py -q         # one file
.venv/bin/pytest tests/test_quota.py::test_name -q   # one test
```

Backend code layout: `app/routers/` (otp, keys, telegram_webhook, health) → `app/services/` (pocketbase client, settings cache, quota/throttle, otp store, meta, telegram) → `app/core/` (config, security, errors); `app/dependencies.py` holds auth (`X-Api-Key` + 60 s cache, PB user token), rate limiter, and the asyncio locks.

### Frontend (run from `frontend/`)

```bash
bun install
cp .env.local.example .env.local
bun dev               # http://localhost:3000
bun run build
bun run typecheck     # tsc --noEmit
bun run lint          # oxlint
bun run lint:fix      # oxlint --fix + format
bun run format        # oxfmt
```

Frontend auth talks to PocketBase (`NEXT_PUBLIC_PB_URL`) via the PocketBase JS SDK; calls to the FastAPI backend use `NEXT_PUBLIC_API_URL`. The backend must have `DASHBOARD_ORIGIN` set to the dashboard origin or every browser call fails CORS.

For frontend conventions (feature-based structure, TanStack Query/Form patterns, icons rule, `PageContainer`, single-quote/no-trailing-comma formatting) follow `frontend/CLAUDE.md` and `frontend/AGENTS.md` — they are authoritative for anything under `frontend/`.

## Gotchas

- PocketBase must stay pinned to v0.40.x: the JSVM migration uses the v0.40 collection/field API with explicit `autodate` fields (required for indexes on `created`/`updated`).
- `scripts/provision_pb.py` is idempotent by design — existing collections are never modified. Keep it that way.
- Telegram link flow: unlinked phone → `409 user_not_linked` + `link_url` deep link; the webhook accepts a shared contact **only if `contact.user_id == from.id`**; PB failures in the webhook return `503` so Telegram retries.
- Error contract: `{"ok": false, "error": "<code>", ...}` with specific HTTP codes (`400/401/403/404/409/429/502/503`); 429s carry `Retry-After`; validation errors never echo raw input. Key retirement is `DELETE /v1/keys/{id}` (`POST /v1/keys/deactivate` is a deprecated alias); key creation returns `201`. Every route declares its errors in the OpenAPI spec (see `error_responses()` in `app/core/errors.py`) — keep new routes and `docs/api.md` §7 in sync when adding error codes.
