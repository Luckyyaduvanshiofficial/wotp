# WA OTP — FastAPI hot path (root-level for Dokploy / generic deployers).
#
# Dokploy and similar platforms expect a Dockerfile at the repository root.
# This file is a thin wrapper that sets the build context to the backend/
# directory so the real Dockerfile (backend/Dockerfile) is used.
#
# For Docker Compose, use `docker compose up -d` instead — it already knows
# where each Dockerfile lives.
#
# Build directly:
#   docker build -t waotp-api .

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (cache layer)
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/app ./app
COPY backend/scripts ./scripts

RUN useradd --create-home --uid 10001 waotp
USER waotp

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
