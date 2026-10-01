# memory.md

**Read this first.** It is the "where are we now" file: current state, what is
broken, and where the canonical answers live. It is deliberately *not* a
restatement of the architecture — that changes rarely and is already written
down properly, so this file points at it instead.

For history and what changed in each release, read **[CHANGELOG.md](CHANGELOG.md)**.
That file is canonical; this one references it rather than repeating it, because a
duplicated history goes stale in one place and lies in the other.

Last updated: 2026-10-01.

---

## In thirty seconds

**WOTP** is an open-source, self-hosted, bring-your-own-credentials OTP gateway.
`POST /v1/otp/send` hands a one-time password to **your** WhatsApp Business
account or **your** Telegram bot; `POST /v1/otp/verify` checks what the user
typed. You post a phone number, the gateway delivers a code, and it stores only a
hash of it.

There is no hosted tier, no signup, no account to create with this project, and
nothing to pay it. That is the product, not a limitation of the current release —
if you find yourself building a signup flow, a wallet, or a payment path, **stop**:
that surface was deliberately removed and the removal is recorded in the changelog.

Three containers: FastAPI (`:8000`), PocketBase (`:8090`), Next.js (`:3000`).

---

## Where the answers live

Do not re-derive these. Read them.

| Question | File |
|---|---|
| What changed, when, and in which release | **`CHANGELOG.md`** — canonical history |
| Product spec: architecture, data model, API semantics, limits, milestones | **`PRD.md`** |
| Operating rules, branch policy, the safety checklist before finishing a turn | **`AGENTS.md`** |
| Architecture, commands, and the hard-won gotchas | **`CLAUDE.md`** |
| Backend API and operations | `backend/README.md`, `backend/docs/api.md` |
| Dashboard conventions (feature layout, TanStack, icons, formatting) | `frontend/CLAUDE.md`, `frontend/AGENTS.md` |
| Threat model and the hardening checklist | `SECURITY.md` |
| Deploying: plain server, Dokploy, Dokku | `docs/self-hosting.md`, `docs/deploy-dokploy.md`, `docs/deploy-dokku.md` |

`CLAUDE.md` and `AGENTS.md` are the authority on *how to work here*. This file is
the authority on *what is true right now*. When they disagree, the newer wins —
and fix the stale one rather than working around it.

---

## Current state

| | |
|---|---|
| **Version** | `0.1.0`, tagged 2026-10-01. It is the **only** tag. |
| **Branch** | `main` is the single trunk. There is no `feat/self-host`; it was retired. |
| **Tests** | 159 passing, no network calls (`FakePB` + mock delivery). |
| **CI** | Green. Backend suite, frontend checks, full-history secret scan, dependency audits. |
| **Open PRs / issues** | None. |

Everything built between 2026-09-14 and the tag is folded into the `0.1.0` entry
in the changelog. Pre-release work is **not** presented as releases; if you see a
version above `0.1.0` anywhere, it is wrong.

### Deployment

- **API — live** at `https://waotp-api.dokku.space`, reporting `name: WOTP`,
  `version: 0.1.0`, `pocketbase: true`, `mock_delivery: false`.
- **PocketBase — reachable from the API.** Whether it is reachable from a
  *browser* is unconfirmed, and that is the one thing standing between you and a
  working dashboard.
- **Dashboard — not deployed yet.** Both a Vercel path and a Dokku path are
  prepared and documented; neither has been exercised.

### Known open items on the live API

`GET /health/ready` is the source of truth for these — it reports state by
variable *name* and never by value, so it is safe to read in public.

1. **`META_APP_SECRET` is unset**, so inbound webhook signatures are **not
   verified**. Anyone who learns the webhook URL can post forged delivery
   statuses.
2. **`META_VERIFY_TOKEN` is unset**, so Meta's handshake returns `403` and Meta
   will not register the webhook at all — meaning **no delivery callbacks ever
   arrive** and statuses sit at `sent` forever. This is the more urgent of the two.
3. **`DASHBOARD_ORIGIN` accepts exactly one origin.** Vercel preview deployments
   get unique `*.vercel.app` URLs, so previews will render and then fail every API
   call. Making it a comma-separated list is a small, contained change that has
   been offered and not yet built.

None of these is a code defect. All three are configuration on the deployment.

---

## Traps that have already cost real time

- **Dokku's build context is always the repository root.** `builder-dockerfile:set
  <app> dockerfile-path <path>` moves where the Dockerfile is *read from*, not the
  context. A Dockerfile written for a subdirectory fails with a `file not found`
  that says nothing about the actual cause. That is why `Dockerfile.web` and the
  root `Dockerfile` exist alongside `frontend/Dockerfile` and `backend/Dockerfile`.
- **`.dockerignore` patterns are root-relative.** A bare `node_modules/` excludes
  only the root one; `frontend/node_modules` (1.3 GB here) needs `**/`.
- **`NEXT_PUBLIC_*` values are compiled into the browser bundle.** They are
  build-time, not runtime: changing one needs a rebuild, never a restart, and
  `config:set` alone does nothing on Dokku. Missing values **fail the build on
  purpose** — a dashboard whose canonical URLs say `localhost` is worse than a red
  build.
- **The build guards are intentional.** The API refuses to boot in production
  without its secrets; `next.config.ts` refuses to build without
  `NEXT_PUBLIC_APP_URL`; `lib/pb.ts` refuses without `NEXT_PUBLIC_PB_URL`. Do not
  "fix" a failing build by weakening one.
- **Never `git add -A` here.** It has already swept in a 3.6 MB font download and
  its licence. Stage explicit paths.
- **`WAOTP_*` still works.** The rename to WOTP deliberately left the old
  environment variable names and the collection prefix default alone, so
  pre-rename installs keep running. Do not "clean up" the aliases.
- **Never rewrite published history** (`AGENTS.md`). A real Meta phone number id
  is in published history; it is an identifier, not a credential, and it stays.

---

## Before you finish a turn

`AGENTS.md` holds the full checklist. The short version: no secrets committed, a
regression test that was watched to fail without the fix, `pytest` +
`typecheck` + `lint` + `format:check` all green, and a plain statement of anything
you could **not** verify.

That last one matters here more than usual. **Docker is not installed on the
development machine**, so no image in this repository has ever been built
locally — the Dockerfiles are validated by inspection only. Do not describe a
Docker change as tested when it has not been.
