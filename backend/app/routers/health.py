"""Health endpoints.

Two distinct questions, deliberately answered by two endpoints:

- `/health` — liveness. Is this process up and serving? No dependency is
  touched, so a monitoring system can tell "the app is dead" apart from
  "the app is fine but its database is not".
- `/health/ready` — readiness. Can this installation actually deliver an OTP?
  Touches PocketBase and reports provider configuration state.

Neither ever returns a secret: the provider check reports which variables are
missing, never their values.
"""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..core.config import get_settings
from ..core.errors import UpstreamUnavailable, error_responses
from ..providers import build_whatsapp_provider
from ..services.pocketbase import wotp_collection
from ..services.settings import get_app_settings

router = APIRouter(tags=["meta"])


@router.get("/health")
async def health():
    """Liveness: this process is running. Never touches a dependency."""
    return {"ok": True, "status": "alive"}


@router.get("/health/ready", responses=error_responses(UpstreamUnavailable))
async def ready(request: Request):
    """Readiness: PocketBase reachable + WhatsApp provider configured.

    503 when the control plane is unreachable, because an installation that
    cannot read its own data cannot serve an OTP request.
    """
    try:
        await request.app.state.pb.list(wotp_collection("settings"), per_page=1)
    except Exception:
        # Uptime monitors alert on the status code — a dead PocketBase must
        # never look healthy.
        return JSONResponse(
            status_code=503, content={"ok": False, "error": "upstream_unavailable"}
        )

    env = get_settings()
    cfg = await get_app_settings(request.app.state.pb)

    try:
        provider_status = await build_whatsapp_provider(cfg).verify_configuration(
            request.app.state.http
        )
        whatsapp = {
            "configured": provider_status.configured,
            "detail": provider_status.detail,
            "missing": provider_status.missing,
        }
    except ValueError as exc:
        # Unknown WHATSAPP_PROVIDER: report it rather than 500, so the operator
        # sees the misconfiguration in the check they already run.
        whatsapp = {"configured": False, "detail": str(exc), "missing": []}

    telegram_configured = bool(cfg.get("tg_bot_token"))

    return {
        "ok": True,
        "status": "ready",
        "pocketbase": True,
        "whatsapp": whatsapp,
        "telegram": {
            "configured": telegram_configured,
            "detail": (
                "bot token set"
                if telegram_configured
                else "no bot token configured — Telegram channel unavailable"
            ),
        },
        "webhook": {
            # Read from the MERGED config, not env: both of these can be set in
            # the PocketBase settings row, and reporting the env value while the
            # app used the row value (or the reverse) would make this endpoint
            # lie about the state it exists to report.
            "verify_token_configured": bool(cfg.get("meta_verify_token")),
            "signature_check_enabled": bool(cfg.get("meta_app_secret")),
        },
        "mock_delivery": env.wotp_mock_delivery,
    }


@router.get("/v1/health", deprecated=True, responses=error_responses(UpstreamUnavailable))
async def legacy_health(request: Request):
    """Deprecated alias for /health/ready, kept for existing uptime monitors.

    Note this is NOT an alias for /health: the original /v1/health checked
    PocketBase and 503'd when it was down, and monitors written against that
    behaviour must keep seeing it. Use /health for a dependency-free liveness
    probe.
    """
    try:
        await request.app.state.pb.list(wotp_collection("settings"), per_page=1)
    except Exception:
        return JSONResponse(
            status_code=503, content={"ok": False, "error": "upstream_unavailable"}
        )
    return {
        "ok": True,
        "pb": True,
        "mock_delivery": get_settings().wotp_mock_delivery,
    }
