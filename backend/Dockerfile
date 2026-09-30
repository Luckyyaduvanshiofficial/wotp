# WA OTP — FastAPI hot path.
#
# Build from the repository root's compose file, or directly:
#   docker build -t waotp-api ./backend
#
# Configuration is entirely environment-driven, so this image is the same for
# every operator: no credentials, no hostnames and no author-owned defaults are
# baked in. See backend/.env.example for the full variable list.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# curl is not needed at runtime; it is here so the healthcheck below (and
# `docker compose exec api sh`) work without a second image layer.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

# Dependencies first: this layer only rebuilds when requirements.txt changes.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY scripts ./scripts

# Run as a non-root user with a fixed high UID.
#
# Note this is NOT uid 1000: if an operator bind-mounts a ./pb_data that their
# own user owns, the container will not be able to write to it as-is. The
# compose file uses named volumes for exactly that reason. A bind-mount needs
# `chown -R 10001:10001 ./pb_data` first.
RUN useradd --create-home --uid 10001 waotp
USER waotp

EXPOSE 8000

# Liveness only — /health touches no dependency, so this cannot flap because
# PocketBase is briefly busy. Readiness is checked by /health/ready, which is
# deliberately not used here: a container that restarts on a database blip is
# worse than one that keeps serving 503s until the operator fixes it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/health || exit 1

# SINGLE WORKER, and this is a correctness requirement rather than a tuning
# choice. The per-key and per-(owner, phone) asyncio locks, the idempotency
# replay store and the cached PocketBase superuser token are all process-global
# state in app/dependencies.py. Adding --workers here silently breaks
# idempotency and double-send protection: two workers would each hold their own
# locks and their own replay cache, so a retried request could deliver twice.
#
# To scale, change the code to move that state into a shared store first.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
