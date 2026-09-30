import logging
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Header, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from ..core.errors import (
    DeliveryFailed,
    InvalidApiKey,
    InvalidRequest,
    KeyDisabled,
    NotConfigured,
    NotLinked,
    PhoneThrottled,
    QuotaExceeded,
    RateLimited,
    UpstreamUnavailable,
    error_responses,
)
from ..core.security import (
    generate_otp_code,
    make_link_token,
    mask_phone,
    normalize_phone,
)
from ..core.tracing import get_request_id
from ..dependencies import idempotency_store, owner_lock, require_api_key, verify_lock
from ..providers import ProviderError, build_whatsapp_provider
from ..services import telegram as telegram_service
from ..services.otp import create_otp, verify_otp
from ..services.pocketbase import PocketBaseError, wa_collection
from ..services.quota import (
    month_window,
    monthly_used,
    phone_sends_last_hour,
    reset_utc_iso,
    sent_within,
)
from ..services.settings import get_app_settings

router = APIRouter(prefix="/v1/otp", tags=["otp"])
logger = logging.getLogger("waotp")

CUSTOM_CODE_PATTERN = r"^[A-Za-z0-9]{4,10}$"

SEND_RESPONSES = error_responses(
    InvalidRequest, InvalidApiKey, KeyDisabled, RateLimited, QuotaExceeded,
    PhoneThrottled, NotLinked, NotConfigured, DeliveryFailed, UpstreamUnavailable,
)
VERIFY_RESPONSES = error_responses(InvalidRequest, InvalidApiKey, KeyDisabled, RateLimited)
USAGE_RESPONSES = error_responses(InvalidApiKey, KeyDisabled, RateLimited, UpstreamUnavailable)


class SendIn(BaseModel):
    to: str = Field(min_length=5, max_length=20)
    channel: Literal["whatsapp", "telegram"] = "whatsapp"
    code: str | None = Field(default=None, pattern=CUSTOM_CODE_PATTERN)


class VerifyIn(BaseModel):
    to: str = Field(min_length=5, max_length=20)
    code: str = Field(min_length=1, max_length=10)


class SendOut(BaseModel):
    ok: bool
    channel: str
    request_id: str
    # Provider message id (WhatsApp wamid / Telegram message id). Named
    # generically because the field is channel-independent.
    message_id: str
    expires_in: int
    # Monthly sends used and the configured cap for THIS installation.
    # `limit` is 0 when the operator has set no cap.
    used: int
    limit: int
    reset_utc: str


class VerifyOut(BaseModel):
    ok: bool
    verified: bool


class UsageOut(BaseModel):
    used: int
    limit: int
    reset_utc: str


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _validate_idempotency_key(value: str | None) -> str | None:
    """Optional Idempotency-Key header: 1-255 visible ASCII characters.
    Invalid values 400 rather than being silently ignored — a client that
    believes it has idempotency protection must not discover it never did."""
    if value is None:
        return None
    key = value.strip()
    if not key or len(key) > 255 or any(not 0x21 <= ord(ch) <= 0x7E for ch in key):
        raise InvalidRequest(detail="Idempotency-Key must be 1-255 visible ASCII characters")
    return key


