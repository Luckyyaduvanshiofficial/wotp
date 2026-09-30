"""Request correlation.

A support conversation that starts with "my user didn't get a code" is only
answerable if a log line can be tied to the request that caused it. Every
response carries an `X-Request-Id`, and log lines emitted while handling a
request include the same value.

The inbound header is **validated, never trusted**. It is echoed into a response
header and written into log lines, so an attacker-supplied value containing
newlines could forge log entries, and one containing quotes could break an
entry's structure. Anything that is not a short, plain token is discarded and
replaced with a generated id — the caller still gets a usable id back, it just
is not the one they tried to choose.
"""

import contextvars
import re
import uuid

# Deliberately narrow: the ids this app generates are hex, and anything a
# well-behaved client sends (a UUID, a trace id) fits comfortably. No newlines,
# no quotes, no spaces, bounded length.
_SAFE_REQUEST_ID = re.compile(r"^[A-Za-z0-9_.:-]{1,64}$")

_request_id: contextvars.ContextVar[str] = contextvars.ContextVar(
    "request_id", default=""
)


def new_request_id() -> str:
    return uuid.uuid4().hex[:16]


def sanitize_request_id(candidate: str | None) -> str:
    """The caller's id when it is safe to reuse, otherwise a fresh one."""
    if candidate and _SAFE_REQUEST_ID.match(candidate):
        return candidate
    return new_request_id()


def get_request_id() -> str:
    """The current request's id, or '' outside a request (scripts, startup)."""
    return _request_id.get()


class RequestIdMiddleware:
    """Pure ASGI, so the header is attached even to responses produced by
    middleware and error handlers that sit outside the router."""

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = {k.decode("latin-1").lower(): v.decode("latin-1")
                   for k, v in (scope.get("headers") or [])}
        request_id = sanitize_request_id(headers.get("x-request-id"))

        scope.setdefault("state", {})["request_id"] = request_id
        token = _request_id.set(request_id)

        async def send_with_header(message):
            if message["type"] == "http.response.start":
                message.setdefault("headers", []).append(
                    (b"x-request-id", request_id.encode("latin-1"))
                )
            await send(message)

        try:
            await self.app(scope, receive, send_with_header)
        finally:
            _request_id.reset(token)
