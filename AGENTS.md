# AGENTS.md — AI Agent Guidelines

This document defines the architecture and **operational rules** for all AI coding
agents (Claude, Cursor, Antigravity, Copilot, Windsurf, Roo Code, etc.) working in the
**WOTP** repository.

---

## What This Repository Is

**WOTP** is a free, open-source, **BYOK** (bring-your-own-keys) WhatsApp & Telegram
OTP gateway. It is meant to be self-hosted by whoever needs it, using **their own** Meta
WhatsApp Cloud API credentials and **their own** Telegram bot. The project operates no
infrastructure on anyone's behalf, holds no shared credentials, and pays for no messages.

Read [`README.md`](README.md) for the product, [`SECURITY.md`](SECURITY.md) for the
threat model and hardening checklist, and [`docs/self-hosting.md`](docs/self-hosting.md)
for deployment.

---

## 🚨 CRITICAL RULES

> [!CAUTION]
> **1. NEVER commit credentials.** Every `.env` file is untracked. `backend/.env.example`
> and `.env.example` contain placeholders only. If a real token, password, Fernet key,
> webhook secret, phone number, or provider message id ever reaches a tracked file —
> including a test fixture — treat it as public, rotate it, and say so plainly rather than
> quietly deleting the file.

> [!CAUTION]
> **2. `main` is the trunk and it may be deployed.** This branch is the canonical
> open-source project. If a deployment is attached to `main` (Render, Vercel, Dokku, a
> VPS), then **every push to `main` ships to real users**. Confirm with the repository
> owner whether a deployment is live before pushing. The migrations in
> `backend/pocketbase/pb_migrations/` run against a real database when the service starts.

> [!CAUTION]
> **3. Never rewrite published history or force-push.** No `git push --force`,
> `git reset --hard` on a shared branch, or amending commits that are already pushed. If
> a secret or personal datum was committed, report it and let the owner decide.

> [!CAUTION]
> **4. Never perform a real send.** Tests use mock delivery and must not contact Meta,
> Telegram, or any external service. Do not run scripts that send messages. Do not point
> a script at a live PocketBase instance without the owner's explicit approval — a
> read-only query against production still touches production.

---

## Branch Model

**Single trunk.** Work happens on `main` and on short-lived feature branches that merge
back into it.

| Branch | Purpose |
|---|---|
| **`main`** | The canonical project. Every feature, fix and doc change lands here. |
| **feature branches** | Short-lived, one concern each (`fix/quota-accounting`, `feat/byok-onboarding`). Deleted after merge. |

Long-lived product-variant branches are deliberately **not** used in this repository. The
previous `main` / `feat/self-host` split was retired: it forced every security fix to be
ported by hand, duplicated the same work on both sides, and left "which branch is the
product?" genuinely ambiguous. If a product variant is ever needed, gate it with
configuration — never with a branch.

---

## Instructions for AI Agents

### Step 1: Understand what you are changing
Read the code you are about to edit. Never propose a change to a file you have not read.

### Step 2: Check for existing work
```bash
git status && git log --oneline -10
```
Do not overwrite uncommitted work. Do not write a second implementation of something that
already exists.

### Step 3: Make the change
- One concern per commit, conventional-commit style (`fix(quota): …`, `feat(docker): …`).
- Add or update a regression test with every bug fix, and prove it fails without the fix.
- Follow the patterns already present in the file you are editing.

### Step 4: Verify before finishing
Run the checks in the next section. **Never commit code that fails them**, and never
weaken or skip a test to make a suite pass.

### Step 5: Report honestly
State what you changed, what you verified, and what you could **not** verify. If something
is broken, partial, or untested, say so. Do not claim a security property you have not
actually tested.

---

## Development & Test Commands

### Backend (`backend/`)
```bash
cd backend
.venv/bin/pytest -q                                    # full suite, no external calls
.venv/bin/uvicorn app.main:app --port 8000 --workers 1
.venv/bin/python scripts/create_admin.py you@example.com
.venv/bin/python scripts/cleanup.py --dry-run          # retention preview
```

`--workers 1` is a correctness requirement, not a tuning knob: the send and verify locks,
the idempotency store, the rate limiters and the cached PocketBase token are all
**process-global**. See `backend/README.md` → Concurrency.

### Frontend (`frontend/`)
```bash
cd frontend
bun run typecheck     # tsc --noEmit
bun run lint          # oxlint
bun run format:check  # oxfmt
bun run build         # production Next.js build
```

`NEXT_PUBLIC_*` values are inlined at **build** time, and the app deliberately throws
when `NEXT_PUBLIC_PB_URL` is missing rather than defaulting to somebody else's server.
A build therefore needs those variables supplied.

### CI
[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs the backend suite, the
frontend checks, a gitleaks scan over full history, and advisory dependency audits. A
local check that disagrees with CI is a bug in the local check.

---

## Safety Checklist Before Finishing Any Turn

1. [ ] Did I avoid committing any real credential or personal datum?
2. [ ] Did I add or update a regression test, and prove it fails without the fix?
3. [ ] Do `pytest`, `typecheck`, `lint` and `format:check` all pass?
4. [ ] If a migration is involved, is it still correct for an install that already holds
       data — not only for a fresh one?
5. [ ] If this touches `main`, does the owner know a deployment may ship it?
6. [ ] Did I state clearly what I could not verify?
