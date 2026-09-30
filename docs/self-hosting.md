# Self-hosting WA OTP

Docker Compose, TLS, backups, upgrades and the production configuration this
software expects. If you only read one section, read
[Exposing it safely](#exposing-it-safely) — it is the difference between a
private OTP gateway and a public one.

Prerequisites: a machine that stays on, Docker with the Compose plugin, and a
domain you control if you want HTTPS. No Postgres, no Redis, no object storage.

---

## The three services

| Service | What it is | Default bind |
|---|---|---|
| `pocketbase` | Data store and the operator back office (admin UI at `/_/`) | `127.0.0.1:8090` |
| `api` | The FastAPI hot path your apps call | `127.0.0.1:8000` |
| `web` | The Next.js dashboard and landing page | `127.0.0.1:3000` |

All three bind to **loopback by default**. Nothing is reachable from another
machine until you deliberately expose it.

## First run

```bash
git clone -b feat/self-host https://github.com/Luckyyaduvanshiiofficial/wa-otp.git wa-otp
cd wa-otp
cp .env.example .env
```

Open `.env` and set at minimum:

| Variable | Notes |
|---|---|
| `APP_ENV` | `production` for a real install. This turns on the fail-closed checks below. |
| `PB_SUPERUSER_EMAIL` / `PB_SUPERUSER_PASSWORD` | The PocketBase superuser. The entrypoint creates it on first boot. |
| `SECRET_KEY` | A long random string: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `WAOTP_FERNET_KEY` | Encrypts provider tokens at rest. See the command in the file's header. |
| `APP_URL` | The public HTTPS URL of your API. Your webhook URL is derived from it. |
| `DASHBOARD_ORIGIN` | The exact origin of your dashboard. No trailing slash. |
| `META_*` | Your Meta credentials, or leave blank for a Telegram-only install. |

Then:

```bash
docker compose up -d

# There is no public signup — create the operator account explicitly.
docker compose exec api python scripts/create_admin.py you@example.com
```

Sign in at `http://localhost:3000`, create an API key for your app, and follow
`/dashboard/onboarding`.

### `APP_ENV=production` refuses to boot

On purpose, and it will not warn-and-continue. It refuses when:

- `SECRET_KEY`, `WAOTP_FERNET_KEY` or `PB_SUPERUSER_PASSWORD` is missing
- `WAOTP_MOCK_DELIVERY` is on (that mode fakes delivery)
- WhatsApp credentials are set but `META_APP_SECRET` is empty

The last one is not pedantry. Without the app secret, inbound webhook calls
cannot be signature-checked, so anyone who learns your webhook URL can forge
delivery statuses. A silent downgrade is worse than no boot at all.

## Exposing it safely

Put a reverse proxy in front of the two services a browser needs, terminate TLS
there, and leave PocketBase unreachable from the internet. Caddy is the least
work because it obtains and renews certificates by itself.

```
# /etc/caddy/Caddyfile
otp.example.com {
    reverse_proxy 127.0.0.1:3000
}

api.example.com {
    reverse_proxy 127.0.0.1:8000
}
```

Two hostnames, because the API and the dashboard are different origins and the
API's CORS allowlist is a single exact origin (`DASHBOARD_ORIGIN`).

Then set, in `.env`:

```
APP_URL=https://api.example.com
DASHBOARD_ORIGIN=https://otp.example.com
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_PB_URL=https://pb.example.com     # only if you expose PocketBase
NEXT_PUBLIC_APP_URL=https://otp.example.com
TRUST_PROXY_HEADERS=1
```

`TRUST_PROXY_HEADERS=1` makes the per-IP rate limiter read the **right-most**
`X-Forwarded-For` entry — the one your proxy appends — and only if it parses as
an IP. Turn it on only when a proxy you control sits in front of the API; with
the API exposed directly, that header is client-supplied and the limit becomes
bypassable.

> [!NOTE]
> The dashboard reads `NEXT_PUBLIC_*` values at **build** time. Changing them
> needs `docker compose build web`, not just a restart.

### Should you expose PocketBase?

Only if you want the admin UI on a hostname. The dashboard does not need it to
be public — it needs it to be reachable **by your browser**, because the
PocketBase JS SDK talks to it directly to log you in.

Two workable answers:

1. **Expose it behind TLS on its own hostname** (`pb.example.com`), and accept
   that the admin UI login page is then internet-facing. Use a strong superuser
   password, and let PocketBase's own rate limiting do its job.
2. **Do not expose it at all**, and reach it over an SSH tunnel when you need
   the back office or the admin UI:

   ```bash
   ssh -L 8090:127.0.0.1:8090 you@your-server
   # then open http://localhost:8090/_/
   ```

Option 2 is strictly safer. The cost is that dashboard login also needs the
tunnel, since it authenticates against PocketBase from the browser.

## Backups

`pb_data/` is the whole system of record: API key hashes, the OTP audit log,
linked Telegram accounts, your settings and the encrypted provider tokens.
Losing it means losing every key and every audit row.

Two options, in increasing order of effort:

**Nightly copy.** Simple, and enough for a small install:

```bash
# /etc/cron.daily/waotp-backup
#!/bin/sh
set -eu
STAMP=$(date +%F)
docker run --rm \
  -v wa-otp_pb_data:/data:ro \
  -v /var/backups/waotp:/backup \
  alpine tar czf "/backup/pb_data-$STAMP.tgz" -C /data .
find /var/backups/waotp -name 'pb_data-*.tgz' -mtime +30 -delete
```

**Litestream** streams the SQLite WAL continuously to S3-compatible storage, so
you lose seconds rather than a day. It needs PocketBase's `--dir` to be the
replicated path.

Whichever you choose, **do a restore drill before you rely on it**. An untested
backup is a hypothesis. To verify:

```bash
docker compose down
docker run --rm -v wa-otp_pb_data:/data -v /var/backups/waotp:/backup \
  alpine sh -c 'rm -rf /data/* && tar xzf /backup/pb_data-YYYY-MM-DD.tgz -C /data'
docker compose up -d
curl -fsS http://127.0.0.1:8000/health/ready
```

Rotating `WAOTP_FERNET_KEY` makes previously stored provider tokens
undecryptable — back that key up with the data, or be ready to re-enter the
Meta token and the Telegram bot token afterwards.

## Upgrades

```bash
git pull
docker compose build
docker compose up -d
```

PocketBase applies any new migrations in `backend/pocketbase/pb_migrations/` on
start. They are written to be idempotent and guarded, but take a backup first
anyway — the migration that carries data forward cannot always carry it back.

PocketBase is pinned to **v0.40.x** on purpose: the JSVM migrations use the
v0.40 collection and field API. Do not float that version without updating the
migrations alongside it.

## Running without Docker

1. **PocketBase.** Download the v0.40.x binary for your platform, put it at
   `backend/pocketbase/pocketbase`, then:

   ```bash
   cd backend/pocketbase
   ./pocketbase superuser upsert you@local 'a-strong-password'
   ./pocketbase serve --http=127.0.0.1:8090
   ```

2. **API.**

   ```bash
   cd backend
   python3 -m venv .venv
   .venv/bin/pip install -r requirements.txt
   cp .env.example .env          # fill it in
   .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
   .venv/bin/python scripts/create_admin.py you@example.com
   ```

   `--workers 1` is a correctness requirement, not a tuning knob. The send and
   verify locks, the idempotency replay store, the rate limiters and the cached
   PocketBase token are all process-global. Two workers silently break
   idempotency, let two concurrent sends pass the same quota check, and halve
   every rate limit. See `backend/README.md` → Concurrency.

3. **Dashboard.**

   ```bash
   cd frontend
   bun install
   cp .env.local.example .env.local     # point it at your own services
   bun run build && bun start
   ```

### systemd units

```ini
# /etc/systemd/system/waotp-api.service
[Unit]
Description=WA OTP API
After=network.target waotp-pocketbase.service
Requires=waotp-pocketbase.service

[Service]
User=waotp
WorkingDirectory=/opt/wa-otp/backend
EnvironmentFile=/opt/wa-otp/backend/.env
ExecStart=/opt/wa-otp/backend/.venv/bin/uvicorn app.main:app \
  --host 127.0.0.1 --port 8000 --workers 1
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/waotp-pocketbase.service
[Unit]
Description=WA OTP PocketBase
After=network.target

[Service]
User=waotp
WorkingDirectory=/opt/wa-otp/backend/pocketbase
EnvironmentFile=/opt/wa-otp/backend/.env
ExecStart=/opt/wa-otp/backend/pocketbase/pocketbase serve --http=127.0.0.1:8090
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## Monitoring

| Endpoint | Question | Behaviour |
|---|---|---|
| `GET /health` | Is the process alive? | `200` always. Touches no dependency. |
| `GET /health/ready` | Can this install actually deliver an OTP? | `503` when PocketBase is unreachable. Reports provider config state. |

Point your uptime monitor at `/health` for liveness and alert on `/health/ready`
separately. `/health/ready` reports **which** variables are missing, by name,
never their values — including `mock_delivery`, because an install that fakes
delivery while believing it is live is the most dangerous state this software
can be in.

Two things worth alerting on beyond uptime:

- A failure-rate spike in the `messages` collection. It is the earliest signal of
  both a Meta policy problem and an abuse attempt.
- Quota-exhaustion responses (`429 quota_exceeded`). Either genuine growth or a
  runaway integration.

## Retention

The audit trail grows forever by default. `scripts/cleanup.py` prunes expired
OTP codes and old message rows, and is safe to run from cron:

```bash
docker compose exec api python scripts/cleanup.py --dry-run   # see what it would delete
docker compose exec api python scripts/cleanup.py
```

See the script's `--help` for the retention windows. Deleting audit rows is a
privacy choice as much as a storage one — decide how long you need delivery
history before you schedule it.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Every dashboard call fails, API looks dead | `DASHBOARD_ORIGIN` is missing or has a trailing slash/wrong host. It is a single-origin CORS allowlist. |
| `410`/404 on the Telegram webhook, bot silent | `TELEGRAM_WEBHOOK_SECRET` differs between the running service and the value registered with Telegram. Re-run `scripts/set_telegram_webhook.py`. |
| Meta never delivers status callbacks | `META_VERIFY_TOKEN` unset (the handshake cannot complete), or the URL does not match `{APP_URL}/webhooks/whatsapp`. |
| `/health/ready` says `signature_check_enabled: false` | `META_APP_SECRET` is unset. Fine locally, refused in production. |
| Dashboard login works but keys/usage 401 | The API cannot reach PocketBase, or `PB_URL` points at `127.0.0.1` from inside a container. In Compose it must be `http://pocketbase:8090`. |
