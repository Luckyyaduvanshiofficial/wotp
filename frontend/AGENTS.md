# AGENTS.md

Working notes for AI agents and humans in `frontend/` — the WOTP dashboard and public
site. Read [`CLAUDE.md`](./CLAUDE.md) first for the short version; this file goes deeper on
structure and conventions.

**`../PRD.md` is the canonical product spec.** `../CLAUDE.md` covers the backend. When
something here disagrees with those, they win.

## What this app is

WOTP is a WhatsApp/Telegram OTP gateway for Indian mini-app developers. This frontend is
two things in one Next.js app:

- a **public site** — landing page and the integrator API reference at `/docs`
- a **developer dashboard** — usage, API keys, an OTP tester, and account settings

It is not the OTP delivery path. Developers call the FastAPI backend directly from their own
servers. Nothing in this app sends an OTP on a user's behalf outside the tester page.

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) · React 19 · TypeScript 5.7 strict |
| Styling | Tailwind CSS v4 · shadcn/ui on Base UI (`@base-ui/react`) |
| Data | TanStack Query 5 · TanStack Form 1.28 · Zod 4 |
| State / URL | Zustand · nuqs |
| Backend | PocketBase JS SDK 0.26 (identity) · FastAPI over `fetch` (everything else) |
| UI extras | kbar (⌘K), recharts, sonner, next-themes, react-markdown |
| Tooling | Bun · oxlint · oxfmt · husky + lint-staged |

## Two backends — they are not interchangeable

```
Browser ──▶ PocketBase   (login, signup, password reset, session)
        └─▶ FastAPI      (API keys, usage, OTP send/verify)
```

| | PocketBase | FastAPI |
|---|---|---|
| Reached via | `src/lib/pb.ts` | `src/lib/api.ts` |
| Env var | `NEXT_PUBLIC_PB_URL` | `NEXT_PUBLIC_API_URL` |
| Auth | PocketBase SDK session | `Authorization: Bearer <pb token>` |
| Collection | `waotp_users` | n/a |

Two rules that matter:

1. **PocketBase is only ever used for identity.** Never add a PocketBase read for OTP data,
   keys or usage — that all lives behind FastAPI, which owns the business logic. This is the
   whole point of the architecture; bypassing it means bypassing quota and throttling.
2. **`NEXT_PUBLIC_PB_COLLECTIONS_PREFIX` must match `WOTP_PB_COLLECTIONS_PREFIX` in
   `backend/.env`.** The shared PocketBase instance also hosts another project. The prefix is
   the isolation mechanism. An unset *or empty* value falls back to `waotp_` in
   `src/lib/pb.ts` rather than to no prefix, on purpose — an unprefixed build would address
   the stock `users` collection that belongs to the other project.

> [!IMPORTANT]
> The FastAPI backend must set `DASHBOARD_ORIGIN` to this app's origin, or every browser call
> fails CORS. It presents as a dead backend, not a configuration error — check this first.

## Layout

```
src/
├── app/                      # App Router
│   ├── (auth)/               # login, signup, forgot-password, reset-password
│   ├── dashboard/            # overview, keys, tester, settings (all behind AuthGuard)
│   ├── docs/                 # integrator API reference
│   ├── layout.tsx            # root: providers, fonts, metadata
│   └── global-error.tsx
├── components/
│   ├── ui/                   # vendored primitives (shadcn/ui). Treat as third-party.
│   │   └── table/            # the data-table suite
│   ├── forms/fields/         # form.AppField widgets — text, select, otp, slider, …
│   ├── layout/               # app-sidebar, header, page-container, providers
│   ├── guards/               # auth-guard, redirect-if-authed
│   ├── kbar/                 # ⌘K command palette
│   ├── themes/               # active-theme, theme.config, font.config, selectors
│   ├── docs/                 # markdown renderer for /docs
│   ├── icons.tsx             # the icon registry
│   ├── modal/alert-modal.tsx
│   └── nav-main.tsx · nav-user.tsx · breadcrumbs.tsx · copy-button.tsx · search-input.tsx
├── features/                 # one folder per domain, each with components/
│   ├── auth/                 # login/signup/reset forms + utils/pb-errors.ts
│   ├── dashboard/            # overview.tsx
│   ├── keys/                 # keys-view.tsx, key-reveal.tsx
│   ├── landing/              # marketing sections + site-nav
│   ├── otp-tester/           # tester-view.tsx
│   └── settings/             # settings-view.tsx
├── config/                   # nav-config.ts · data-table.ts · infoconfig.ts
├── hooks/                    # use-data-table, use-mobile, use-media-query, …
├── lib/                      # see below
├── styles/                   # globals.css · lumen.css · lumen-tokens.css · themes/
└── types/                    # nav + data-table types
```

### `src/lib/` — the ones you will actually touch

| File | What it holds |
|---|---|
| `api.ts` | **every** FastAPI call, its request/response types, `ApiError`, `ERROR_MESSAGES` |
| `pb.ts` | the PocketBase singleton, collection name resolution, `WotpUser`, `appOrigin()` |
| `query-client.ts` | the shared TanStack QueryClient |
| `form.ts` · `form-context.ts` | `useAppForm` (`createFormHook`) and field contexts |
| `key-handoff.ts` | sessionStorage handoff of a freshly created key |
| `parsers.ts` | nuqs parsers for URL state |
| `data-table.ts` | data-table helpers |
| `theme-transition.ts` | the view-transition theme swap |
| `compose-refs.ts` · `format.ts` · `utils.ts` | small utilities |

