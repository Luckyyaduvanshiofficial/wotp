# CLAUDE.md — frontend

The WOTP dashboard and public site. Next.js 16 (App Router, Turbopack), React 19,
TypeScript strict, Tailwind v4, shadcn/ui on Base UI, TanStack Query + Form, PocketBase SDK.

**`../PRD.md` is the canonical spec** for the product, and **`../CLAUDE.md`** covers the
backend architecture. Read those before changing anything that talks to the API.

## Key references

- **[AGENTS.md](./AGENTS.md)** — project overview, structure, data fetching patterns, deployment
- **[docs/forms.md](./docs/forms.md)** — form system: TanStack Form + Zod, composable fields
- **[docs/themes.md](./docs/themes.md)** — theme system: OKLCH tokens, adding themes, fonts
- **[docs/deployment.md](./docs/deployment.md)** — Vercel and Docker deployment

## How this app is wired

Two backends, and they are not interchangeable:

| Talk to | For | Via |
|---|---|---|
| **PocketBase** | login, signup, password reset, session | PocketBase JS SDK, collection `waotp_users` |
| **FastAPI** | API keys, usage, the OTP tester | `src/lib/api.ts`, `NEXT_PUBLIC_API_URL` |

- **Auth stores nothing locally.** The PocketBase SDK keeps the session; `src/lib/pb.ts` is
  the single place the collection name is resolved. `NEXT_PUBLIC_PB_COLLECTIONS_PREFIX`
  must match `WOTP_PB_COLLECTIONS_PREFIX` on the backend — see `src/lib/pb.ts`.
- **PocketBase is only ever called for identity.** Every OTP operation goes through FastAPI
  with the PocketBase user token as a bearer. Do not add PocketBase reads for OTP data.
- **The backend must set `DASHBOARD_ORIGIN`** to this app's origin or every browser call
  fails CORS — and it presents as a dead backend, not a config error.
- **API keys are spending credentials.** Never put one in client code, and never route an
  OTP send through this app on a user's behalf.

## Commands

```bash
bun install
cp .env.local.example .env.local
bun dev              # http://localhost:3000
bun run typecheck    # tsc --noEmit
bun run lint         # oxlint
bun run lint:fix     # oxlint --fix + format
bun run format       # oxfmt
```

## Critical conventions

- **API layer** — every backend call lives in `src/lib/api.ts`: a typed request/response
  interface plus one small function per endpoint (`listKeys`, `createKey`, `sendOtp`, …).
  Never `fetch` the backend from a component. Add new endpoints there, not in a feature
  folder.
- **Data fetching** — plain client-side `useQuery` / `useMutation`, called inline in the
  feature component. Keys are short string tuples (`['keys']`, `['usage']`); invalidate
  with `queryClient.invalidateQueries({ queryKey: ['keys'] })`. There is no server
  prefetch and no suspense boundary — the dashboard is a client-rendered app behind
  `AuthGuard`.
- **Forms** — `useAppForm` from `@/lib/form` (TanStack `createFormHook`) with
  `form.AppField` rendering the components in `@/components/forms/fields`. Form-level Zod
  validators on `onSubmit`. Never call `useState` inside a render prop.
- **Icons** — app and feature code imports from `@/components/icons`. Never from
  `@tabler/icons-react` directly; register the icon in the registry first. The vendored
  primitives in `src/components/ui/` are the one exception — they import Tabler directly
  and should be left as they are.
- **Page headers** — use `PageContainer` props (`pageTitle`, `pageDescription`,
  `pageHeaderAction`). Never import `<Heading>` by hand.
- **URL state** — `nuqs`. Parsers live in `src/lib/parsers.ts` (`createParser` from
  `nuqs/server`) and are consumed through `src/hooks/use-data-table.ts`.
- **Formatting** — single quotes, JSX single quotes, no trailing comma, 2-space indent.
  Husky runs `oxfmt` on staged files.
