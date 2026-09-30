"""Meta WhatsApp Cloud API webhook.

This endpoint belongs to the self-hosted installation: the URL an operator
pastes into the Meta app dashboard is *their* `{APP_URL}/webhooks/whatsapp`,
derived from their own configuration. Nothing here is shared with, or proxied
through, anyone else's infrastructure.

Two responsibilities:

- `GET`  — Meta's subscription handshake. Echo `hub.challenge` only when
  `hub.verify_token` matches the operator's own `META_VERIFY_TOKEN`.
- `POST` — delivery status callbacks (`sent`/`delivered`/`read`/`failed`),
  applied to the `messages` rows written by the send path.

`POST` always answers 200 for authenticated, well-formed requests, including
ones it does not fully understand: Meta retries any non-2xx response, so
returning an error for an unrecognised payload shape would produce a retry
storm over a message that will never become parseable.
"""

import hmac
import logging

from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse, PlainTextResponse

from ..providers import build_whatsapp_provider
from ..services.pocketbase import PocketBaseError, pb_literal, wa_collection
from ..services.settings import get_app_settings

router = APIRouter(tags=["whatsapp"])
logger = logging.getLogger("waotp")

# Only these are meaningful to persist. Meta also sends statuses we do not
# model ("deleted", "warning", ...) — storing one would fail the select field
# validation, so they are dropped rather than written blindly.
KNOWN_STATUSES = frozenset({"sent", "delivered", "read", "failed"})


@router.get("/webhooks/whatsapp")
async def verify(request: Request):
    """Meta's subscription handshake.

    Meta sends `hub.mode=subscribe`, the verify token the operator configured
    for this app, and a challenge it expects echoed back verbatim. The
    comparison is constant-time; a mismatch is a 403 with no detail, so this
    cannot be used to probe the token.

    The parameters are read off the raw query string because Meta names them
    with dots ("hub.mode"), which is not a valid Python identifier and so
    cannot be bound to a normal FastAPI parameter.
    """
    params = request.query_params
    mode = params.get("hub.mode", "")
    token = params.get("hub.verify_token", "")
    challenge = params.get("hub.challenge", "")

    # Merged config, not get_settings(): the operator may set the verify token
    # in the PocketBase settings row, and reading env directly would silently
    # ignore it (and reject every handshake). Falls back to env when the control
    # plane is unreachable.
    cfg = await get_app_settings(request.app.state.pb)
    configured = cfg["meta_verify_token"]
    if not configured:
        logger.warning(
            "webhook handshake rejected: META_VERIFY_TOKEN is not set, so Meta "
            "cannot be subscribed. Set it in .env and re-subscribe in the Meta app."
        )
        return JSONResponse(status_code=403, content={"ok": False, "error": "forbidden"})

    if mode != "subscribe" or not hmac.compare_digest(token, configured):
        logger.warning("webhook handshake rejected: bad hub.mode/hub.verify_token")
        return JSONResponse(status_code=403, content={"ok": False, "error": "forbidden"})

    # Plain text, not JSON: Meta compares the body byte-for-byte.
    return PlainTextResponse(content=challenge)


@router.post("/webhooks/whatsapp")
async def receive(
    request: Request,
    x_hub_signature_256: str | None = Header(default=None),
):
    """Delivery status callbacks.

    Signature policy: when `META_APP_SECRET` is configured the
    `X-Hub-Signature-256` HMAC is required and a bad/missing one is a 403.
    When it is NOT configured the endpoint accepts unsigned callbacks — which
    is why `verify_configuration()` reports that state, and why the docs tell
    operators to set the app secret. Refusing every callback would break local
    development where the operator has not created a full Meta app yet.
    """
    raw = await request.body()
    # Merged config so the operator can rotate the app secret from the admin UI;
    # falls back to env when the control plane is unreachable.
    cfg = await get_app_settings(request.app.state.pb)
    provider = build_whatsapp_provider(cfg)

    if not provider.verify_signature(raw, x_hub_signature_256):
        logger.warning("whatsapp webhook rejected: invalid X-Hub-Signature-256")
        return JSONResponse(status_code=403, content={"ok": False, "error": "forbidden"})

    try:
        payload = await request.json()
    except ValueError:
        # Signed but not JSON — nothing actionable, and a retry would not help.
        logger.warning("whatsapp webhook: signed body was not valid JSON")
        return {"ok": True}

    events = provider.process_webhook(payload)
    applied = 0
    for event in events:
        if event.kind != "status" or not event.provider_message_id:
            continue
        if event.status not in KNOWN_STATUSES:
            continue
        try:
            applied += await _apply_status(request, event)
        except Exception:
            # A control-plane failure must not become Meta's problem: it would
            # retry the same callback, and the retry would fail the same way.
            # Broad on purpose — a rejected filter value (ValueError) is the
            # same class of "this event is not actionable" as a storage error,
            # and neither may turn into a 5xx that Meta retries forever.
            # Logged loudly for the operator instead.
            logger.exception(
                "whatsapp webhook: could not record status=%s for message=%s",
                event.status,
                event.provider_message_id,
            )

    return {"ok": True, "events": len(events), "applied": applied}


async def _apply_status(request: Request, event) -> int:
    """Update the `messages` row for this provider message id. Returns rows touched."""
    pb = request.app.state.pb
    # Second line of defence: the provider id was already whitelisted in
    # MetaProvider.process_webhook, and pb_literal refuses to build a filter
    # out of anything that could terminate the literal or escape it. Both
    # exist because this is the one filter in the codebase whose value comes
    # from an unauthenticated third party.
    found = await pb.list(
        wa_collection("messages"),
        filter=f"wa_message_id={pb_literal(event.provider_message_id)}",
        per_page=1,
    )
    items = found.get("items") or []
    if not items:
        # Unknown message id: could be a callback from a previous installation
        # or a number this box no longer owns. Nothing to update.
        logger.info(
            "whatsapp webhook: no messages row for provider id %s (status=%s)",
            event.provider_message_id,
            event.status,
        )
        return 0

    row = items[0]
    # "sent" is the row's own initial state; a late duplicate callback must not
    # reopen a terminal state or resurrect an error string.
    if row.get("status") in ("delivered", "read") and event.status == "sent":
        return 0

    patch: dict = {"status": event.status}
    if event.status == "failed" and event.error:
        patch["error"] = event.error[:500]
    await pb.update(wa_collection("messages"), row["id"], patch)
    return 1