## Conventions that will get a PR rejected

- **All API calls live in `src/lib/api.ts`.** One typed function per endpoint. Never `fetch`
  the backend from a component, and never add a per-feature `api/` folder — this project
  deliberately keeps one flat client.
- **Query keys are short inline tuples** — `['keys']`, `['usage']`. Call `useQuery` /
  `useMutation` inline in the feature component and invalidate with
  `queryClient.invalidateQueries({ queryKey: ['keys'] })`. There is no server prefetch, no
  `useSuspenseQuery` and no `HydrationBoundary` in this app; the dashboard is client-rendered
  behind `AuthGuard`.
- **Forms use `useAppForm`** from `@/lib/form` with `form.AppField` rendering the widgets in
  `@/components/forms/fields`. Put a Zod schema on `validators.onSubmit`. Never call
  `useState` inside a render prop.
- **Icons come from `@/components/icons`.** Register a new icon in the registry rather than
  importing `@tabler/icons-react` in app or feature code. The vendored primitives under
  `src/components/ui/` are the one exception — leave them alone.
- **Page headers use `PageContainer`** (`pageTitle`, `pageDescription`, `pageHeaderAction`,
  `infoContent`). Do not import `<Heading>` by hand.
- **URL state uses nuqs** — parsers in `src/lib/parsers.ts`, consumed via
  `src/hooks/use-data-table.ts`.
- **Never import `components/` from `features/`.** Dependency direction is
  `app/ → features/ → components/`. A shared piece belongs in `components/`, not in a feature
  that another feature reaches into.
- **TypeScript strict.** No `any`, no non-null assertions to silence the compiler.
- **Formatting:** single quotes, JSX single quotes, no trailing comma, 2-space indent.
  `husky` + `lint-staged` run `oxfmt` on staged files.

### Auth and the API client

- Session lives in PocketBase's SDK store (localStorage). `AuthGuard` redirects
  unauthenticated `/dashboard/*` visits to `/login?next=…`. This is a **client-side
  guard, not security** — the backend authenticates every request itself.
- `apiFetch` in `src/lib/api.ts` attaches the bearer token, and on a `401
  invalid_user_token` it calls `authRefresh()` once and retries. If that fails it clears the
  store and redirects to `/login`.
- `sendOtp` and `verifyOtp` are the exceptions: they authenticate with the plaintext
  **`X-Api-Key`** header, exactly as an integrator would call them.
- **API keys are spending credentials.** Never log one, never put one in client code, never
  persist one. The plaintext exists exactly once at creation; `key-handoff.ts` stashes it in
  sessionStorage so the tester page can prefill it for that tab only.

### Errors

Every backend failure is `{"ok": false, "error": "<code>", ...}`. `src/lib/api.ts` normalises
these into `ApiError { status, code, extra }` and `errorMessage(e)` maps codes to readable
text. Codes worth knowing: `quota_exceeded`, `key_limit_reached`, `phone_throttled`,
`rate_limited`, `delivery_failed` (carries `retryable`), `user_not_linked` (carries
`link_url`), `invalid_user_token`, `api_unreachable`, `request_timeout`.

Treat `api_unreachable` as a normal state — pages show a retry affordance, not a crash. The
backend being down is not an exception.

## Commands

```bash
bun install
cp .env.local.example .env.local
bun dev              # http://localhost:3000
bun run build
bun run typecheck    # tsc --noEmit
bun run lint         # oxlint
bun run lint:strict  # oxlint --deny-warnings
bun run lint:fix     # oxlint --fix + format
bun run format       # oxfmt
```

There is **no frontend test suite** — there is no `test` script. Verification here means
`typecheck` + `lint` + a real browser click-through. Say so rather than implying coverage
you did not run.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_PB_URL` | yes | PocketBase origin |
| `NEXT_PUBLIC_PB_COLLECTIONS_PREFIX` | yes | must match the backend; defaults to `waotp_` |
| `NEXT_PUBLIC_API_URL` | yes | FastAPI base URL |
| `NEXT_PUBLIC_APP_URL` | no | canonical origin, used for password-reset return links |
| `NEXT_PUBLIC_GITHUB_REPO` | no | `owner/repo`; every GitHub surface renders nothing when unset |
| `NEXT_PUBLIC_SENTRY_*` | no | Sentry ships **inert** — nothing initialises it without a DSN |

`NEXT_PUBLIC_*` values are inlined at build time. Changing one requires a rebuild, not a
restart. See [`docs/deployment.md`](./docs/deployment.md).

## Deeper docs

- [`docs/forms.md`](./docs/forms.md) — the TanStack Form system and every field widget
- [`docs/themes.md`](./docs/themes.md) — OKLCH tokens, the theme picker, fonts
- [`docs/deployment.md`](./docs/deployment.md) — Vercel and Docker
- [`README.md`](./README.md) — routes, auth flow, error handling
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) · [`../SECURITY.md`](../SECURITY.md)
