# WA OTP — Frontend

Dashboard + public site for **WA OTP**, a WhatsApp/Telegram OTP gateway for Indian
mini-app developers. Developers sign up, create an API key, and send OTPs from their
backend (500 free WhatsApp OTPs/month; Telegram is unlimited and free). The dashboard
covers account, API keys, usage and an OTP tester.

## Stack

- Next.js 16 (App Router, Turbopack) · React 19 · TypeScript strict
- Tailwind CSS v4 · shadcn/ui on Base UI · kbar (⌘K)
- TanStack Query + TanStack Form + Zod · nuqs · Zustand
- PocketBase JS SDK (auth against the `waotp_users` collection)
- oxlint + oxfmt · Bun

## Setup

```bash
bun install
cp .env.local.example .env.local
bun dev          # http://localhost:3000
```

Other scripts: `bun run build`, `bun run typecheck`, `bun run lint`, `bun run format`,
`bun run lint:strict`.

> [!IMPORTANT]
> **CORS (operator note):** the FastAPI backend must set `DASHBOARD_ORIGIN` to this
> dashboard's origin — `http://localhost:3000` in dev, your Vercel URL in production —
> or every browser call from this app will be blocked by CORS.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_PB_URL` | `http://localhost:8090` | Self-hosted PocketBase (auth collection **`waotp_users`** — never `users`, that belongs to another app on a shared instance) |
| `NEXT_PUBLIC_PB_COLLECTIONS_PREFIX` | `waotp_` | Collection namespace. **Must match `WAOTP_PB_COLLECTIONS_PREFIX` on the backend** — this prefix is what keeps the two projects on a shared instance apart |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | FastAPI backend base URL |
| `NEXT_PUBLIC_APP_URL` | – | Canonical origin, used as the PocketBase password-reset return address |
| `NEXT_PUBLIC_GITHUB_REPO` | – | `owner/repo`. When set, the landing nav shows the live star count; when unset, every GitHub surface renders nothing |
| `NEXT_PUBLIC_SENTRY_*` / `NEXT_PUBLIC_SENTRY_DISABLED` | – | Sentry is wired but inert without these (set `NEXT_PUBLIC_SENTRY_DISABLED=true` to force off) |

All of these are inlined at build time, so changing one needs a rebuild rather than a
restart. No secrets are needed client-side; every value above is public.

## Pages

| Route | Auth | What it does |
|---|---|---|
| `/` | public | Landing: hero, how-it-works, architecture, self-hosting guides, CTAs |
| `/docs` | public | Integrator API reference (rendered from `content/docs.md`, copied from `backend/docs/api.md`) with sticky TOC |
| `/login` | public | Email/password (`authWithPassword`) + "Continue with Google" |
| `/signup` | public | Account creation (PocketBase record create, public signup enabled) |
| `/forgot-password` | public | `requestPasswordReset` |
| `/reset-password?token=…` | public | `confirmPasswordReset` with the emailed token |
| `/dashboard` | guarded | Usage card (`GET /v1/usage`), quick start with copyable curls, recent keys |
| `/dashboard/keys` | guarded | Key table, new-key dialog with **one-time plaintext reveal**, deactivate + regenerate-all |
| `/dashboard/tester` | guarded | Send/verify a real OTP on your own phone (`X-Api-Key` header); shows raw JSON responses |
| `/dashboard/settings` | guarded | Name update, password change, theme, sign out |

## Auth flow

- **PocketBase** is the only identity provider. `src/lib/pb.ts` holds a typed singleton
  (`pb.collection('waotp_users')`) with the SDK auth store persisted to localStorage.
- Pages: `/login`, `/signup`, `/forgot-password`, `/reset-password` under the `(auth)`
  route group; each bounces already-signed-in users to `/dashboard`.
- **Google OAuth2**: `pb.collection('waotp_users').authWithOAuth2({ provider: 'google' })`.
  The provider is *not yet configured* on the PocketBase server — failures show a
  readable toast and never block email/password auth. Nothing else depends on it.
- **Route protection is client-side** (see `src/components/guards/auth-guard.tsx`):
  the PocketBase token lives in localStorage, so server middleware can't see it.
  Unauthenticated visits to `/dashboard/*` render a spinner and redirect to
  `/login?next=…`; this is a v1 limitation, not real security — the API enforces auth
  itself on every request.
- **API client** (`src/lib/api.ts`): every dashboard call sends
  `Authorization: Bearer <pb.authStore.token>`. On `401 invalid_user_token` it tries
  `authRefresh()` once and retries; if that fails it clears the store and redirects to
  `/login`. OTP send/verify instead authenticate with the **`X-Api-Key` plaintext key**
  header, exactly as integrators would call them.
- **Plaintext keys** are shown exactly once at creation (unmissable amber reveal card).
  The only other place they exist is an optional sessionStorage handoff
  (`waotp:last-plaintext-key`) so the tester page can prefill the key for the rest of
  the session. Nothing is persisted server-side or in localStorage.

## Error handling

Every backend error body is `{"ok": false, "error": "<code>", ...}`. The client
normalises these into `ApiError { status, code, extra }` and maps codes to readable
messages (`quota_exceeded`, `key_limit_reached`, `phone_throttled`, `delivery_failed`
with its `retryable` flag, `user_not_linked`, …). Pages degrade gracefully when the
backend is offline — you get an "API unreachable" state with a retry button, not a
crash.
