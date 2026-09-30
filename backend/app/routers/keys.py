"""Dashboard-facing key management. Authenticated with a PocketBase user token
(Authorization: Bearer <pb-token>), NOT an API key — the dashboard obtained the
token by logging in against PocketBase directly."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from ..core.errors import (
    InvalidUserToken,
    KeyLimitReached,
    KeyNotFound,
    UpstreamUnavailable,
    error_responses,
)
from ..dependencies import invalidate_api_key, require_pb_user
from ..core.security import generate_api_key, sha256_hex
from ..routers.otp import UsageOut  # same response shape as /v1/otp/usage
from ..services.pocketbase import PocketBaseError, wa_collection
from ..services.quota import monthly_used, reset_utc_iso
from ..services.settings import get_app_settings

router = APIRouter(prefix="/v1", tags=["keys"])

MAX_ACTIVE_KEYS_PER_OWNER = 5

LIST_RESPONSES = error_responses(InvalidUserToken, UpstreamUnavailable)
ISSUE_RESPONSES = error_responses(InvalidUserToken, KeyLimitReached, UpstreamUnavailable)
ID_RESPONSES = error_responses(InvalidUserToken, KeyNotFound, UpstreamUnavailable)


class KeyIn(BaseModel):
    label: str = Field(default="default", max_length=50)


class KeyIdIn(BaseModel):
    id: str = Field(min_length=1, max_length=64)


class KeyOut(BaseModel):
    id: str
    last4: str
    label: str
    active: bool
    created: str | None = None


class KeyListOut(BaseModel):
    keys: list[KeyOut]


class CreatedKeyOut(BaseModel):
    api_key: str
    last4: str
    label: str
    id: str


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def _deactivate_owned_key(pb, user: dict, key_id: str) -> None:
    """Owner-scoped kill switch for a single key: active=false + auth-cache
    invalidation, so the key stops working immediately. Unknown AND foreign
    ids both 404 — existence of other developers' keys is never leaked."""
    try:
        row = await pb.get_one(wa_collection("api_keys"), key_id)
    except PocketBaseError as exc:
        if exc.status_code == 404:
            raise KeyNotFound() from exc
        raise
    if row.get("owner") != user["id"]:
        raise KeyNotFound()
    await pb.update(wa_collection("api_keys"), row["id"], {"active": False})
    invalidate_api_key(row.get("key_hash") or "")


@router.get("/keys", response_model=KeyListOut, responses=LIST_RESPONSES)
async def list_keys(request: Request, user=Depends(require_pb_user)):
    res = await request.app.state.pb.list(
        wa_collection("api_keys"), filter=f"owner='{user['id']}'", sort="-created", per_page=50
    )
    keys = [
        {
            "id": k["id"],
            "last4": k.get("last4", ""),
            "label": k.get("label", ""),
            "active": bool(k.get("active")),
            "created": k.get("created"),
        }
        for k in res.get("items", [])
    ]
    return {"keys": keys}


@router.post("/keys", status_code=201, response_model=CreatedKeyOut, responses=ISSUE_RESPONSES)
async def issue_key(body: KeyIn, request: Request, user=Depends(require_pb_user)):
    pb = request.app.state.pb
    active = await pb.list(
        wa_collection("api_keys"),
        filter=f"owner='{user['id']}' && active=true",
        per_page=1,
    )
    if int(active.get("totalItems") or 0) >= MAX_ACTIVE_KEYS_PER_OWNER:
        raise KeyLimitReached()

    plaintext = generate_api_key()
    row = await pb.create(
        wa_collection("api_keys"),
        {
            "owner": user["id"],
            "key_hash": sha256_hex(plaintext),
            "last4": plaintext[-4:],
            "label": body.label,
            "active": True,
        },
    )
    # Plaintext is returned exactly once and never stored.
    return {"api_key": plaintext, "last4": plaintext[-4:], "label": body.label, "id": row["id"]}


@router.post("/keys/regenerate", response_model=CreatedKeyOut, responses=ISSUE_RESPONSES)
async def regenerate_key(body: KeyIn, request: Request, user=Depends(require_pb_user)):
    pb = request.app.state.pb
    existing = await pb.list(
        wa_collection("api_keys"), filter=f"owner='{user['id']}' && active=true", per_page=50
    )
    for row in existing.get("items", []):
        await pb.update(wa_collection("api_keys"), row["id"], {"active": False})
        # old plaintext keys must stop working immediately, not after 60 s
        invalidate_api_key(row.get("key_hash") or "")

    plaintext = generate_api_key()
    row = await pb.create(
        wa_collection("api_keys"),
        {
            "owner": user["id"],
            "key_hash": sha256_hex(plaintext),
            "last4": plaintext[-4:],
            "label": body.label,
            "active": True,
        },
    )
    return {"api_key": plaintext, "last4": plaintext[-4:], "label": body.label, "id": row["id"]}


@router.delete("/keys/{key_id}", responses=ID_RESPONSES)
async def delete_key(key_id: str, request: Request, user=Depends(require_pb_user)):
    """Resource-oriented key retirement (soft delete: active=false, the row
    and its audit history stay)."""
    await _deactivate_owned_key(request.app.state.pb, user, key_id)
    return {"ok": True}


@router.post("/keys/deactivate", responses=ID_RESPONSES, deprecated=True)
async def deactivate_key(body: KeyIdIn, request: Request, user=Depends(require_pb_user)):
    """Deprecated alias for DELETE /v1/keys/{id} — kept for existing clients."""
    await _deactivate_owned_key(request.app.state.pb, user, body.id)
    return {"ok": True}


@router.get("/usage", response_model=UsageOut, responses=LIST_RESPONSES)
async def usage(request: Request, user=Depends(require_pb_user)):
    """Dashboard usage view (the /v1/otp/usage variant is for the API key itself).

    `limit` is this installation's own monthly WhatsApp send cap, 0 meaning
    the operator set none — there is no tier, so nothing else to report.
    """
    now = _utcnow()
    used = await monthly_used(request.app.state.pb, user["id"], now)
    cfg = await get_app_settings(request.app.state.pb)
    return {
        "used": used,
        "limit": cfg["monthly_send_quota"],
        "reset_utc": reset_utc_iso(now),
    }
