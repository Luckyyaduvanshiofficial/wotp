# Security Policy

## Supported versions

WOTP is **pre-1.0** and has no tagged releases yet. Only the current `main` branch receives security fixes. There is no backport policy because there is nothing yet to backport to — if you are running a fork or a pinned commit, track `main`.

## Reporting a vulnerability

**Please do not open a public issue.**

Report privately through **[GitHub Security Advisories](https://github.com/Luckyyaduvanshiofficial/wotp/security/advisories/new)** — the *Report a vulnerability* button under the repository's **Security** tab. It keeps the report, the discussion, and the eventual fix disclosure in one place without tipping anyone off.

A useful report includes:

- The affected component (backend router, service, migration, dashboard) and the commit or version you tested
- Reproduction steps — ideally a request, or a failing test
- The impact as you understand it: what an attacker gains
- Any fix or mitigation you have already thought of

### What to expect

- **Acknowledgement within a few days.** This is a small project maintained by one person, not a company with a security team. If a week passes with no reply, ping the advisory thread.
- **Updates as things progress**, including an honest "I am not going to get to this quickly" if that is the case.
- **Credit in the advisory** when it is published, unless you would rather stay anonymous.

There is no bug bounty. There is a genuine thank-you.

## Scope

These are the areas worth your attention, because they are where a bug costs someone real money or real privacy.

**In scope:**

- **OTP code or API key disclosure.** Both are stored as sha256 hashes at rest; plaintext is shown exactly once. Anything that recovers a plaintext code, key, or hash from the API, logs, or the database is a finding.
- **Authentication bypass** on `X-Api-Key` or on the PocketBase user token.
- **Quota, throttle, or rate-limit bypass.** This is the expensive one — unbounded sends spend the operator's real Meta balance. Includes the 60-second auth cache: a deactivated key that keeps working, or an identity confusion that lets one key spend another owner's quota.
- **Anything that exposes PocketBase or its superuser to a customer.** PocketBase is never meant to be reachable by anyone but the operator and FastAPI.
- **Cross-project data leakage** on a shared PocketBase instance through the `WOTP_PB_COLLECTIONS_PREFIX` isolation. Two projects sharing one instance is a supported deployment; one reading the other's data is a critical bug.
- **Fernet key handling** for the encrypted Meta and Telegram secrets in the `settings` row, and anything that leaks a decrypted secret.
- **Telegram webhook spoofing.** The webhook requires `TELEGRAM_WEBHOOK_SECRET`, and accepts a shared contact only if `contact.user_id == from.id`. A bypass of either lets an attacker receive someone else's OTPs — the highest-severity class of bug in this project.
- **SSRF or injection through the OTP message payload** or the phone number field.
- **Account takeover** via the signup, login, or password-reset flow.

**Out of scope:**

- Missing security headers on the public marketing site
- Self-XSS
- Social engineering of the maintainer or of your own users
- Anything requiring an already-compromised operator machine or a leaked `.env`
- Volumetric DoS — this project runs a single worker by design, and a determined flood is an infrastructure problem, not a code one

## Operator hardening checklist

If you are self-hosting, this is the short list that matters most.

> [!WARNING]
> **Never commit a `.env` file — and if one leaks, rotate the secret.**
>
> Deleting the file is not enough. Git history retains it, and scrapers watch public pushes and pick up credentials within seconds. Treat any secret that has touched a repository, a screenshot, a chat, or a log as already public.

- [ ] **Rotate on any suspicion.** The PocketBase superuser password; `WOTP_FERNET_KEY` (rotating it means re-entering the Meta token into the `settings` row, since the old ciphertext can no longer be decrypted); `TELEGRAM_WEBHOOK_SECRET` (re-run `scripts/set_telegram_webhook.py`).
- [ ] **Keep PocketBase off the public internet.** The compose stack already binds it to `127.0.0.1`; if you changed that, put a firewall or a proxy in front. Customers talk to FastAPI and nothing else. Reach the admin UI over an SSH tunnel.
- [ ] **Set `META_APP_SECRET`.** The API refuses to boot in production without it when WhatsApp credentials are configured, because unsigned webhook callbacks can be forged by anyone who learns the URL.
- [ ] **Set `WOTP_MOCK_DELIVERY=0` in production.** Left at `1`, delivery is faked — which is exactly the kind of thing that is discovered by a user who never received their code.
- [ ] **Put the backend behind TLS.** All of it — the API, the dashboard, and the PocketBase admin UI if it is reachable at all.
- [ ] **Restrict CORS.** Set `DASHBOARD_ORIGIN` to your dashboard's origin specifically, not `*`.
- [ ] **Set `TRUST_PROXY_HEADERS=1` only behind a proxy you control,** and only one that does not forward a client-supplied `X-Forwarded-For` verbatim. It is what makes the per-IP limit meaningful rather than bypassable.
- [ ] **Back up `pb_data/`.** The audit log is the record of what was sent and to whom. Use Litestream or a daily copy, and do a restore drill before you go public.
- [ ] **Schedule `scripts/cleanup.py`** so expired OTP codes and old audit rows do not accumulate forever. Decide your retention window deliberately — it is a privacy choice, not only a storage one.
- [ ] **Set a strong `TELEGRAM_WEBHOOK_SECRET`** and register the webhook with it, so the webhook endpoint is not openly callable.
- [ ] **Serve API keys to servers, never browsers.** Every key is a spending credential. Integrators must call the API from their backend, and the dashboard's own tester keeps its key in memory only for that reason.
- [ ] **Watch the `messages` collection** for a failure-rate spike. It is the earliest signal of both a Meta policy problem and an abuse attempt.
