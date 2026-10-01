# Deploying WOTP on Dokploy

This is the production walkthrough for [Dokploy](https://dokploy.com): a VPS
running Dokploy, three containers, three domains, and your own Meta and/or
Telegram credentials. Nothing here contacts the project's authors, and there is
no hosted service to sign up for.

**Budget about an hour**, most of it waiting on DNS and on Meta's template
approval. The parts you can do in five minutes are the deploy itself.

If you would rather run it by hand on a plain server, use
[`docker-compose.yml`](../docker-compose.yml) and follow
[self-hosting.md](./self-hosting.md) instead. This document is only the Dolpoy
path.

---

## Why Compose and not "Application"

WOTP is **three services**, not one:

| Service | What it is | Needs a domain? |
|---|---|---|
| `web` | Next.js dashboard + public landing page | **Yes** |
| `api` | FastAPI OTP gateway — the thing your app calls | **Yes** |
| `pocketbase` | Database, auth, operator back office | **Yes** |

PocketBase needs a public domain because the **dashboard talks to it directly
from the browser** to sign operators in (`frontend/src/lib/pb.ts`). It is not
merely an internal service, which is the most common surprise on a first deploy.

The repository root `Dockerfile` exists for platforms that insist on one, but it
builds only the API. Deploying it alone gives you an API with no dashboard and no
database. **Use the Compose type in Dokploy.**

---

## 1. Before you start

You need:

- A server with Dokploy installed and its Traefik running
- **Three DNS records**, all pointing at that server:

  ```
  otp.example.com        A   <your server ip>
  api.otp.example.com    A   <your server ip>
  pb.otp.example.com     A   <your server ip>
  ```

  Use your own domain. A single hostname with path prefixes does not work here —
  the API and PocketBase both need their own origin.

- A repository **fork** if you intend to change anything. Deploying straight from
  upstream works too, but then you cannot commit your own changes.
- Meta and/or Telegram credentials. Both are optional; you need at least one
  channel. Telegram needs no business verification and no card, so it is the
  faster one to test with.

---

## 2. Create the Compose project

In Dokploy:

1. **Create Project** → name it (`wotp`).
2. **Create Service** → **Compose**.
3. Source: **Git**. Point it at your repository and branch `main`.
4. **Compose Path**: `docker-compose.dokploy.yml`
   *Not* `docker-compose.yml` — that one publishes ports on loopback and is meant
   for a server that manages its own reverse proxy.
5. Leave the auto-generated `.env` alone for now.

Do not deploy yet. The environment comes first — deploying with an empty one
fails on purpose, and the error messages are less useful than doing it in order.

---

## 3. Set the environment

Generate the secrets. On any machine with Python 3:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"                                # SECRET_KEY
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"   # WOTP_FERNET_KEY
python3 -c "import secrets; print(secrets.token_urlsafe(18))"                                # PB_SUPERUSER_PASSWORD
```

> `WOTP_FERNET_KEY` **must** be a valid Fernet key (44 URL-safe base64
> characters), so generate it with the second command rather than inventing one.
> If you lose it after a Meta token has been stored, that token becomes
> undecryptable and you must re-enter it — nothing else in the database is
> affected.

Open [`.env.production.example`](../.env.production.example) and copy its
contents into **Dokploy → your Compose service → Environment**. It is written to
paste as-is, with a comment on every value.

Three things are worth stating plainly:

- **`APP_ENV=production` makes the API refuse to start** unless `SECRET_KEY`,
  `WOTP_FERNET_KEY` and `PB_SUPERUSER_PASSWORD` are set and mock delivery is off.
  A container that exits is far easier to diagnose than one that quietly runs
  with weakened security. Watch the service logs for the exact reason.
- **`META_APP_SECRET` becomes required** the moment you set any Meta credential.
  Without it, inbound delivery callbacks cannot be signature-verified, and anyone
  who learns your webhook URL could forge message statuses.
- **`TRUST_PROXY_HEADERS=1` is correct here** and `0` is correct in plain
  Compose. Dokploy terminates TLS at Traefik, which sets `X-Forwarded-For`. With
  it off, every request looks like it came from the proxy and the per-IP rate
  limiter collapses into one shared bucket.

Fill in `APP_URL`, `DASHBOARD_ORIGIN` and the three `NEXT_PUBLIC_*` values last,
after you have the domains from the next step.

---

## 4. Attach the domains

Still in the Compose service, add three domains. Each maps a hostname to **one
service and its internal port**:

| Domain | Service | Port |
|---|---|---|
| `otp.example.com` | `web` | `3000` |
| `api.otp.example.com` | `api` | `8000` |
| `pb.otp.example.com` | `pocketbase` | `8090` |

Enable HTTPS on all three and let Dokploy issue the certificates.

Then go back to the environment and set:

```
APP_URL=https://api.otp.example.com
DASHBOARD_ORIGIN=https://otp.example.com
NEXT_PUBLIC_APP_URL=https://otp.example.com
NEXT_PUBLIC_API_URL=https://api.otp.example.com
NEXT_PUBLIC_PB_URL=https://pb.otp.example.com
```

> **These five must match the domains exactly**, including `https://` and with no
> trailing slash. `DASHBOARD_ORIGIN` mismatched is the single most common
> first-deploy problem: CORS rejects every dashboard request, which looks like a
> dead backend rather than a typo.

---

## 5. Deploy

Press **Deploy**. The first build takes several minutes — it compiles Next.js and
downloads PocketBase.

Watch for these, in order:

1. **`pocketbase`** becomes healthy. On a fresh volume it creates the superuser
   from `PB_SUPERUSER_EMAIL` / `PB_SUPERUSER_PASSWORD` and applies every migration
   in `backend/pocketbase/pb_migrations/`, which is where all the collections come
   from. You do not run them by hand.
2. **`api`** starts. If the configuration is incomplete it exits immediately with
   a list of exactly which variables are missing.
3. **`web`** starts last.

> The `NEXT_PUBLIC_*` values are **build arguments**. They are compiled into the
> browser bundle, so changing one requires a **rebuild**, not a restart.
> `Restart` in Dokploy will not pick them up, and the dashboard will keep calling
> the old URLs.

---

## 6. Verify before going further

From your own machine:

```bash
curl -s https://api.otp.example.com/health        # {"status":"ok"} — process is up
curl -s https://api.otp.example.com/health/ready  # can it actually deliver?
```

`/health` touches no dependency, so it cannot flap because PocketBase is busy.
`/health/ready` is the meaningful one: it reports provider state **by variable
name, never by value**, so it is safe to read and will tell you precisely what is
still unconfigured.

If `/health` fails, the API did not start — read the container logs, they carry
the reason. If `/health` passes and `/health/ready` reports problems, the API is
running and something upstream is unconfigured.

Then confirm the frontend found the right backends:

```bash
curl -s https://otp.example.com/sitemap.xml | head -5
```

Every URL must show `otp.example.com`. If they say `localhost:3000`, the build
was made without `NEXT_PUBLIC_APP_URL` and you need to set it and rebuild.

---

## 7. Create your operator account

There is no signup page and there never will be: public registration is closed at
the database level, because the first person to find the URL would otherwise
become an operator of your gateway.

Create your account from inside the running API container:

```bash
docker compose exec api python scripts/create_admin.py you@example.com 'a-strong-password'
```

In Dokploy, open the **Terminal** on the `api` service and run the command
without the `docker compose exec api` prefix:

```bash
python scripts/create_admin.py you@example.com 'a-strong-password'
```

Then sign in at `https://otp.example.com` and create an API key. **That key is
shown once.** Only its SHA-256 hash is stored, so a lost key is replaced, never
recovered.

---

## 8. Connect WhatsApp (optional)

Skip this entirely if you are starting with Telegram.

1. In the dashboard, open **Settings** and enter your Meta phone number ID,
   WABA ID and system-user access token. They are Fernet-encrypted at rest with
   `WOTP_FERNET_KEY` and can be rotated from here without a redeploy.
2. In the Meta app, set the callback URL to:

   ```
   https://api.otp.example.com/webhooks/whatsapp
   ```

   and the verify token to whatever you put in `META_VERIFY_TOKEN`.
3. Subscribe to the **`messages`** field. Without it you get no delivery
   receipts, and message statuses stay at `sent` forever.
4. Approve an authentication template in WhatsApp Manager and put its name in
   `META_TEMPLATE`, with the matching `META_TEMPLATE_LANG`.

Meta's setup screens change often, so [meta-setup.md](./meta-setup.md) walks
through it in more detail than this list can.

---

## 9. Connect Telegram (optional)

Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` in the Dokploy environment,
then register the webhook from inside the `api` container:

```bash
python scripts/set_telegram_webhook.py https://api.otp.example.com
```

It reads `TELEGRAM_WEBHOOK_SECRET` and registers it with Telegram, which echoes
it on every call so the endpoint can reject strangers.

---

## 10. Back up, then leave it alone

Everything that matters is in one Docker volume:

```
wotp_pb_data
```

Back it up **before** any upgrade. Dokploy preserves named volumes, but a
mistyped project deletion does not come back.

```bash
# on the server
docker run --rm \
  -v wotp_pb_data:/data \
  -v "$(pwd)":/backup \
  alpine tar czf /backup/wotp-$(date +%F).tar.gz -C /data .
```

Confirm the volume's real name with `docker volume ls | grep pb_data` — Dokploy
may prefix it with the project name.

Retention is not automatic. Expired codes and audit rows accumulate until you
schedule the cleanup script, which deliberately refuses to prune the current
month because those rows are what the monthly cap counts:

```bash
python scripts/cleanup.py --dry-run   # see what it would remove
python scripts/cleanup.py
```

---

## Upgrading

1. Back up `pb_data` (above).
2. Pull the new commit into your fork and let Dokploy rebuild.
3. Watch the `pocketbase` logs — new migrations apply on its next start.

If a deploy fails, the previous containers keep serving. Nothing is destructive
until a container actually starts.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `api` exits immediately, logs list variable names | The production pre-flight check. Each missing name is listed. |
| Dashboard loads but every request fails | `DASHBOARD_ORIGIN` does not exactly match the web domain. |
| Dashboard loads, sign-in spins forever | `NEXT_PUBLIC_PB_URL` is unset or wrong — the browser cannot reach PocketBase. Almost always a *build-time* problem; rebuild. |
| Sitemap and canonical URLs say `localhost` | `NEXT_PUBLIC_APP_URL` was missing at build time. Set it and rebuild. |
| `pocketbase` exits: `PB_SUPERUSER_EMAIL ... not set` | Its own environment needs both superuser values, not just the API's. The provided compose file passes them. |
| 429s far sooner than the per-IP limit | `TRUST_PROXY_HEADERS=0`. Should be `1` behind Dokploy. |
| Webhook returns 403 | `TELEGRAM_WEBHOOK_SECRET` differs between the container and what is registered with Telegram. Re-run the setup script. |
| Meta webhook verification fails | `META_VERIFY_TOKEN` differs between the container and the Meta app. |

---

## What this deployment is not

- **Not multi-tenant.** One install serves one operator. Every API key belongs to
  that operator.
- **Not horizontally scalable as configured.** The API runs a single uvicorn
  worker because the send/verify locks and the idempotency store are
  process-global. Two workers means two lock sets, and a retried send can deliver
  twice. Scaling out requires moving that state to a shared store first.
- **Not reselling anything.** You send on your own Meta account and pay Meta
  directly. This project never sees your traffic and has no way to bill you.