@router.post("/send", response_model=SendOut, responses=SEND_RESPONSES)
async def send_otp(
    body: SendIn,
    request: Request,
    ctx=Depends(require_api_key),
    idempotency_key: str | None = Header(default=None),
):
    idem = _validate_idempotency_key(idempotency_key)
    phone = normalize_phone(body.to)
    if phone is None:
        raise InvalidRequest(detail="to must be a valid phone number (E.164, e.g. 919876543210)")

    pb = request.app.state.pb
    owner = ctx["owner"]
    api_key = ctx["api_key"]
    cfg = ctx["config"]
    now = _utcnow()

    # Serialize the whole send (quota check -> throttle check -> provider
    # delivery -> ledger writes) per OWNER. The lock intentionally spans the
    # provider await: without it, two concurrent sends could both pass the
    # quota/throttle checks before either wrote its ledger rows.
    #
    # Owner-scoped rather than key-scoped because the cap and the throttle are
    # owner-scoped, and one owner may hold several active keys (up to
    # MAX_ACTIVE_KEYS_PER_OWNER). Keying on the key id would leave the
    # double-spend open across any two of them.
    async with owner_lock(owner["id"]):
        # Idempotency replay: a retry with the same Idempotency-Key inside
        # the code's lifetime returns the original response instead of
        # double-sending. Checked inside the per-owner lock so a concurrent
        # duplicate waits for — and then replays — the first send.
        if idem is not None:
            replayed = idempotency_store.get((api_key["id"], idem))
            if replayed is not None:
                replayed_status, replayed_body = replayed
                return JSONResponse(
                    status_code=replayed_status,
                    content=replayed_body,
                    headers={"Idempotency-Replayed": "true"},
                )

        # Monthly cap counts WhatsApp-delivered sends only; Telegram is not
        # metered against it. A cap of 0 means the operator set no limit.
        quota = cfg["monthly_send_quota"]
        used = await monthly_used(pb, owner["id"], now)
        if body.channel == "whatsapp" and quota > 0 and used >= quota:
            retry_after = max(60, int((month_window(now)[1] - now).total_seconds()))
            raise QuotaExceeded(
                used=used,
                limit=quota,
                reset_utc=reset_utc_iso(now),
                headers={"Retry-After": str(retry_after)},
            )

        # Per-phone throttle stays for BOTH channels (victim-number protection):
        # the harm of bombarding one number is identical on either channel.
        recent = await phone_sends_last_hour(pb, owner["id"], phone, now)
        if recent >= cfg["per_phone_hourly"]:
            raise PhoneThrottled(retry_after_seconds=3600)

        # Optional minimum gap between sends to the same number. Off (0) by
        # default because the hourly throttle already bounds the rate; operators
        # who want resend-specific pacing turn this on.
        cooldown = cfg["resend_cooldown_seconds"]
        if cooldown > 0 and await sent_within(pb, owner["id"], phone, cooldown, now):
            # Retry-After reports the full cooldown rather than the exact
            # remainder: the remainder would mean reading back a timestamp to
            # subtract, and an over-estimate only makes a caller wait longer.
            raise PhoneThrottled(retry_after_seconds=int(cooldown))

        code = body.code or generate_otp_code(cfg["otp_length"])

        provider_message_id = ""
        mock = get_mock_delivery(request)
        if body.channel == "whatsapp":
            if mock:
                provider_message_id = f"mock-{uuid.uuid4().hex[:12]}"
            else:
                if not cfg["meta_phone_number_id"] or not cfg["meta_token"]:
                    raise NotConfigured(detail="WhatsApp is not configured yet")
                provider = build_whatsapp_provider(cfg)
                try:
                    provider_message_id = await provider.send_otp(
                        request.app.state.http, phone, code, cfg["code_ttl_seconds"]
                    )
                except ProviderError as exc:
                    await _log_failure(pb, owner, api_key, phone, "whatsapp", exc.message)
                    raise DeliveryFailed(
                        channel="whatsapp", detail=exc.message[:300], retryable=exc.retryable
                    ) from exc
        else:  # telegram
            links = await pb.list(wa_collection("tg_links"), filter=f"phone='{phone}'", per_page=1)
            items = links.get("items") or []
            if not items:
                # The deep link must name the operator's own bot. Guessing a
                # username here would send users to an unrelated bot, so an
                # unconfigured bot is reported as a configuration problem.
                bot_username = (cfg["tg_bot_username"] or "").lstrip("@")
                if not bot_username:
                    raise NotConfigured(
                        detail="Telegram bot is not configured yet (settings collection)"
                    )
                link_token = make_link_token(owner["id"], phone)
                raise NotLinked(link_url=f"https://t.me/{bot_username}?start={link_token}")
            if not mock and not cfg["tg_bot_token"]:
                raise NotConfigured(detail="Telegram bot is not configured yet (settings collection)")
            chat_id = items[0]["chat_id"]
            if mock:
                provider_message_id = f"mock-{uuid.uuid4().hex[:12]}"
            else:
                try:
                    provider_message_id = await telegram_service.send_message(
                        request.app.state.http,
                        cfg["tg_bot_token"],
                        chat_id,
                        f"{code} is your verification code. It expires in "
                        f"{cfg['code_ttl_seconds'] // 60} minutes.",
                    )
                except telegram_service.TelegramError as exc:
                    await _log_failure(pb, owner, api_key, phone, "telegram", exc.message)
                    raise DeliveryFailed(
                        channel="telegram", detail=exc.message[:300], retryable=exc.retryable
                    ) from exc

        # Delivered: append audit row + store the hashed code (single-use).
        #
        # Ordering, and what it does and does not guarantee: the provider has
        # already accepted the message by the time we get here, so these two
        # writes are bookkeeping. They cannot be made atomic with the provider
        # call — that is a property of talking to an external system, not
        # something more code can fix — so instead the failure is made
        # *replayable*: the error body is cached under the caller's
        # Idempotency-Key, and a retry with that key gets the original error
        # back instead of putting a second code on the user's phone.
        #
        # Broad on purpose: an httpx transport error here (PocketBase
        # unreachable, connection reset) is the same situation as a rejected
        # write — the message was delivered — and letting it escape would label
        # a delivered send as 503 upstream_unavailable, which invites exactly
        # the retry that double-sends.
        try:
            row = await pb.create(
                wa_collection("messages"),
                {
                    "owner": owner["id"],
                    "api_key": api_key["id"],
                    "phone": phone,
                    "channel": body.channel,
                    "wa_message_id": provider_message_id,
                    "status": "sent",
                    "error": "",
                    # Usage is recorded here, at the moment the provider
                    # accepted the message, and is never written again. Status
                    # callbacks (sent -> delivered/read/failed) update `status`
                    # only, so the monthly count cannot be reduced by a
                    # callback — see services/quota.py::monthly_used.
                    "billable": body.channel == "whatsapp",
                },
            )
            await create_otp(
                pb, owner["id"], api_key["id"], phone, code, cfg["code_ttl_seconds"], now
            )
        except Exception as exc:
            logger.critical(
                "ledger write failed after delivery — reconcile wa_message_id=%s "
                "channel=%s owner=%s phone=%s request_id=%s",
                provider_message_id,
                body.channel,
                owner["id"],
                mask_phone(phone),
                get_request_id() or "(none)",
                exc_info=exc,
            )
            failure = DeliveryFailed(
                channel=body.channel,
                detail="delivered but not recorded; manual reconciliation required",
            )
            if idem is not None:
                # Replaying this error is what stops the retry from
                # double-sending. Cached for the code's lifetime, like a success.
                idempotency_store.put(
                    (api_key["id"], idem),
                    failure.status_code,
                    failure.body(),
                    cfg["code_ttl_seconds"],
                )
            raise failure from exc

    response_body = {
        "ok": True,
        "channel": body.channel,
        "request_id": row["id"],
        "message_id": provider_message_id,
        "expires_in": cfg["code_ttl_seconds"],
        # Telegram sends do not consume the WhatsApp cap: report the current count.
        "used": used + 1 if body.channel == "whatsapp" and quota > 0 else used,
        "limit": quota,
        "reset_utc": reset_utc_iso(now),
    }
    if idem is not None:
        # Replay window = the code's lifetime; past expiry a retry must send
        # a fresh code, not replay a dead one. Only successes and the
        # delivered-but-unrecorded failure are cached — ordinary failures stay
        # retryable.
        idempotency_store.put(
            (api_key["id"], idem), 200, response_body, cfg["code_ttl_seconds"]
        )
    return response_body


