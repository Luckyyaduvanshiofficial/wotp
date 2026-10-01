# Deploying WOTP on Dokku

Dokku runs **one app per container**, so WOTP's three services become three Dokku
apps on three hostnames. This guide is for that setup.

If you use Compose on a plain server, read [self-hosting.md](./self-hosting.md).
If you use Dokploy, read [deploy-dokploy.md](./deploy-dokploy.md).

---

## The constraint that shapes everything: the build context is the repo root

Dokku always uses the **repository root** as the Docker build context. Its
`builder-dockerfile:set <app> dockerfile-path <path>` option changes where the
Dockerfile is *read from*, but **not** the context.

That is why this repository has two Dockerfiles per service:

| File | Context it expects | Used by |
|---|---|---|
| `Dockerfile` | repository root | Dokku, Dokploy, generic deployers — **the API** |
| `backend/Dockerfile` | `backend/` | Docker Compose |
| `Dockerfile.web` | repository root | Dokku, Dokploy — **the dashboard** |
| `frontend/Dockerfile` | `frontend/` | Docker Compose |
| `backend/pocketbase/Dockerfile` | `backend/pocketbase/` | Docker Compose |

A Dockerfile whose `COPY` paths assume a subdirectory context will fail on Dokku
with a plain "file not found" for the first `COPY`, which is a confusing way to
learn this. The root-context variants exist so you never hit it.

Each pair is the same image built two ways. If you change one, change the other.

---

## 1. The API

If you deployed by pushing the repository and letting Dokku find the root
`Dockerfile`, this is already done — that is the API image.

```bash
dokku apps:create wotp-api
docker remote add dokku dokku@your-server:wotp-api   # once
git push dokku main
```

Runtime configuration is ordinary Dokku config. These are the ones the
production pre-flight check requires — the API **will not start** without them:

```bash
dokku config:set wotp-api \
  APP_ENV=production \
  APP_URL=https://waotp-api.example.com \
  SECRET_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')" \
  WOTP_FERNET_KEY="$(python3 -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')" \
  PB_SUPERUSER_EMAIL=admin@example.com \
  PB_SUPERUSER_PASSWORD='a-strong-password' \
  PB_URL=https://waotp-pb.example.com \
  DASHBOARD_ORIGIN=https://waotp.example.com \
  WOTP_MOCK_DELIVERY=0 \
  TRUST_PROXY_HEADERS=1
```

`TRUST_PROXY_HEADERS=1` matters on Dokku: nginx terminates TLS and sets
`X-Forwarded-For`, and without it every request looks like it came from the proxy,
collapsing the per-IP rate limiter into one shared bucket.

Add the Meta and Telegram values the same way — see
[`.env.production.example`](../.env.production.example) for the full annotated
list. `META_APP_SECRET` becomes mandatory the moment any Meta credential is set.

---

## 2. PocketBase

PocketBase needs **its own hostname**, not just an internal one: the dashboard
authenticates against it directly from the browser. It also needs a **persistent
volume**, or every collection and API key dies on redeploy.

```bash
dokku apps:create wotp-pb
```

Because `backend/pocketbase/Dockerfile` expects its own directory as context, add
a root-context wrapper in your fork, or push that directory as its own app.

Storage — without this, data is lost on every deploy:

```bash
dokku storage:ensure-directory wotp-pb
dokku storage:mount wotp-pb /var/lib/dokku/data/storage/wotp-pb:/pb/pb_data
```

The superuser is created once, from the environment, on a fresh volume:

```bash
dokku config:set wotp-pb \
  PB_SUPERUSER_EMAIL=admin@example.com \
  PB_SUPERUSER_PASSWORD='a-strong-password'
```

> `PocketBase` refuses to start on an empty data directory without both of these,
> and ignores them afterwards — so changing them later does **not** change a
> superuser you edited in the admin UI.

---

## 3. The dashboard

```bash
dokku apps:create wotp-web
dokku builder-dockerfile:set wotp-web dockerfile-path Dockerfile.web
dokku domains:add wotp-web waotp.example.com
```

### Build arguments are not optional here

`NEXT_PUBLIC_*` values are compiled into the browser bundle, so they must be
present **at build time** — a restart will never pick up a change, and `config:set`
alone does nothing.

Dokku needs two commands per variable: a config value, and a build option that
tells the builder to pass it through.

```bash
dokku config:set wotp-web \
  NEXT_PUBLIC_APP_URL=https://waotp.example.com \
  NEXT_PUBLIC_API_URL=https://waotp-api.example.com \
  NEXT_PUBLIC_PB_URL=https://waotp-pb.example.com \
  NEXT_PUBLIC_PB_COLLECTIONS_PREFIX=waotp_ \
  NEXT_PUBLIC_GITHUB_REPO=Luckyyaduvanshiofficial/wotp

for key in NEXT_PUBLIC_APP_URL NEXT_PUBLIC_API_URL NEXT_PUBLIC_PB_URL \
           NEXT_PUBLIC_PB_COLLECTIONS_PREFIX NEXT_PUBLIC_GITHUB_REPO; do
  dokku docker-options:add wotp-web build "--build-arg $key"
done
```

Then deploy:

```bash
git push dokku main
```

**A missing value fails the build rather than shipping a broken bundle.**
`next.config.ts` refuses to build in production without `NEXT_PUBLIC_APP_URL`, and
`lib/pb.ts` refuses without `NEXT_PUBLIC_PB_URL`. That is deliberate: a dashboard
whose canonical URLs say `localhost`, or which cannot reach its own database, is
worse than a red build.

After changing any `NEXT_PUBLIC_*` value you must **rebuild**, not restart:

```bash
dokku ps:rebuild wotp-web
```

---

## Why three hostnames

They are not strictly required — API and dashboard could share one hostname under
path prefixes — but PocketBase effectively needs its own:

- **PocketBase serves absolute paths** (`/api/collections/...`, `/_/` for the
  admin UI) and is not designed to be mounted under a path prefix. Putting it
  behind `/pb/` means rewriting responses, which fights the software.
- **One app per hostname is Dokku's native model.** `dokku domains:add` gives each
  app its own vhost with no path routing at all.
- **CORS and cookies stay simple** when each origin is unambiguous, and the
  PocketBase admin UI can be locked down without touching the dashboard.

So: three hostnames, because that is what the tools and the software both expect.

---

## Verify

```bash
curl -s https://waotp-api.example.com/health        # process is up
curl -s https://waotp-api.example.com/health/ready  # can it actually deliver?
curl -s https://waotp.example.com/sitemap.xml | head -3
```

`/health/ready` reports state **by variable name, never by value**, so it is safe
to read and names exactly what is still unconfigured.

If the sitemap prints `localhost:3000`, the dashboard was built without
`NEXT_PUBLIC_APP_URL` — set it and rebuild.

---

## First run

There is no signup, and there never will be: the first person to find the URL
would otherwise become an operator of your gateway.

```bash
dokku enter wotp-api web
python scripts/create_admin.py you@example.com 'a-strong-password'
```

Sign in, create an API key (**shown once** — only its hash is stored), then:

- **Meta**: callback URL is `https://waotp-api.example.com/webhooks/whatsapp`
  with your `META_VERIFY_TOKEN`, and subscribe to the `messages` field or
  statuses stay at `sent` forever.
- **Telegram**: `python scripts/set_telegram_webhook.py https://waotp-api.example.com`

See [meta-setup.md](./meta-setup.md) for the Meta screens.
