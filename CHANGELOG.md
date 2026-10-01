# Changelog

All notable changes to WOTP are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims for
[semantic versioning](https://semver.org/spec/v2.0.0.html).

This file is the **canonical** history: it is plain text, greppable, and needs no
build step, so it is what `memory.md` and other agent-facing docs cite. The public
page at [`/changelog`](frontend/src/app/changelog/page.tsx) mirrors it in the site
design — if you add an entry here, add it there too.

Dates are real tag dates. Version `0.1.0` was tagged on 2026-10-01; everything
before that was pre-release development on a single trunk between 2026-09-14 and
that date, and is folded into the `0.1.0` entry below rather than being presented
as a series of releases that never existed.

---

## [Unreleased]

Changes made after the `0.1.0` tag. The deployment paths are safe on an
installation already serving traffic; the typography change is visual only.

### Added

- **Dokploy deployment path** — `docker-compose.dokploy.yml` joins the
  `dokploy-network` so Traefik routes to it, publishes nothing to the host, and
  enumerates every environment variable by name instead of relying on an on-disk
  `env_file` (which a platform does not provide). See
  [docs/deploy-dokploy.md](docs/deploy-dokploy.md).
- **Dokku deployment path** — `Dockerfile.web` builds the dashboard against the
  repository root, which is the build context Dokku always uses. See
  [docs/deploy-dokku.md](docs/deploy-dokku.md).
- **`CHANGELOG.md` and `memory.md`.** This file is the canonical history;
  `memory.md` is the agent-facing "where are we now" note and cites this one
  rather than restating it.

### Changed

- **Headlines are set in Geist Pixel.** `.lm-display` and `.lm-h2` now use the
  instrument face; body copy deliberately stays in Geist, because a dot-matrix
  face at 14–16px is hard to read across the long docs and legal pages. Tracking
  on both rules went from negative to normal — the tightening suited a text
  serif and collided the pixel glyphs.
- **The pixel font is now a WOFF2 with a full character set, and is smaller for
  it.** It previously shipped as an 82.5 KB TTF subset to 19 glyphs — digits and
  punctuation only — which meant it *could not set a single word*. Uncompressed,
  the text range is 478 KB, which is what justified that restriction; compressed
  as WOFF2 the full 199-glyph set is **13.7 KB**. Shipping the compressed form
  gives more glyphs in 17% of the bytes. Regenerate as a WOFF2, never a TTF.

### Fixed

- **The dashboard could be built from a root context at all.** The root
  `.dockerignore` excluded `frontend/` outright, so a root-context build had no
  frontend sources to copy; and bare `node_modules/`, `.next/` and `.venv/`
  patterns excluded only the root instances, leaving `frontend/node_modules`
  (1.3 GB) inside the context. Patterns are now `**/`-prefixed.
- **The public changelog page no longer invents releases.** It carried `0.2.0`
  and `0.3.0` entries dated months before the first commit, and claimed 87 tests
  where there are 159. It now mirrors this file.
- **Retention pruning is reachable from the CLI** and reports what it would delete
  under `--dry-run` before it deletes anything.

---

## [0.1.0] — 2026-10-01

The first release. An open-source, self-hosted OTP gateway: two HTTP calls, send a
code and check a code, delivered over **your own** WhatsApp Business account or
your own Telegram bot. No hosted tier, no account to create, no paid edition.

Everything below landed between 2026-09-14 and the tag.

### Added

**API**

- `POST /v1/otp/send` and `POST /v1/otp/verify`, with a configurable code TTL
  (300 s default), a per-phone throttle (5/hour) and an attempt limit (3).
- An optional `Idempotency-Key` header. Responses are replay-deduped per
  `(api_key, header value)` for the code's TTL, including the one case that
  matters: the provider accepted the message but the ledger write afterwards
  failed. Replaying that error is what stops a retry from double-sending.
  Replays carry `Idempotency-Replayed: true`.
- Key management (issue, list, rotate, retire) and usage endpoints. Key
  creation returns `201`; retirement is `DELETE /v1/keys/{id}`.
- A documented error contract: `{"ok": false, "error": "<code>", ...}` with
  specific status codes, `Retry-After` on every `429`, and validation errors that
  never echo raw input. Every route declares its errors in the OpenAPI spec.
- `GET /health` (liveness) and `GET /health/ready` (readiness), the latter
  reporting provider state **by variable name, never by value**, so it is safe to
  read in public and names exactly what is still unconfigured.

**Channels**

- **WhatsApp** over the Meta Cloud API: authentication templates with a
  copy-code button, signature-verified delivery callbacks, and per-message
  delivery status. Supports a pre-approved sandbox template so the whole flow can
  be exercised before Meta finishes verifying a real business.
- **Telegram** over the Bot API: no business verification, no card, no
  per-message cost, and never metered by the WhatsApp quota. Includes the one-tap
  `request_contact` linking flow, which accepts a shared contact only when
  `contact.user_id == from.id` — that is what stops anyone linking a phone number
  that is not theirs.
- A `WhatsAppProvider` abstraction, so the two channels sit one `channel` field
  apart and the sandbox template shape is opt-in configuration rather than a
  hardcoded shape.

**Dashboard**

- Next.js dashboard and public site: overview, keys, a live OTP tester that
  generates copyable cURL commands, and a settings view.
- A seven-step first-run onboarding checklist that derives readiness from
  `/health/ready` rather than asking the operator to self-assess.
- A `/try` playground that runs the real request and response bodies, real status
  codes and real `Retry-After` headers locally, with nothing sent.
- A docs section covering quickstart, WhatsApp, Telegram, the API reference,
  self-hosting and an FAQ.

**Operations**

- Docker Compose stack: FastAPI, PocketBase and the dashboard, running as
  non-root, with every published port bound to loopback by default.
- Retention pruning for OTP codes and audit rows (`scripts/cleanup.py`), with a
  `--dry-run` preview.
- Request ids, so a log line can be correlated with the request that produced it.
- A CI pipeline running the backend suite, the frontend checks, a gitleaks scan
  over full history, and advisory dependency audits — with the dependencies it
  tests pinned, so CI and production agree.

**Site and discoverability**

- WhatsApp and Telegram landing pages, `sitemap.xml`, `robots.txt`, OpenGraph and
  Twitter card images, schema markup and a PWA manifest.
- An "instrument" display face — Geist Pixel, subset to a single static instance
  at 20 glyphs: 3,656,708 bytes down to 84,528 (97.7% smaller). It is applied to
  stat figures only; a dot-matrix face turns to mush below display size, which is
  why the dial readout and the nav wordmark were left alone. The OFL licence
  ships alongside it, as that licence requires.
- Privacy, terms and disclaimer pages.

### Changed

- **Renamed the project from WA OTP to WOTP** (breaking). The `WAOTP_*`
  environment variable names still work, and the collection prefix default
  deliberately did not move, so an installation that predates the rename keeps
  running. API keys issued before the rename keep authenticating.
- **Retired the `main` / `feat/self-host` branch split.** `main` is the single
  trunk; work happens on short-lived feature branches. The split had forced every
  security fix to be ported by hand and left "which branch is the product?"
  genuinely ambiguous.
- **Removed the hosted-era surface**: the signup page, the wallet and rate-card
  collections, and hardcoded author service URLs. This is BYOK and self-hosted;
  there is no hosted tier to sign up for.
- The monthly quota counts **WhatsApp-delivered sends only**. Telegram is
  unlimited, and failed sends never consume quota.

### Security

- **Webhook payloads can no longer reach the control-plane filter.** Forged
  delivery callbacks were a path from an unauthenticated request body into a
  query, which is the shape of an injection bug regardless of whether one was
  reachable.
- **Unauthenticated requests are rate-limited**, and unknown API keys are cached,
  so a request with a bad key cannot be used to probe the database on every call.
- **A user can no longer un-suspend their own account.**
- **The plaintext API key is no longer persisted in the browser.** Only the hash
  is stored server-side; the key itself is shown once.
- **Phone numbers are masked in logs** and kept out of log lines entirely.
- **Every published port is bound to loopback by default**, so a default install
  is not reachable from the network by accident.
- **In-process lock pools are bounded**, so a stream of distinct keys or numbers
  cannot grow them without limit.
- A real Meta identifier that had reached a test fixture was replaced with a
  placeholder.

### Fixed

- **Quota counts immutable usage, not a status callbacks can move.** Usage is
  recorded once, on the `billable` flag written at send time. A counter that drops
  when messages succeed is not a spend limit.
- **Sends are serialized per owner, not per API key.** The quota cap and the
  throttle are owner-scoped, and one owner may hold five keys, so per-key locking
  let a single owner exceed the cap by running five concurrent sends.
- **A delivered-but-unrecorded send is safe to retry** (see the idempotency entry
  above) instead of double-sending.
- **Phone normalization hardened**, and a delivered send whose ledger write failed
  no longer leaves the two views disagreeing.
- Meta credential handling and the signup control were made coherent with each
  other.
- Orphaned imports and a whitespace-insensitive `FakePB` filter double were
  cleaned up so the suite tests what it claims to.

---

## Notes for maintainers

- **One tag exists.** If you are reading a version number above `0.1.0` somewhere
  in this repository, it is wrong — fix it rather than assuming a release was
  deleted. The public changelog page carried invented `0.2.0` and `0.3.0` entries
  dated months before the first commit until it was corrected against this file.
- **A bug fix ships with a regression test that was watched to fail without the
  fix.** See `AGENTS.md`.
- Do not present pre-release work as releases. Fold it into the version it
  actually shipped in.