@router.post("/verify", response_model=VerifyOut, responses=VERIFY_RESPONSES)
async def verify_otp_route(body: VerifyIn, request: Request, ctx=Depends(require_api_key)):
    phone = normalize_phone(body.to)
    if phone is None:
        raise InvalidRequest(detail="to must be a valid phone number")
    cfg = ctx["config"]
    # Per-(owner, phone) lock: two concurrent verifies of the same code must
    # not both consume the single-use row (double spend).
    async with verify_lock(ctx["owner"]["id"], phone):
        result = await verify_otp(
            request.app.state.pb,
            ctx["owner"]["id"],
            phone,
            body.code,
            cfg["max_attempts"],
            _utcnow(),
        )
    if result["result"] == "verified":
        return {"ok": True, "verified": True}
    error_map = {
        "wrong": "wrong_code",
        "too_many_attempts": "too_many_attempts",
        "not_found": "code_expired",
    }
    resp = {
        "ok": False,
        "verified": False,
        "error": error_map.get(result["result"], result["result"]),
    }
    if "attempts_left" in result:
        resp["attempts_left"] = result["attempts_left"]
    if result["result"] == "not_found":
        resp["detail"] = "request a new code"
    return JSONResponse(status_code=400, content=resp)


@router.get("/usage", response_model=UsageOut, responses=USAGE_RESPONSES)
async def usage(request: Request, ctx=Depends(require_api_key)):
    now = _utcnow()
    used = await monthly_used(request.app.state.pb, ctx["owner"]["id"], now)
    return {
        "used": used,
        "limit": ctx["config"]["monthly_send_quota"],
        "reset_utc": reset_utc_iso(now),
    }


def get_mock_delivery(request: Request) -> bool:
    from ..core.config import get_settings

    return get_settings().waotp_mock_delivery


async def _log_failure(pb, owner, api_key, phone, channel, error):
    # Failed sends never consume quota — but they are always auditable.
    # Best-effort: if the audit row itself cannot be written, log it and let
    # the original DeliveryFailed propagate — a control-plane hiccup must not
    # mask the delivery failure the caller needs to see.
    try:
        await pb.create(
            wa_collection("messages"),
            {
                "owner": owner["id"],
                "api_key": api_key["id"],
                "phone": phone,
                "channel": channel,
                "wa_message_id": "",
                "status": "failed",
                "error": (error or "")[:500],
                # The provider rejected this before accepting it, so it is not
                # usage. Explicit false rather than omitted: a missing field
                # would be indistinguishable from an old row during backfill.
                "billable": False,
            },
        )
    except Exception:
        logger.critical(
            "audit row for failed send could not be written — channel=%s "
            "owner=%s phone=%s request_id=%s error=%s",
            channel, owner["id"], mask_phone(phone), get_request_id() or "(none)",
            (error or "")[:300],
            exc_info=True,
        )
