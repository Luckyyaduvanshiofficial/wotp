# wa otp — integration reference

**api version:** 0.1.0 · **updated:** 2026-09-15
**written for:** an ai agent doing the wiring, and the operator supervising it.

wa otp is a two-call otp gateway. one endpoint sends a code over whatsapp or
telegram, a second one checks it. the installation you are calling runs on
someone's own whatsapp business account and applies its own monthly send cap to
whatsapp; telegram is never metered against that cap.

the whole integration is two http requests. most of this page is the detail
around them — every field, every error code, and the retry decision for each.

> the operator, deployment and bot-setup doc lives in
> [`backend/README.md`](../README.md). this page covers only the integrator-facing
> REST API.

**conventions used here**

- base url is written as `$WAOTP_API` — a shell variable, because there is no
  canonical live host to print. replace it with the host you were given.
- every request and response is json; send `Content-Type: application/json`.
- your api key looks like `waotp_xxxxxxxxxxxxxxxx` and travels in the `X-Api-Key`
  header, never in a url.
- `919876543210` is a placeholder phone number. use your own.

---

## if you are an agent — read this first

the rest of this page is reference. this section is the part that changes what
you write.

1. **fetch the briefing.** `/agent-briefing.md` on this site is the whole
   contract in one file, written to be pasted into a context window. it is
   generated from the same facts as this page. in the repository it lives at
   `frontend/public/agent-briefing.md`.
2. **ask the user for two values.** the gateway base url and an api key. never
   invent a host. never guess a key.
3. **put both in environment variables.** a key in source, in a log, or in a
   client bundle is a leaked key.
4. **put both calls in the backend.** browser → your backend → wa otp is the only
   supported shape. the **security** section below explains why, and the gateway
   enforces it anyway.
5. **build the flow in this order.** send → read `expires_in` from the response
   and start the ui timer → verify → act on `{ "ok": true, "verified": true }`.
   never act on a client-side "the user says they got it".
6. **handle these four errors explicitly.** `409 user_not_linked` (show the link,
   then retry the same send), `429` (sleep the `Retry-After` header),
   `502` with `retryable: false` (stop, do not retry), and `400` (fix the
   request, retrying unchanged changes nothing).
7. **never retry a 4xx. do retry a 503.** and never hardcode a backoff when the
   response already told you how long to wait.
8. **do not invent endpoints.** if it is not in the endpoint map below, it does
   not exist. there is no "check link status" endpoint and no "resend" endpoint.
9. **run the target project's type checker and tests** before you call it done.

done when: the key comes from the environment, both calls run server-side, the
timer reads `expires_in`, the four errors above are handled, `Retry-After` is
honoured, `retryable: false` stops the retry, and the project's checks pass.

---

## endpoint map

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/v1/otp/send` | `X-Api-Key` | Deliver a code to a phone |
| POST | `/v1/otp/verify` | `X-Api-Key` | Check the code the user typed |
| GET | `/v1/otp/usage` | `X-Api-Key` | Monthly quota usage for the installation |
| GET | `/v1/keys` | Dashboard bearer token | List your keys (masked) |
| POST | `/v1/keys` | Dashboard bearer token | Issue a new key |
| POST | `/v1/keys/regenerate` | Dashboard bearer token | Rotate: kill every active key, issue one new |
| POST | `/v1/keys/deactivate` | Dashboard bearer token | Kill switch for one key |
| GET | `/v1/usage` | Dashboard bearer token | Dashboard view of the same numbers as `/v1/otp/usage` |
| GET | `/health` | none | Liveness probe. Touches no dependency, so it cannot flap |
| GET | `/health/ready` | none | Readiness: store reachable + provider configuration state. `503` when the store is down |
| GET | `/v1/health` | none | Deprecated alias of `/health/ready` |
| GET | `/webhooks/whatsapp` | Meta verification token | Meta subscription handshake endpoint |
| POST | `/webhooks/whatsapp` | `X-Hub-Signature-256` | Meta WhatsApp Cloud API delivery status callbacks |

`GET / POST /webhooks/whatsapp` and `POST /telegram/webhook` are webhook endpoints called by Meta and Telegram, not by your client applications.

---

## get an api key

Easiest path: sign in to the dashboard, open **api keys**, click **create key**,
copy the value. it is shown **exactly once** — store it now, because there is no
recovery path by design.

Prefer the api? issue a key with your dashboard bearer token:

```bash
curl -X POST "$WAOTP_API/v1/keys" \
  -H "Authorization: Bearer $DASHBOARD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"label": "my-mini-app"}'
