# Deployment

This dashboard deploys anywhere Node runs. `next.config.ts` sets
`output: 'standalone'` when `BUILD_STANDALONE=true`, which is what the
Dockerfile expects.

> [!NOTE]
> This page is about running **this Next.js app on its own**. If you are
> installing the whole product — API + PocketBase + dashboard — you do not need
> any of it: use the `docker-compose.yml` at the repository root and read
> [`../../../docs/self-hosting.md`](../../../docs/self-hosting.md) instead. That
> is the supported path, and it is one command.

## What this app needs to reach

The dashboard is a client-rendered app, so **the browser** — not the server —
makes every call to the other two services. That has a consequence worth
internalising before you pick a host:

| Service | Must be reachable by | Configured by |
|---|---|---|
| PocketBase (auth) | the browser | `NEXT_PUBLIC_PB_URL` |
| FastAPI (keys, usage, tester) | the browser | `NEXT_PUBLIC_API_URL` |

If you split these across hosts, all three hostnames have to be publicly
reachable over HTTPS. A dashboard served from a public domain while
`NEXT_PUBLIC_PB_URL` points at `http://127.0.0.1:8090` will fail in every real
browser, because `127.0.0.1` is the *user's* machine.

## Before you deploy

Three things bite in production and none of them are obvious from a successful
build:

> [!IMPORTANT]
> **Set `DASHBOARD_ORIGIN` on the FastAPI backend to this app's origin.** Without
> it, CORS blocks every browser call the dashboard makes — and it presents as a
> dead backend, not a configuration mistake. This is the single most common
> deployment failure. The match is exact: scheme included, no trailing slash, no
> path. `https://app.example.com` and `https://app.example.com/` are different
> strings to CORS.

> [!IMPORTANT]
> **`NEXT_PUBLIC_*` variables are baked in at build time.** They are not read at
> runtime, so changing one requires a rebuild. Set them in the build environment,
> not after.

> [!WARNING]
> **`NEXT_PUBLIC_PB_COLLECTIONS_PREFIX` must match `WAOTP_PB_COLLECTIONS_PREFIX`
> on the backend.** Never leave it empty against a shared PocketBase instance —
> an unprefixed build addresses the stock `users` and `api_keys` collections,
> which belong to another project.

## Docker

`frontend/Dockerfile` is a three-stage build (deps → build → standalone runner)
that installs with Bun and runs the output on Node as a non-root user. It is the
image the root compose stack uses.

`NEXT_PUBLIC_*` values are build arguments. They cannot be supplied at run time,
because they no longer exist once the bundle is compiled.

```bash
docker build \
  --build-arg NEXT_PUBLIC_PB_URL=https://pb.example.com \
  --build-arg NEXT_PUBLIC_PB_COLLECTIONS_PREFIX=waotp_ \
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
  --build-arg NEXT_PUBLIC_APP_URL=https://app.example.com \
  -t wa-otp-dashboard ./frontend
```

```bash
docker run -d -p 3000:3000 \
  --restart unless-stopped \
  --name wa-otp-dashboard \
  wa-otp-dashboard
```

`NEXT_PUBLIC_SENTRY_DISABLED` defaults to `true` in the image, so a stock
container reports nothing anywhere — that is the no-telemetry default, and it is
set as both an `ARG` and an `ENV` so it actually reaches the build. Leave it
alone unless you are pointing the app at **your own** Sentry project.

There is no `BUILD_STANDALONE` to remember: the Dockerfile sets it.

## Vercel

Vercel can host the dashboard on its free tier; it cannot host the API or
PocketBase. If you use it, you still need both of those running somewhere
reachable — see [`../../../docs/self-hosting.md`](../../../docs/self-hosting.md).

This app lives at `frontend/` in a monorepo, which changes two things from
Vercel's default flow. Both are required — a default import of this repository
does not build.

1. **Import your fork** at [vercel.com/new](https://vercel.com/new).
2. **Set Root Directory to `frontend`** (Settings → General → Root Directory).
   There is no `package.json` at the repo root, so a project rooted there detects
   no framework and fails with *"No Next.js version detected"*. This is the
   monorepo step, and it is dashboard-only — no file in this repo can set it.
3. **Leave Framework Preset and the build commands alone.** Vercel finds
   `frontend/bun.lock` and uses Bun for install and build with no configuration.
4. **Add the environment variables below before the first deploy.** `NEXT_PUBLIC_*`
   values are baked into the bundle at build time, so adding one afterwards does
   nothing until you redeploy.
5. **Deploy.**

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_PB_URL` | `https://pb.your-domain` | your own PocketBase, publicly reachable |
| `NEXT_PUBLIC_PB_COLLECTIONS_PREFIX` | `waotp_` | must equal `WAOTP_PB_COLLECTIONS_PREFIX` |
| `NEXT_PUBLIC_API_URL` | `https://api.your-domain` | your own API, no trailing slash |
| `NEXT_PUBLIC_APP_URL` | `https://app.your-domain` | used as the PocketBase password-reset return address, so it must be the origin your operators actually reach |
| `NEXT_PUBLIC_GITHUB_REPO` | `owner/repo` | optional; unset hides the GitHub chrome rather than inventing a number |
| `NEXT_PUBLIC_SENTRY_DISABLED` | `true` | set this unless Sentry is genuinely configured for your own project |

No `vercel.json` is checked in, deliberately. Everything it could express is
either already auto-detected, or — in the case of Root Directory — not a
`vercel.json` field at all. A checked-in copy would only become a second source
of truth that silently disagrees with the dashboard.

### Preview deployments and CORS

`DASHBOARD_ORIGIN` is a single origin, but Vercel gives every branch and PR its
own hostname. Browser calls from a preview URL therefore fail CORS until
`DASHBOARD_ORIGIN` names that preview origin — which looks exactly like a dead
backend. Either test against the origin you have configured, or point
`DASHBOARD_ORIGIN` at the preview origin you are testing and set it back after.
`app.vercel.app` and `app-git-main.vercel.app` are different origins.

For other platforms, see the [Next.js deployment docs](https://nextjs.org/docs/app/getting-started/deploying).
