# wa otp — agent briefing

you are integrating an otp gateway. this file is the whole contract. read it
once, then write the integration. do not browse the site for more context —
everything you need is here, and anything not in this file does not exist.

## 1 · environment

two values, neither of which is in this file:

    WAOTP_API   gateway base url, no trailing slash
    WAOTP_KEY   an api key, prefixed waotp_

ask the user for both. never invent a host. never hardcode a key — put it in an
environment variable or a secret manager.

## 2 · the whole integration

    POST $WAOTP_API/v1/otp/send
      X-Api-Key: $WAOTP_KEY
      Content-Type: application/json
      { "to": "919876543210", "channel": "whatsapp" }

      channel   optional  "whatsapp" (default) | "telegram"
      code      optional  custom code, 4-10 chars [A-Za-z0-9]

      200 { "ok": true, "channel": "whatsapp",
            "request_id": "m8f3k2m9xq01zb4",
            "message_id": "wamid.XXXX",
            "expires_in": 300, "used": 42, "limit": 500,
            "reset_utc": "2026-10-01T00:00:00Z" }

    POST $WAOTP_API/v1/otp/verify
      X-Api-Key: $WAOTP_KEY
      Content-Type: application/json
      { "to": "919876543210", "code": "123456" }

      200 { "ok": true, "verified": true }
      400 { "ok": false, "verified": false,
            "error": "wrong_code", "attempts_left": 2 }

that is the entire surface. build the ui timer from `expires_in` in the send
response — do not hardcode 300.

`to` is lenient: `+`, spaces and dashes are ignored, a bare national number is
read with the installation's default country code (india `+91` unless the
operator changed it), and a leading trunk `0` is dropped. normalized form is
digits + country code.

    GET $WAOTP_API/v1/otp/usage   ->   { "used", "limit", "reset_utc" }

## 3 · limits — read them from responses, never hardcode

    monthly sends     500 whatsapp, for the whole installation, utc calendar month
    telegram          never metered against that monthly cap
    per phone         5 sends / hour, both channels
    verify attempts   3 per code, then the code is destroyed
    code ttl          300 s
    requests          10 / min per key, all endpoints combined
    active keys       5

these are the installation's own defaults and the operator can change them.
`limit`, `expires_in` and every `Retry-After` in a real response win over this
list. `limit` is `0` when the operator has set no monthly cap at all.

failed sends never consume quota or throttle, but they are always logged.

## 4 · verify behaviour that breaks naive code

    single-use    a code dies the instant it verifies. re-verifying it, even
                  correctly and immediately, returns code_expired.
    latest only   verify checks the newest code for that phone. sending twice
                  silently kills the first code. never send twice for one screen.
    per code      the 3-attempt budget belongs to the code, not the phone. a new
                  code means a fresh 3.

## 5 · errors, and what to do about each

    400 invalid_request    fix the request; retrying unchanged changes nothing
                           detail: an array of field errors, or a string
    401 invalid_api_key    key missing or unknown; missing_header:true if absent
    403 key_disabled       key deactivated, or the account is suspended
    404 key_not_found      unknown key id on deactivate
    409 user_not_linked    telegram first contact; show link_url as a "connect
                           telegram" button, then RETRY THE SEND. cost nothing,
                           stored no code, consumed no quota
    409 key_limit_reached  5 active keys already; deactivate one
    429 quota_exceeded     the installation's monthly whatsapp cap; sleep
                           Retry-After (min 60), or move traffic to telegram,
                           which is not metered against that cap
    429 phone_throttled    more than 5 sends to one phone in the trailing hour;
                           sleep Retry-After (3600)
    429 rate_limited       more than 10 req/min on this key; sleep Retry-After
                           (60)
    502 delivery_failed    read `retryable`:
                             true  -> transient. retry with backoff.
                             false -> permanent. DO NOT RETRY. the number is not
                                      on whatsapp, or the telegram chat is
                                      blocked. tell the user.
    503 not_configured     operator has not set up this channel; not fixable
                           from your side, so use the other channel
    503 upstream_unavailable  store is down; retry with exponential backoff
    500 internal_error     retry once with backoff, then stop

sleep exactly the value in the `Retry-After` header. never guess a backoff.
never retry a 4xx. do retry a 503.

error bodies are `{ "ok": false, "error": "<code>" }` plus the optional extras
named above.

## 6 · rules

    - call the api from the user's BACKEND only. never from a browser. a key in
      client javascript is public, and CORS is locked to the dashboard origin,
      so browser calls fail anyway.
    - keep the key in an env var or secret manager. never in source, logs, or a
      client bundle.
    - never log an otp code, sent or received.
    - trust only the api's { "ok": true, "verified": true }. never a client-side
      "the user says they got it".
    - give the http client a timeout of at least 30 s. the gateway itself waits
      up to ~15 s on the provider.
    - keep `request_id` for sends you care about; it locates the message in the
      audit log.
    - do not send a custom `code` unless asked. the generated 6-digit code is the
      safer default, and a code derived from user data is guessable.

## 7 · testing without credentials

if the operator runs the gateway with `WAOTP_MOCK_DELIVERY=1`, delivery is faked
while every response, error, quota and throttle behaves identically — and codes
are really stored. send a custom code and verify it back:

    POST /v1/otp/send    { "to": "919876543210", "code": "citest1" }
    POST /v1/otp/verify  { "to": "919876543210", "code": "citest1" }

`message_id` values start with `mock-` in this mode. `GET /v1/health` reports
the mode: `{ "ok": true, "pb": true, "mock_delivery": false }`.

## 8 · done when

    [ ] key and base url come from env vars, not source
    [ ] send + verify both run server-side
    [ ] ui timer reads expires_in from the send response
    [ ] the 4xx errors above are handled explicitly, and no 4xx is retried
    [ ] Retry-After is honoured on 429
    [ ] retryable:false on 502 stops the retry rather than looping
    [ ] the target project's type checker and tests pass

more detail, with every field explained: /docs