```

response — store `api_key` immediately, you will never see it again:

```json
{
  "api_key": "waotp_xxxxxxxxxxxxxxxx",
  "last4": "xxxx",
  "label": "my-mini-app",
  "id": "k8f3k2m9xq01zb4"
}
```

---

## authentication

every `/v1/otp/*` route authenticates with your api key:

```
X-Api-Key: waotp_xxxxxxxxxxxxxxxx
```

- keys start with `waotp_`. the gateway stores only a sha256 hash — the plaintext
  exists at creation time and nowhere else.
- **shown once.** the creation response is the only time you see the full key.
  lost it? regenerate. there is no recovery, by design.
- keys resolve through a 60-second server-side cache, but regenerate and
  deactivate evict the old key immediately. old keys stop working at once, not
  after the cache window.
- **maximum 5 active keys** per owner. a 6th attempt returns
  `409 key_limit_reached` — deactivate one first.

### key management endpoints

these are dashboard routes. they take `Authorization: Bearer <dashboard token>`
— the token your dashboard session holds after login — not `X-Api-Key`.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/v1/keys` | — | `{"keys": [{"id", "last4", "label", "active", "created"}, ...]}` — masked, newest first |
| POST | `/v1/keys` | `{"label": "..."}` optional, default `"default"`, max 50 chars | `{"api_key", "last4", "label", "id"}` — plaintext shown once |
| POST | `/v1/keys/regenerate` | `{"label": "..."}` optional | Same shape as issue. **Deactivates every active key** (invalid immediately) and issues one fresh key |
| POST | `/v1/keys/deactivate` | `{"id": "<key id>"}` | `{"ok": true}`. Unknown or foreign ids get `404 key_not_found` |
| GET | `/v1/usage` | — | `{"used", "limit", "reset_utc"}` — same numbers as `/v1/otp/usage` |

regenerate means "make everything i currently have invalid, and give me one new
key". use it when a key leaks. use `/v1/keys/deactivate` when you only want to
retire one key — one per app or per environment, say.

---

## post /v1/otp/send

delivers a code to one phone.

```bash
curl -X POST "$WAOTP_API/v1/otp/send" \
  -H "X-Api-Key: $WAOTP_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to": "919876543210", "channel": "whatsapp"}'
```

### request

| Field | Type | Required | Notes |
|---|---|---|---|
| `to` | string | yes | 5–20 characters. lenient about formatting: `+`, spaces and dashes are ignored. 10 digits are read as india (+91); a leading trunk `0` is dropped. normalized form is plain digits with country code, e.g. `919876543210`. anything that does not normalize gets `400 invalid_request` |
| `channel` | string | no | `"whatsapp"` (default) or `"telegram"` |
| `code` | string | no | custom code: 4–10 characters, letters and digits only (`[A-Za-z0-9]`). omit it and the gateway generates a random 6-digit numeric code. custom codes are matched **exactly, case-sensitively** at verify time — `"AB12"` will not verify as `"ab12"` |

telegram instead of whatsapp — the same call with one field changed:

```bash
curl -X POST "$WAOTP_API/v1/otp/send" \
  -H "X-Api-Key: $WAOTP_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to": "919876543210", "channel": "telegram"}'
```

### 200 response, field by field

```json
{
  "ok": true,
  "channel": "whatsapp",
  "request_id": "m8f3k2m9xq01zb4",
  "message_id": "wamid.XXXXXXXXXX",
  "expires_in": 300,
  "used": 42,
  "limit": 500,
  "reset_utc": "2026-10-01T00:00:00Z"
}
```

| Field | Meaning |
|---|---|
| `ok` | `true` on success |
| `channel` | echoes the channel that was used |
| `request_id` | ledger id of this send. **keep it** — quote it in support requests; it is the fastest way to locate your message in the audit log |
| `message_id` | provider-side message id (`wamid.…` for whatsapp, a numeric id for telegram, `mock-…` in mock mode). used for delivery reconciliation |
| `expires_in` | seconds until the code expires — `300` (5 minutes) by default. build your ui timer from this instead of hardcoding |
| `used` | whatsapp sends delivered this utc month. after a whatsapp send it already includes that send; after a telegram send it reports the current whatsapp count (telegram never increments it) |
| `limit` | the installation's monthly whatsapp cap. `0` means the operator set no cap |
| `reset_utc` | when the quota window resets, ISO 8601 UTC — the first instant of the next utc month |

the gateway itself waits up to ~15 s on the provider, so give your http client a
timeout of at least 30 s.

### quota semantics

- **the monthly cap is whatsapp-only.** it counts *delivered* whatsapp sends in
  the current utc calendar month. telegram is **never metered against it** — not
  blocked by the monthly gate, not counted. telegram delivery is still billed by
  nobody, but it is not a promise about cost: whatsapp delivery is billed by Meta
  to the operator of this installation.
- **per-phone limit: 5 sends/hour, across both channels.** this stops someone
  hammering "resend" against a victim's number on a stolen screen.
- **failed sends are never counted** — not against the monthly cap, not against
  the per-phone window — but they are always logged, so delivery problems stay
  auditable.
- a `409 user_not_linked` (see **telegram linking** below) consumes nothing: no
  code stored, no quota, no throttle.
- when the monthly cap is hit you get `429 quota_exceeded` with a `Retry-After`
  header saying exactly how long until reset. moving those sends to telegram is
  the way around it.

---

## telegram linking — the first code to a new phone

telegram bots can only message people who started a chat with them. so the very
first telegram code to a phone bounces once, on purpose, with:

```json
{
  "ok": false,
  "error": "user_not_linked",
  "link_url": "https://t.me/<bot_username>?start=<signed-token>"
}
```

**what you do:** show a **"connect telegram"** button that opens `link_url` — a
normal `t.me` deep link that opens the gateway's bot with `/start` pre-filled.
then the flow runs itself:

1. the user taps the button → the bot opens in telegram.
2. the bot greets them and shows a one-time keyboard with a single **"share my
   number"** button (a telegram `request_contact` button).
3. the user taps it. the bot accepts the contact **only if it belongs to the
   sender themselves** (`contact.user_id == from.id`) — nobody can link a
   friend's number or a stranger's.
4. the bot confirms the number is linked.
5. **your app retries `POST /v1/otp/send`.** the code now arrives on telegram.
   call the same endpoint again — the 409 cost nothing, so a plain retry is all
   it takes.

linking is one-time per phone and platform-wide: once a user has connected to the
bot, every mini app on the gateway can deliver telegram codes to them. there is
no "check link status" endpoint — the 409 *is* the check, and retrying is cheap.

the bot and its webhook run entirely on the gateway side. you register and host
nothing. operator-side setup (bot token, webhook registration) is in
[`backend/README.md`](../README.md).

---

## post /v1/otp/verify

checks the code the user typed.

```json
{ "to": "919876543210", "code": "123456" }
```

- `to`: same normalization as `/send`.
- `code`: 1–10 characters. codes are exact strings; custom codes are
  case-sensitive.

### 200 — verified

```json
{ "ok": true, "verified": true }
```

### 400 — not verified

```json
{ "ok": false, "verified": false, "error": "wrong_code", "attempts_left": 2 }
```

| `error` | Meaning | Extra fields |
|---|---|---|
| `wrong_code` | the code did not match; the attempt counter went up. default budget is 3 attempts per code | `attempts_left` — attempts remaining before the code is destroyed |
| `too_many_attempts` | the last allowed attempt was just burned. the code is deleted; request a new one | `attempts_left: 0` |
| `code_expired` | no active code for this phone — never issued, older than `expires_in`, already used, or already destroyed by attempts. also returned when you re-verify a code that already succeeded | `detail: "request a new code"` |

three behaviours worth knowing before you build:

- **single-use.** a code dies the moment it verifies. re-verifying the same code
  — even immediately, even correctly — returns `400 code_expired`.
- **only the latest code counts.** verify always checks the most recent active
  code for that phone. send twice and the first code stops verifying even if it
  is unexpired and unattempted. do not send twice for one screen; if you must,
  tell the user to use the newest message.
- **attempts are per code, not per phone.** at 3 wrong entries the current code
  dies; the user requests a fresh code and gets a fresh budget of 3.

---

## get /v1/otp/usage

```bash
curl "$WAOTP_API/v1/otp/usage" -H "X-Api-Key: $WAOTP_KEY"
```

```json
{
  "used": 42,
  "limit": 500,
  "reset_utc": "2026-10-01T00:00:00Z"
}
```

| Field | Meaning |
|---|---|
| `used` | whatsapp sends delivered this utc month. telegram sends are not included, because they are never metered against the cap |
| `limit` | the installation's monthly whatsapp cap; `0` means the operator set no cap at all |
| `reset_utc` | first instant of the next utc month |

the dashboard shows the same numbers via `GET /v1/usage` (bearer-token auth).

---

## error reference

every error body shares one skeleton, plus optional extras:

```json
{ "ok": false, "error": "<code>" }
```

| HTTP | `error` | When it happens | Extra fields | What to do |
|---|---|---|---|---|
| 400 | `invalid_request` | malformed json, missing or short `to`, bad `code` pattern, unparseable phone number | `detail`, two shapes below | fix the request. retrying as-is changes nothing |
| 401 | `invalid_api_key` | `X-Api-Key` missing or unknown | `missing_header: true` when the header is absent entirely | check the key. if it is lost, regenerate |
| 401 | `invalid_user_token` | dashboard routes: missing or invalid bearer token | — | re-login on the dashboard |
| 403 | `key_disabled` | the key was deactivated, or the owning account is suspended | — | issue or re-enable a key; if suspended, contact the operator |
| 404 | `key_not_found` | `/v1/keys/deactivate` or `DELETE /v1/keys/{id}` with an unknown id, or one belonging to a different account | — | copy the id from `GET /v1/keys` |
| 409 | `user_not_linked` | telegram send to a phone that has not connected to the bot yet | `link_url` | show the "connect telegram" button, then retry the send |
| 409 | `key_limit_reached` | issuing a key while 5 active keys already exist | — | deactivate an unused key first |
| 429 | `quota_exceeded` | the installation's monthly whatsapp cap is exhausted | `used`, `limit`, `reset_utc` | wait for `reset_utc`, or move traffic to telegram. `Retry-After` = seconds until reset, minimum 60 |
| 429 | `phone_throttled` | more than 5 sends to the same phone in the trailing hour, both channels | `retry_after_seconds: 3600` | wait. don't queue aggressive retries — that keeps the phone pinned at the limit |
| 429 | `rate_limited` | more than 10 requests/min on one key, all authenticated endpoints combined | `retry_after_seconds: 60` | back off. requests rejected with 429 do not count toward the window |
| 502 | `delivery_failed` | the provider rejected or failed the delivery | `channel`, `detail`, `retryable` | follow the `retryable` flag, below |
| 503 | `not_configured` | the operator has not finished provider setup for this channel | `detail` | not fixable from your side — contact the operator, or send on the other channel |
| 503 | `upstream_unavailable` | the gateway's control-plane store is down (also what `/health/ready` returns then) | — | retry with exponential backoff; brief outages self-heal |
| 500 | `internal_error` | unexpected gateway bug | — | retry once with backoff; if it repeats, contact support with the timestamp and `request_id` |

### the `detail` field on 400 invalid_request

two shapes, depending on what failed.

field validation — an array, at most 5 entries, whitelisted fields only (your raw
input is never echoed back):

```json
{
  "ok": false,
  "error": "invalid_request",
  "detail": [
    { "loc": ["body", "to"], "msg": "Field required", "type": "missing" }
  ]
}
```

manual rejects, where the phone number did not normalize — a plain string:

```json
{
  "ok": false,
  "error": "invalid_request",
  "detail": "to must be a valid phone number (E.164, e.g. 919876543210)"
}
```

### the 502 `retryable` flag — your retry decision, already made

`502 delivery_failed` always includes `"retryable": true` or `false`:

- **`retryable: true`** — a transient provider hiccup (timeout, network
  unreachable). safe to retry, ideally with backoff.
- **`retryable: false`** — the provider said no and will say no again: typically
  the number is not on whatsapp, is not yet in the meta test-number allow-list,
  or the chat is blocked on telegram. **do not retry.** failed sends don't
  consume quota, but retry storms add nothing — show the user "check the number,
  or try whatsapp instead".

one rare case: if the gateway delivers the message but then fails to record it in
its ledger, you get `502 delivery_failed` with `retryable: false` and a detail
mentioning manual reconciliation. if you retry anyway the user gets a second code
— and only the newest code will verify. when in doubt, contact support with the
timestamp, phone and channel.

### `Retry-After` on 429s — recap

| Code | `Retry-After` header value |
|---|---|
| `rate_limited` | `60` |
| `phone_throttled` | `3600` (fixed; the throttle looks back over a trailing hour) |
| `quota_exceeded` | seconds until the utc month resets, minimum `60` |

always sleep for the header's value, not a guess of your own.

---

## limits

| Limit | Value | Scope | Notes |
|---|---|---|---|
| Monthly delivered codes | 500/month | Per installation, **whatsapp only** | utc calendar month; resets at `reset_utc`. `0` means the operator set no cap |
| Telegram sends | Not metered | Per installation | never counted, never blocked by the monthly gate. telegram delivery is free of charge, but that is not a claim about whatsapp — Meta bills the operator directly for whatsapp |
| Per-phone sends | 5/hour | Per owner + phone, **both channels** | trailing 1-hour window; protects the victim number |
| Verify attempts | 3 per code | Per code | the counter dies with the code; a new code means a fresh 3 |
| Code TTL | 300 s (5 min) | Per code | `expires_in` in the send response is authoritative |
| Per-key request rate | 10 requests/min | Per key, all authenticated endpoints combined | sliding 60-second window; rejected 429 requests do not count |
| Active api keys | 5 | Per owner | creating #6 returns `409 key_limit_reached` |

- the rate limiter is a sliding window per key, not fixed slots — 10 rapid-fire
  calls at :59 and 10 more at :01 will trip it. space requests slightly if you
  send in bursts.
- every authenticated call counts — send, verify and usage alike.
- these are the installation's defaults; the operator can tune them at any time.
  treat `limit`, `expires_in` and `Retry-After` values in actual responses as the
  source of truth.

---

## security

- **call the api from your backend, never the browser.** any key shipped in
  html or js is public the moment the page loads. the gateway enforces this too:
  cors is locked to the dashboard origin, so browser apps cannot read responses
  anyway. mini app frontend → your backend → wa otp is the only supported shape.
- **treat the key like a password.** it is shown once and stored server-side only
  as a sha256 hash. keep it in an environment variable or a secret manager —
  never in git, never in client bundles, never in logs. rotate with
  `/v1/keys/regenerate` if it leaks; rotation is instant.
- **codes are secrets too.** don't log the code you send or receive, and don't
  pass a custom `code` derivable from user data (birth date, phone digits). if
  you don't need a custom code, don't send one — the generated 6-digit code is
  the safer default.
- **verify server-side and act on the result.** only trust
  `{ "ok": true, "verified": true }` from the api — never a client-side "the user
  says they got the code" signal.
- **expiry is a feature.** 5-minute ttl + 3 attempts + single-use is the entire
  anti-brute-force model. don't work around it, for example by re-sending on
  every wrong attempt — the per-phone throttle will stop you, and it should.
- **respect `Retry-After`.** backing off on 429 and 502 keeps you off the abuse
  radar.
- **keep the `request_id`** of sends you care about. support gets fast when you
  can say "my user reports no message arrived, request_id m8f3k2m9xq01zb4".

---

## mock mode

the gateway can run with `WAOTP_MOCK_DELIVERY=1` (an operator setting):
**delivery is faked, but the api contract is identical** — same request fields,
same responses, same errors, same quota and throttle logic, and codes are really
stored so `/verify` works end to end. that makes it the right target for ci: your
integration tests exercise the full send → verify flow without touching whatsapp
or telegram.

what you can observe in mock mode:

- `wa_message_id` values look like `mock-1a2b3c4d5e6f` instead of `wamid.…`.
- no real message arrives. for automated tests, send a **custom code** and verify
  with the same value — send `{"to": "919876543210", "code": "citest1"}`, then
  verify `"citest1"`.
- `GET /v1/health` reports which mode the gateway is in:

```json
{ "ok": true, "pb": true, "mock_delivery": false }
```

if the control-plane store is unreachable, `/v1/health` returns
`503 {"ok": false, "error": "upstream_unavailable"}` instead — the same code you
would see on other endpoints during such an outage.
