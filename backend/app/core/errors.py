"""Typed error semantics per PRD §6:
400 bad input · 401 bad key/token · 403 key disabled · 404 key not found ·
409 not-linked/key-limit · 429 throttle/rate-limit/quota · 502 delivery failed ·
503 not-configured/upstream-unavailable · 500 internal error.
Every error body: {"ok": false, "error": "<code>", ...extras}
"""

import logging

import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from ..services.pocketbase import PocketBaseError

logger = logging.getLogger("waotp")


class ApiError(Exception):
    status_code = 400
    code = "error"

    def __init__(self, *, headers: dict | None = None, **extra):
        self.extra = extra
        self.headers = headers  # e.g. {"Retry-After": "60"}
        super().__init__(self.code)

    def body(self) -> dict:
        return {"ok": False, "error": self.code, **self.extra}


class InvalidRequest(ApiError):
    status_code, code = 400, "invalid_request"


class InvalidApiKey(ApiError):
    status_code, code = 401, "invalid_api_key"


class InvalidUserToken(ApiError):
    status_code, code = 401, "invalid_user_token"


class KeyDisabled(ApiError):
    status_code, code = 403, "key_disabled"


class KeyNotFound(ApiError):
    status_code, code = 404, "key_not_found"


class NotLinked(ApiError):
    status_code, code = 409, "user_not_linked"


class KeyLimitReached(ApiError):
    status_code, code = 409, "key_limit_reached"


class RateLimited(ApiError):
    status_code, code = 429, "rate_limited"

    def __init__(self, **extra):
        super().__init__(headers={"Retry-After": "60"}, **extra)


class QuotaExceeded(ApiError):
    status_code, code = 429, "quota_exceeded"


class PhoneThrottled(ApiError):
    status_code, code = 429, "phone_throttled"

    def __init__(self, **extra):
        super().__init__(headers={"Retry-After": "3600"}, **extra)


class DeliveryFailed(ApiError):
    status_code, code = 502, "delivery_failed"

    def __init__(self, *, retryable: bool = False, **extra):
        # True only when the provider failure looks transient (timeout /
        # unreachable); HTTP rejections and ledger failures are not retryable.
        self.retryable = retryable
        super().__init__(**extra)

    def body(self) -> dict:
        return {"ok": False, "error": self.code, "retryable": self.retryable, **self.extra}


class NotConfigured(ApiError):
    status_code, code = 503, "not_configured"


class UpstreamUnavailable(ApiError):
    status_code, code = 503, "upstream_unavailable"


def _resp(status_code: int, payload: dict, headers: dict | None = None) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=payload, headers=headers)


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error_handler(request: Request, exc: ApiError):
        return _resp(exc.status_code, exc.body(), exc.headers)

    # PRD error contract says 400 for bad input; FastAPI's default is 422.
    # The detail is whitelisted to loc/msg/type: the raw pydantic error entries
    # carry non-JSON-serializable ctx objects (a 500 on malformed JSON) and
    # would echo raw input back to the caller.
    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError):
        detail = [
            {"loc": list(e.get("loc", ())), "msg": e.get("msg", ""), "type": e.get("type", "")}
            for e in exc.errors()[:5]
        ]
        return _resp(400, {"ok": False, "error": "invalid_request", "detail": detail})

    # PocketBase control-plane failure -> 503, clearly distinct from bad input.
    @app.exception_handler(PocketBaseError)
    async def pocketbase_error_handler(request: Request, exc: PocketBaseError):
        logger.exception("PocketBase error on %s %s", request.method, request.url.path)
        return _resp(503, {"ok": False, "error": "upstream_unavailable"})

    # PocketBase (or provider) network failure — unreachable/DNS/TLS/timeout.
    # Without this it falls through to the 500 handler, which mislabels an
    # infrastructure outage as an application bug.
    @app.exception_handler(httpx.HTTPError)
    async def transport_error_handler(request: Request, exc: httpx.HTTPError):
        logger.error("Network error on %s %s: %s", request.method, request.url.path, exc)
        return _resp(503, {"ok": False, "error": "upstream_unavailable"})

    # Last resort: never leak tracebacks or raw exception text to integrators.
    # (Starlette still re-raises after responding so servers log it.)
    @app.exception_handler(Exception)
    async def unhandled_error_handler(request: Request, exc: Exception):
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return _resp(500, {"ok": False, "error": "internal_error"})


# ---------------------------------------------------------------------------
# OpenAPI documentation of the error contract. Routes pass the result of
# error_responses(...) as their `responses=` argument so /docs (and generated
# clients) see the same catalog docs/api.md §7 documents by hand.
# ---------------------------------------------------------------------------

_ERROR_EXAMPLES: dict[str, dict] = {
    "invalid_request": {
        "ok": False, "error": "invalid_request",
        "detail": "to must be a valid phone number (E.164, e.g. 919876543210)",
    },
    "invalid_api_key": {"ok": False, "error": "invalid_api_key", "missing_header": True},
    "invalid_user_token": {"ok": False, "error": "invalid_user_token"},
    "key_disabled": {"ok": False, "error": "key_disabled"},
    "key_not_found": {"ok": False, "error": "key_not_found"},
    "user_not_linked": {
        # `your_bot` is a placeholder, not a real account: the link points at
        # whichever bot this installation is configured with
        # (TELEGRAM_BOT_USERNAME). There is no shared bot.
        "ok": False, "error": "user_not_linked",
        "link_url": "https://t.me/your_bot?start=<signed-token>",
    },
    "key_limit_reached": {"ok": False, "error": "key_limit_reached"},
    "rate_limited": {"ok": False, "error": "rate_limited", "retry_after_seconds": 60},
    "quota_exceeded": {
        "ok": False, "error": "quota_exceeded",
        "used": 500, "limit": 500, "reset_utc": "2026-10-01T00:00:00Z",
    },
    "phone_throttled": {"ok": False, "error": "phone_throttled", "retry_after_seconds": 3600},
    "delivery_failed": {
        "ok": False, "error": "delivery_failed", "channel": "whatsapp",
        "detail": "provider rejected the message", "retryable": False,
    },
    "not_configured": {
        "ok": False, "error": "not_configured", "detail": "WhatsApp is not configured yet",
    },
    "upstream_unavailable": {"ok": False, "error": "upstream_unavailable"},
}

_STATUS_DESCRIPTIONS = {
    400: "Bad request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not found",
    409: "Conflict",
    429: "Too many requests (see Retry-After header)",
    502: "Delivery failed",
    503: "Service unavailable",
}


def error_responses(*errors: type[ApiError]) -> dict:
    """Build an OpenAPI `responses=` fragment for a route from its error
    classes. Errors sharing a status code become named examples under it."""
    responses: dict[int, dict] = {}
    for cls in errors:
        entry = responses.setdefault(
            cls.status_code,
            {
                "description": _STATUS_DESCRIPTIONS.get(cls.status_code, "Error"),
                "content": {"application/json": {"examples": {}}},
            },
        )
        entry["content"]["application/json"]["examples"][cls.code] = {
            "value": _ERROR_EXAMPLES[cls.code]
        }
    return responses
