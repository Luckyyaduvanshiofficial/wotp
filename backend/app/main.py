import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import get_settings
from .core.errors import register_error_handlers
from .core.tracing import RequestIdMiddleware
from .routers import health, keys, otp, telegram_webhook, whatsapp_webhook
from .services.pocketbase import PBClient

logger = logging.getLogger("waotp")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    # Read timeout must exceed remote-host auth latency (PB bcrypt can take
    # >15s on slow VPSes); the superuser token is cached for process lifetime,
    # so the slow path is paid once per startup.
    http = httpx.AsyncClient(
        timeout=httpx.Timeout(45.0, connect=10.0),
        headers={"User-Agent": "waotp-gateway/0.1"},
        follow_redirects=True,
    )
    app.state.http = http
    app.state.pb = PBClient(
        settings.pb_url,
        settings.pb_superuser_email,
        settings.pb_superuser_password,
        client=http,
    )
    if not settings.pb_superuser_email:
        logger.warning(
            "PB_SUPERUSER_EMAIL/PB_SUPERUSER_PASSWORD not set — "
            "PocketBase calls will fail until configured."
        )
    yield
    await http.aclose()
    app.state.pb = None


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description=(
            "Open-source, self-hosted WhatsApp/Telegram OTP gateway. You run this "
            "for your own apps, with your own WhatsApp Business account and your "
            "own database."
        ),
        lifespan=lifespan,
    )
    if settings.dashboard_origin:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=[settings.dashboard_origin],
            allow_credentials=False,
            allow_methods=["GET", "POST", "DELETE"],  # DELETE: /v1/keys/{id} retirement
            allow_headers=["Authorization", "X-Api-Key", "Content-Type"],
        )
    # Outermost of the app's own middleware: every response carries X-Request-Id,
    # including ones produced by error handlers.
    app.add_middleware(RequestIdMiddleware)
    register_error_handlers(app)

    @app.get("/", tags=["meta"])
    async def root():
        return {
            "ok": True,
            "name": settings.app_name,
            "version": "0.1.0",
            "docs": "/docs",
            "health": "/health",
            "ready": "/health/ready",
            "webhook": "/webhooks/whatsapp",
        }

    app.include_router(health.router)
    app.include_router(otp.router)
    app.include_router(keys.router)
    app.include_router(telegram_webhook.router)
    app.include_router(whatsapp_webhook.router)
    return app


app = create_app()
