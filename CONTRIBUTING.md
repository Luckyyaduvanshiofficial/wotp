# Contributing to WOTP

Thanks for being here. WOTP exists because phone verification was needlessly hard for people shipping small apps, and it stays useful only if it keeps being easy to run. Bug reports, docs fixes, and code are all welcome.

## Ways to contribute

| | Where |
|---|---|
| **Bug reports** | [Open an issue](https://github.com/Luckyyaduvanshiofficial/wotp/issues). Include what you ran, what you expected, and what happened. |
| **Feature ideas** | Open an issue first — see below. |
| **Documentation** | PRs welcome. Docs that lie are worse than no docs, so accuracy beats volume. |
| **Security issues** | **Never** the public tracker. See [`SECURITY.md`](SECURITY.md). |

## Before you start

**For anything non-trivial, open an issue first.** It is much cheaper to disagree about an approach in a paragraph than in a finished pull request.

**[`PRD.md`](PRD.md) is the canonical specification** — architecture, data model, API semantics, limits. It overrides opinions about how the project should be shaped, including mine and yours. If you think the PRD is wrong, that is a legitimate thing to argue, but argue it in an issue rather than in a diff.

## Development setup

### Backend

```bash
cd backend

python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
cp .env.example .env
```

Generate the Fernet key that encrypts provider secrets at rest, and put it in `.env`:

```bash
.venv/bin/python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

PocketBase needs to be running. It is **pinned to v0.40.x** — the JSVM migration uses the v0.40 collection and field API and declares explicit `autodate` fields, which indexes on `created`/`updated` depend on. Download the v0.40.x binary for your platform from [pocketbase/pocketbase/releases](https://github.com/pocketbase/pocketbase/releases) and put it at `backend/pocketbase/pocketbase` (it is gitignored — it is ~40 MB and platform-specific).

```bash
cd pocketbase
./pocketbase superuser upsert you@local devpass123
./pocketbase serve --http=127.0.0.1:8090   # admin UI: http://127.0.0.1:8090/_/
```

Then the API:

```bash
.venv/bin/uvicorn app.main:app --port 8000   # OpenAPI docs: http://127.0.0.1:8000/docs
.venv/bin/python scripts/seed_dev.py dev@wotp.local devpass123
```

> [!TIP]
> `WOTP_MOCK_DELIVERY=1` (the default in `.env.example`) fakes provider delivery while keeping every database row real. The full send → verify → quota → throttle → ledger flow runs with **no Meta or Telegram credentials**. You will almost never need real ones.

### Frontend

```bash
cd frontend

bun install
cp .env.local.example .env.local
bun dev   # http://localhost:3000
```

Set `DASHBOARD_ORIGIN` on the backend to the dashboard origin (`http://localhost:3000`). Without it, CORS blocks every browser call — and it presents as a broken backend rather than a config mistake.

## Conventions

### Frontend

[`frontend/CLAUDE.md`](frontend/CLAUDE.md) and [`frontend/AGENTS.md`](frontend/AGENTS.md) are authoritative for everything under `frontend/`. Read them before your first PR. The rules that most often cause a review round-trip:

- **Formatting** — single quotes, JSX single quotes, no trailing commas, 2-space indent. `bun run format` handles it; Husky runs `oxfmt` on staged files.
- **Icons** — import from `@/components/icons` only. Never from `@tabler/icons-react` directly. Add new icons to the registry first.
- **Page headers** — use `PageContainer` props (`pageTitle`, `pageDescription`, `pageHeaderAction`). Never import `<Heading>` by hand.
- **Forms** — `useAppForm` from `@/lib/form` with `form.AppField` and the shared field components. Drop to raw `form.Field` only for one-off custom controls, and never call `useState` inside a render prop.
- **Data layer** — every feature gets `api/types.ts` → `api/service.ts` → `api/queries.ts`. Components import from the service and query layers, never from mock data directly.
- **`cn()`** for all className merging, never string concatenation.

### Backend — things that will get a PR rejected

These come from [`CLAUDE.md`](CLAUDE.md)'s gotchas. They are not style preferences; each one is a bug we already paid for.

- **Keep `backend/scripts/provision_pb.py` idempotent.** Existing collections are never modified. Do not "fix" this by making it reconcile drift — people run it against live instances.
- **Every route must declare its errors** in the OpenAPI spec via `error_responses()` in `backend/app/core/errors.py`, and stay in sync with `backend/docs/api.md` §7. A new error code without both is an incomplete change.
- **Validation errors must never echo raw input.** Return the whitelisted `detail: [{loc, msg, type}]` shape.
- **PocketBase stays on v0.40.x** unless you also update the migration.
- **Do not add a second uvicorn worker** without rethinking concurrency. The per-owner `asyncio` lock around sends and the per-(owner, phone) lock around verifies are the only thing preventing concurrent quota double-spend and duplicate verification. They are process-local by design.
- **Limits belong in the `settings` row, not in code.** Env values are fallbacks. If you are adding a tunable, add it to settings.

## Tests

The backend suite runs with **no network** — PocketBase, Meta, and Telegram are all faked.

```bash
cd backend
.venv/bin/pytest -q                              # full suite
.venv/bin/pytest tests/test_quota.py -q          # one file
.venv/bin/pytest tests/test_quota.py::test_name -q   # one test
```

Run it before opening a PR. If you change quota, throttle, or verification behaviour, add a test — those paths are where silent breakage costs real money.

**The frontend has no test suite.** `frontend/package.json` has no `test` script. Do not claim coverage that does not exist; if you want to add Vitest or Playwright, that is a welcome contribution but it should be its own PR with the tooling set up properly.

Before pushing frontend changes:

```bash
cd frontend
bun run typecheck
bun run lint
bun run format:check
```

## Commits and pull requests

Keep it lightweight — this is a small project and a heavy process would only slow it down.

- **One concern per PR.** A bugfix mixed with a refactor is two PRs that got merged by accident.
- **Write commit messages that explain why**, not just what. The diff already shows what changed.
- **Describe how you tested it.** "Ran `pytest -q`" or "sent a real WhatsApp OTP to my own number" tells a reviewer far more than "should work".
- **Note any new error code** and confirm you updated both the OpenAPI declaration and `backend/docs/api.md` §7.

## Licensing of contributions

WOTP is licensed under **AGPL-3.0-or-later**. By submitting a contribution, you agree that it is licensed under the same terms.

There is **no CLA** and you do not need to sign anything.

The license choice is deliberate, so you know the ground rules before you invest time:

- **Unmodified self-hosting carries no obligation.** Anyone can run WOTP privately or commercially without publishing a thing. That is the point.
- **AGPL §13** applies only if someone modifies it *and* runs the modified version as a network service for others — then those users must be offered the modified source. That clause is what keeps a closed-source hosting business from being built out of this codebase and your contributions.

## Code of conduct

Participation is covered by [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
