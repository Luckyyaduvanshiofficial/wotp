"""Telegram bot webhook.

Flow (PRD milestone 1.5):
- Mini app gets 409 user_not_linked from /v1/otp/send → shows a
  "Connect Telegram" button deep-linking to t.me/<bot>?start=<link_token>.
- User taps /start → bot replies with a request_contact keyboard.
- User shares contact → accepted ONLY if contact.user_id == from.id
  (otherwise anyone could link a friend's number) → upsert tg_links.
- Mini app retries /v1/otp/send; the OTP now arrives on Telegram.
"""

import hmac
import json
import logging

from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse

from ..core.config import get_settings
from ..core.security import mask_phone, normalize_phone, parse_link_token
from ..services import telegram as telegram_service
from ..services.pocketbase import PocketBaseError, wotp_collection
from ..services.settings import get_app_settings

router = APIRouter(tags=["telegram"])
logger = logging.getLogger("wotp")

LINKED_TEXT = (
    "✅ Number linked! Mini apps using WOTP can now send you "
    "verification codes right here on Telegram."
)
WRONG_CONTACT_TEXT = "⚠️ For security, please share your OWN number using the button below."
NOT_A_NUMBER_TEXT = "⚠️ That doesn't look like a phone number. Please share your contact."


@router.post("/telegram/webhook")
async def webhook(
    request: Request,
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
):
    env = get_settings()
    if (
        not env.telegram_webhook_secret
        or x_telegram_bot_api_secret_token is None
        or not hmac.compare_digest(
            x_telegram_bot_api_secret_token, env.telegram_webhook_secret
        )
    ):
        return JSONResponse(status_code=403, content={"ok": False, "error": "forbidden"})

    try:
        update = await request.json()
    except json.JSONDecodeError:
        return {"ok": True}

    message = update.get("message") or {}
    sender = message.get("from") or {}
    chat_id = str((message.get("chat") or {}).get("id") or "")
    contact = message.get("contact")
    text = message.get("text") or ""

    cfg = await get_app_settings(request.app.state.pb)
    if not cfg["tg_bot_token"] or not chat_id:
        return {"ok": True}

    http = request.app.state.http
    bot_token = cfg["tg_bot_token"]

    if contact is not None:
        response = await _handle_contact(request, cfg, bot_token, http, chat_id, sender, contact)
        if response is not None:
            return response
    elif text.startswith("/start"):
        await _handle_start(request, cfg, bot_token, http, chat_id, text)

    return {"ok": True}


async def _handle_start(request, cfg, bot_token, http, chat_id: str, text: str) -> None:
    payload = text.split(" ", 1)[1].strip() if " " in text else ""
    linked = parse_link_token(payload) if payload else None
    if linked and linked.get("p"):
        greeting = (
            f"👋 Hi! Tap the button below to share the number ending in "
            f"{linked['p'][-4:]} so mini apps can send you Telegram OTPs."
        )
    else:
        greeting = (
            "👋 Hi! Tap the button below to share your number. "
            "Mini apps will then send your verification codes here."
        )
    try:
        await telegram_service.send_message(
            http, bot_token, chat_id, greeting,
            telegram_service.share_contact_keyboard(),
        )
    except telegram_service.TelegramError as exc:
        logger.warning("telegram reply failed (chat_id=%s): %s", chat_id, exc)


async def _handle_contact(request, cfg, bot_token, http, chat_id, sender, contact):
    pb = request.app.state.pb

    # Identity check: the shared contact must belong to the sender themselves.
    if contact.get("user_id") != sender.get("id"):
        try:
            await telegram_service.send_message(http, bot_token, chat_id, WRONG_CONTACT_TEXT)
        except telegram_service.TelegramError as exc:
            logger.warning("telegram reply failed (chat_id=%s): %s", chat_id, exc)
        return None

    phone = normalize_phone(contact.get("phone_number") or "")
    if phone is None:
        try:
            await telegram_service.send_message(http, bot_token, chat_id, NOT_A_NUMBER_TEXT)
        except telegram_service.TelegramError as exc:
            logger.warning("telegram reply failed (chat_id=%s): %s", chat_id, exc)
        return None

    now = _utcnow_str()
    try:
        existing = await pb.list(wotp_collection("tg_links"), filter=f"phone='{phone}'", per_page=1)
        items = existing.get("items") or []
        if items:
            await pb.update(
                wotp_collection("tg_links"),
                items[0]["id"],
                {"chat_id": chat_id, "tg_user_id": str(sender.get("id", "")), "linked_at": now},
            )
        else:
            await pb.create(
                wotp_collection("tg_links"),
                {
                    "phone": phone,
                    "chat_id": chat_id,
                    "tg_user_id": str(sender.get("id", "")),
                    "linked_at": now,
                },
            )
    except PocketBaseError as exc:
        # 503 so Telegram retries the update — a link must never be silently lost.
        logger.exception(
            "tg_links upsert failed (phone=%s, chat_id=%s)", mask_phone(phone), chat_id
        )
        return JSONResponse(
            status_code=503, content={"ok": False, "error": "upstream_unavailable"}
        )

    try:
        await telegram_service.send_message(http, bot_token, chat_id, LINKED_TEXT)
    except telegram_service.TelegramError as exc:
        logger.warning("telegram reply failed (chat_id=%s): %s", chat_id, exc)
    return None


def _utcnow_str() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
