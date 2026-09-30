# PRD — "WA OTP": Free-tier WhatsApp OTP Gateway for Indian Mini Apps

Version 1.0 · September 2026 · Status: Draft for build
Stack: **FastAPI (core API) + PocketBase (control plane / back office) + Next.js (public site & dashboard)**

---

## 1. Summary

WA OTP is a tiny WhatsApp OTP delivery platform. Indian indie developers of "mini apps"
(apps that rarely exceed 500 users — bhajan apps, community apps, senior-citizen services)
verify users by mobile number instead of email, because their users know WhatsApp but not email.
The platform exposes a two-call REST API (`/send`, `/verify`), gives every developer
**500 free OTPs per month**, and later lets them top up from ₹50 via UPI at transparent
Meta-price + 20–30% margin.

A second channel — **Telegram OTP via the free Bot API — is unlimited and costs ₹0 forever**,
making the platform's free tier genuinely sustainable: Telegram absorbs heavy testing and
techy audiences; WhatsApp (≈ ₹0.12/msg) serves universal reach and seniors.

### Why this wins (hypothesis)
- Email OTP fails the target audience (fake emails, seniors don't use email).
- SMS OTP in India requires DLT registration — hard for individuals. **WhatsApp OTP needs no DLT.**
- **Telegram OTP costs ₹0 per message** (Bot API is free, no quota) — no competitor at the
  "student with ₹50" price point can beat free.
- Big platforms (Twilio, MSG91, Vonage) are priced/documented for companies, not a student
  with a ₹50 UPI top-up.

## 2. Goals / Non-goals

**Goals (v1)**
1. A developer can sign up, get an API key, and send a real WhatsApp OTP in under 5 minutes.
2. Free tier: 500 delivered OTPs / developer / month; per-phone throttle 5 / hour.
3. Operator (you) sees all sends, failures, and quota usage in a back office with zero extra work.
4. OTP codes hashed at rest; API keys shown once; nothing sensitive logged.

**Non-goals (v1)**
- Multi-tenant "bring your own WABA" (Tech Provider / Embedded Signup) — Phase 3.
- SMS/email fallback channels, WhatsApp marketing/utility messaging, dashboards for end businesses.
- SLAs, uptime guarantees, team accounts.

## 3. Users

| Persona | Need |
|---|---|
| Mini-app developer (customer) | "Give me OTP for my app, free to test, 2 API calls, docs in Hinglish-friendly plain English" |
| You (operator) | See usage/failures, manage quota, control costs, get paid later |
| App end-user (senior citizen etc.) | Gets a normal WhatsApp message with a code + Copy button — nothing to learn |

## 4. Architecture

```
                       ┌────────────────────────────┐──▶ Meta WhatsApp Cloud API
   Mini app backend ──▶│  FastAPI  (hot path)       │──▶ Telegram Bot API (free)
   (customer's server) │  /v1/otp/send  {channel}   │◀── Telegram webhook (contact shares)
                       │  /v1/otp/verify            │
                       │  /v1/otp/usage             │
                       └─────┬───────────────▲──────┘
                             │ reads keys,   │ writes messages,
                             │ writes ledger │ otp codes, txns (REST)
                             ▼               │
                       ┌────────────────────────────┐        ┌──────────────┐
                       │  PocketBase (control plane)│◀──admin│ You (browser)│
                       │  users · api_keys · codes  │        └──────────────┘
                       │  messages · wallet_txns    │
                       └─────▲──────────────────────┘
                             │ auth (login) + key mgmt + usage display (REST/SDK)
                       ┌─────┴──────────────────────┐
                       │  Next.js (Vercel)          │──▶ Razorpay checkout (later)
                       │  landing · docs · dashboard│
                       └────────────────────────────┘
```

**Golden rule:** the customer-facing hot path is FastAPI. PocketBase is never exposed to
customers directly; Next.js talks to PocketBase only for login/key/usage.

### Responsibility split

| Concern | Service | Why |
|---|---|---|
| Developer accounts, login tokens | PocketBase | Built-in auth collection, zero code |
| API keys (hashed), wallet ledger, message log, OTP codes, rate card | PocketBase (data) | Single source of truth + free admin UI as back office |
| OTP send/verify, quota check, throttles, Meta call, error semantics | FastAPI | Typed errors, async, testable; JSVM error handling proved awkward in testing |
| Key issue/regenerate, usage view, top-up UI | Next.js + PocketBase REST | Standard web UX |
| Payments (Phase 2) | Next.js (checkout) → Razorpay → FastAPI webhook → ledger | Signature verification belongs in FastAPI |

## 5. Data model (PocketBase collections)

All collections admin-only (no API rules); FastAPI uses a **system user** token (or
superuser token) via PocketBase REST.

| Collection | Fields (essential) | Notes |
|---|---|---|
| `users` (auth) | email, password, `plan` (free/paid), `status` | PB built-in + 2 fields |
| `api_keys` | owner→users, `key_hash` (sha256, unique), `last4`, `label`, `active` | key shown once |
| `otp_codes` | owner, api_key, `phone`, `code_hash`, `expires`, `attempts` | TTL 5 min, max 3 attempts |
| `messages` | owner, api_key, `phone`, `wa_message_id`, `status` (sent/failed), `cost_type` (free/paid), `error` | append-only audit + quota source |
| `wallet_txns` | owner, `txn_type` (topup/free/spend/refund), `amount`, `note`, `balance_after` | append-only ledger |
| `rate_cards` | `country_iso`, `country_name`, `meta_rate_usd`, `our_rate_inr`, `updated_at` | refreshed by cron |
| `tg_links` | `phone` (unique), `chat_id`, `tg_user_id`, `linked_at` | phone→Telegram mapping, **platform-wide**: a user links once to our bot, every developer's Telegram OTP then reaches them |
| `settings` | single row: Meta phone_number_id, token (encrypted at rest), template name/lang, limits, Telegram bot token + @username | edited by operator |

> Implementation gotcha found in live testing (PocketBase v0.40): collections created in
> migrations must declare `created`/`updated` as explicit `autodate` fields or any index on
> them fails. The reference migration in this repo already does this.

## 6. API spec (FastAPI, base path `/v1`)

Auth: `X-Api-Key` header → sha256 → lookup in `api_keys` (cache in memory 60 s).
All responses JSON. Errors: `400` bad input · `401` bad key · `403` key disabled ·
`429` quota/throttle · `502` Meta rejected · `503` not configured.

### POST /v1/otp/send
```json
// request
{ "to": "919876543210", "channel": "whatsapp", "code": "optional-custom-code" }
// channel: "whatsapp" (default) | "telegram"
// response 200 (platform mode; we generated the code)
{ "ok": true, "mode": "platform", "channel": "whatsapp", "expires_in": 300,
  "free_used": 42, "free_limit": 500, "reset_utc": "2026-10-01T00:00:00Z" }
```
Flow: validate key → check monthly quota (count `messages` sent this month for owner) →
check per-phone hourly throttle → generate 6-digit code (unless custom code passed) →
deliver:
- **whatsapp** → POST to Meta `/{phone_number_id}/messages` with authentication template
  (body param = code, button `sub_type:"url"` param = code — code must appear twice).
- **telegram** → look up `chat_id` in `tg_links` by phone; if absent, return
  `409 { "error": "user_not_linked", "link_url": "https://t.me/<bot>?start=<otp-request-token>" }`
  so the mini app can show a "Connect Telegram" button that deep-links to the bot. If linked,
  `sendMessage` with the code (plain message; bots can't send Copy-buttons, but codes are short).
→ on success: write `messages` row (`cost_type=free`, `channel` recorded) + `otp_codes` row →
respond. On delivery failure: write `messages` row with error, return 502.
**Failed sends never consume quota.**

### POST /v1/otp/verify
```json
{ "to": "919876543210", "code": "123456" }
// 200 { "ok": true, "verified": true }
// 400 { "ok": false, "verified": false, "attempts_left": 2 }
```
Latest non-expired `otp_codes` row for (owner, phone); hash-compare; ≥3 wrong attempts or
expiry → delete code, ask to resend.

### GET /v1/otp/usage
`{ "plan": "free", "used": 42, "limit": 500, "reset_utc": "..." }`

### Internal (operator / dashboard)
- Key issue/regenerate: `POST /v1/keys` (PocketBase user token required) → returns plaintext key once.
- Razorpay webhook (Phase 2): verify signature → insert `wallet_txns(topup)` → set user plan=paid.

## 7. Free tier & abuse policy

| Control | Value | Rationale |
|---|---|---|
| Monthly delivered OTPs / developer | 500 | Matches "mini apps ≤ 500 users"; worst case cost ≈ 500 × ₹0.12 ≈ ₹60/dev/month |
| Per-phone OTPs / hour | 5 | Stops burning quota on one victim number |
| Failed sends | not counted, but logged | Fair to customers, still auditable |
| Telegram channel | **unlimited, free** (Bot API has no quota; 1 msg/sec per chat is plenty) | ₹0 marginal cost; the cost safety valve for the whole platform |
| Verification attempts | 3 per code | Standard anti-brute-force |
| Signup | email + password; later phone-verify the developer themself | Blocks bulk free-tier farming |

Phase 1 safeguard: while running on Meta's **test number**, only the 5 admin-approved
recipients can receive anything — natural sandbox until launch.

## 8. Payments & pricing (Phase 2)

- Min top-up **₹50** via Razorpay (UPI/cards; KYC: sole proprietorship + PAN; fees ≈2–3%).
- Selling price = Meta rate-card price × 1.25 (tune 1.2–1.3), rounded to paise. Rate card
  fetched from Meta's published rates into `rate_cards` weekly (cron in FastAPI); dashboard
  shows the live table ("we charge exactly Meta's rate + 25%, nothing hidden").
- Sending rule: free quota exhausted → require `balance ≥ price(country)`; deduct inside a
  DB transaction, append `spend` row with `balance_after`. Block at negative balance.
- GST invoicing: defer to Phase 3 (or use Razorpay's invoice tools).

## 9. WhatsApp / Meta setup

**Testing (₹0):** Meta developer app → WhatsApp product → free test number + temporary
token → create authentication template `verification_code` (en_US, body `{{1}} is your
verification code...`, Copy Code button) → allow-list 5 real numbers → fill `settings`.

**Production sender number (BSNL):**
- One dedicated SIM that is **not** an active WhatsApp app account; kept switched on and in
  coverage in a basic phone (it must receive the one-time registration OTP and possible
  Meta verification call).
- Recommended recharge: the **annual long-validity plan (currently ₹1,499, 365 days,
  unlimited calls)** ≈ ₹125/month — number stays safe for a year with zero maintenance.
  Note: BSNL's old ₹1,198 annual appears replaced by ₹1,499, and **₹497 is an international
  roaming pack, not a domestic plan**. The ₹197 plan (~54–70 days validity) is the cheap
  keep-alive alternative but needs ~6 recharges/year; the ₹300/yr saving is not worth the
  risk of a lapsed/recycled production number. Verify current MRP on the BSNL portal before
  recharging.
- No data pack needed after registration (Cloud API sends from Meta's cloud, not the SIM).
- Replace the 24-h API Setup token with a **System User** token (Business Settings →
  System users → Admin, never expires).
- Messaging limits start at 250 unique users/24 h → 1k → 10k → 100k as quality stays green;
  business verification unlocks the ladder.

## 10. Deployment

| Piece | Where | Notes |
|---|---|---|
| PocketBase | Self-hosted VPS (`pb.example.com` or local Docker) | systemd binary or Docker behind Caddy/Nginx, bound to localhost. Namespaced by `WAOTP_PB_COLLECTIONS_PREFIX=waotp_` plus its own `waotp_users` auth collection |
| FastAPI hot path | Self-hosted VPS or PaaS (`api.example.com`) | `rootDir: backend`. Must run `--workers 1` — locks, idempotency store and the cached PB token are all per-process |
| HTTPS | Reverse proxy (Caddy/Nginx) | Reverse proxy terminates TLS for API and PocketBase |
| Next.js site/dashboard | Self-hosted or PaaS (`otp.example.com`) | Root Directory `frontend/`; env `NEXT_PUBLIC_PB_URL`, `NEXT_PUBLIC_API_URL`, … |
| Backups | Litestream → S3-compatible (or daily `pb_data` copy) | Audit and OTP ledger |
| Monitoring | Uptime monitor on `/health` + PocketBase logs | Alert on failure rate > 5%. `/health/ready` probes PocketBase |

PocketBase stays on the VPS rather than moving with the API: it is the system of record for
the wallet ledger and is already serving another project, so relocating it is a migration
with real downside and no upside.

Secrets are split by lifecycle. Environment secrets live in Render's env-var store
(encrypted): `PB_SUPERUSER_EMAIL`/`PB_SUPERUSER_PASSWORD`, `WAOTP_FERNET_KEY`,
`TELEGRAM_WEBHOOK_SECRET`, `DASHBOARD_ORIGIN`. Operational secrets — Meta token, Telegram bot
token, Razorpay key/secret — live Fernet-encrypted in the PocketBase `settings` row instead,
so rotating them needs no redeploy. `WAOTP_FERNET_KEY` must therefore stay stable across every
environment that reads that row.

## 11. Security checklist

- [ ] API keys stored only as sha256; plaintext returned once at creation
- [ ] OTP codes hashed; 5-min TTL; 3 attempts; single-use (delete on success)
- [ ] PocketBase API rules: all waotp collections admin-only; users can't read others' data
- [ ] Meta token encrypted at rest in `settings` (even a PB dump shouldn't leak it)
- [ ] HTTPS everywhere; CORS on FastAPI limited to dashboard origin
- [ ] PocketBase is shared with another project: `WAOTP_PB_COLLECTIONS_PREFIX` set (and equal on backend and dashboard) so wa-otp uses `waotp_*` and `waotp_users`, never the stock `users`/`api_keys`; no wa-otp data in another project's collections
- [ ] Customers call from their **backend**, never browser (docs + dashboard warning)
- [ ] Rate limit per API key (e.g. 10 req/min) in FastAPI middleware

## 12. Milestones

| Phase | Scope | Done when |
|---|---|---|
| **0. Playground** (week 1) | FastAPI skeleton + PocketBase locally + Meta test number; send/verify against own phone | You receive a real WhatsApp OTP end-to-end on your own number |
| **1. Private beta** (weeks 2–3) | Next.js dashboard (login, key, usage, tester page); deploy VPS + Caddy; backups; invite 3–5 developer friends | A friend integrates OTP into their app without your help |
| **1.5. Telegram channel** (week 4) | @BotFather bot; `setWebhook` → FastAPI `/telegram/webhook`; handle `/start` + `request_contact` share (accept only if `contact.user_id == from.id`); write `tg_links`; `channel:"telegram"` in `/send` | OTP received in Telegram after a one-tap number share; WhatsApp flow unchanged |
| **2. Public free tier** (weeks 5–6) | Public landing/docs; abuse controls tuned; real BSNL number + system-user token; business verification started | 10 external developers; 1000+ OTPs delivered; failure rate < 2% |
| **3. Monetize** | Razorpay top-ups ≥ ₹50; paid mode in `/send`; live rate-card page | First paid top-up converted and correctly deducted |
| **4. Scale out** (optional) | Tech Provider approval → customers bring their own WABA/number via Embedded Signup | First BYO-number customer |

## 13. KPIs

Sends/day · delivery failure rate · free-tier active developers · quota-exhaustion events ·
top-up conversion · p95 send latency (< 1.5 s excluding Meta) · Meta quality rating.

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Meta policy change / template rejection | Keep messages strictly authentication-category; monitor `messages` errors daily |
| Number flagged/recycled | Annual recharge, SIM always on, no unofficial WhatsApp libraries ever |
| Free-tier abuse | Phone throttle + (later) verify developers; keep limits adjustable in `settings` |
| Telegram opt-in friction | Bots can't message users who never started them — treat as UX: mini app shows a "Connect Telegram" deep link; position Telegram as the free channel for dev/techy audiences, WhatsApp as the universal one |
| Telegram ≠ identity proof by itself | Only accept a shared contact when its `user_id` matches the sender's; otherwise anyone could share a friend's number |
| Single VPS failure | Litestream backups; restore drill once before public launch |
| Render free-tier cold start (~30–50 s after ~15 min idle) | Accepted for the beta — only the first request after idle pays it. Fix when it starts costing users: move the service to Starter, or keep a free uptime pinger on `/v1/health`, which alerts and prevents spin-down at once |
| Shared PocketBase instance widens blast radius | wa-otp addresses only `waotp_*` collections and its own `waotp_users`; the other project's collections are never read or written. Asserted in the security checklist below |
| Competitors undercut | Compete on ₹50 UPI top-up + simple docs + live transparent pricing, not on lowest price |

## 15. Open questions

1. Brand name/domain? 2. Do docs need Hindi? 3. Verify BSNL MRP in your circle at recharge
time (tariffs change often). 4. Refund policy for failed paid sends (suggest: auto-refund `spend` on Meta failure).

## 16. Reference implementation in this repo

`pb_hooks/waotp.pb.js`, `pb_migrations/…`, `pb_public/index.html` contain a working
PocketBase-only version of Phases 0–1 (routes, quota logic, key flow, tester page).
Use them as the behavioural reference when building the FastAPI hot path — the logic,
responses, and limits are already specced by that code and partially live-tested
(route registration and migration behaviour verified on PocketBase v0.40.4).
