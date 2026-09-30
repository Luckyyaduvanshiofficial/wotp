"""Operator-editable runtime configuration from the PB `settings` single row,
merged over env fallbacks. Cached in memory for 60s.

Precedence is deliberately env-first for *credentials* (so a Docker install can
be configured entirely from `.env`) and row-first for *policy numbers* (so the
operator can retune limits from the PocketBase admin UI without a redeploy).
"""

import time

from ..core.config import get_settings
from ..core.security import decrypt_secret
from .pocketbase import wa_collection

_TTL_SECONDS = 60.0
_cache: dict = {"data": None, "at": 0.0}

# Fields that must be present before a real (non-mock) WhatsApp delivery is
# attempted. Telegram is validated separately.
REQUIRED_LIVE_KEYS = ("meta_phone_number_id", "meta_token")


async def get_app_settings(pb) -> dict:
    now = time.monotonic()
    if _cache["data"] is not None and now - _cache["at"] < _TTL_SECONDS:
        return _cache["data"]

    env = get_settings()
    row: dict = {}
    try:
        res = await pb.list(wa_collection("settings"), per_page=1)
        if res.get("items"):
            row = res["items"][0]
    except Exception:
        row = {}

    # Operator-set encrypted secrets win when present; otherwise the env value.
    # Both of these are credentials the operator can rotate from the admin UI,
    # which only works if every reader goes through this merged dict — a reader
    # that called get_settings() directly would silently ignore the row.
    meta_token = ""
    if row.get("meta_token_enc"):
        meta_token = decrypt_secret(row["meta_token_enc"]) or ""
    meta_app_secret = ""
    if row.get("meta_app_secret_enc"):
        meta_app_secret = decrypt_secret(row["meta_app_secret_enc"]) or ""

    data = {
        "meta_phone_number_id": row.get("meta_phone_number_id") or env.meta_phone_number_id,
        "meta_token": meta_token or env.meta_access_token,
        # Verifies inbound webhook signatures. Empty means unsigned callbacks
        # are accepted, which is why production refuses to boot without it.
        "meta_app_secret": meta_app_secret or env.meta_app_secret,
        "meta_verify_token": row.get("meta_verify_token") or env.meta_verify_token,
        "meta_template": row.get("meta_template") or env.meta_template,
        "meta_template_lang": row.get("meta_template_lang") or env.meta_template_lang,
        "tg_bot_token": row.get("tg_bot_token") or env.telegram_bot_token,
        "tg_bot_username": row.get("tg_bot_username") or env.telegram_bot_username,
        "otp_length": _int(row.get("otp_length"), env.otp_length),
        # 0 is meaningful here ("no monthly cap"), so it must survive the merge.
        "monthly_send_quota": _int_allow_zero(row.get("monthly_send_quota"), env.monthly_send_quota),
        "per_phone_hourly": _int(row.get("per_phone_hourly"), env.per_phone_hourly),
        "resend_cooldown_seconds": _int_allow_zero(
            row.get("resend_cooldown_seconds"), env.resend_cooldown_seconds
        ),
        "code_ttl_seconds": _int(row.get("code_ttl_seconds"), env.code_ttl_seconds),
        "max_attempts": _int(row.get("max_attempts"), env.max_attempts),
        "ratelimit_per_min": _int(row.get("ratelimit_per_min"), env.ratelimit_per_min),
        "ratelimit_per_ip_per_min": _int(
            row.get("ratelimit_per_ip_per_min"), env.ratelimit_per_ip_per_min
        ),
    }
    _cache["data"] = data
    _cache["at"] = now
    return data


def invalidate_settings_cache() -> None:
    _cache["data"] = None
    _cache["at"] = 0.0


def _int(value, fallback: int) -> int:
    """Positive integers only; a zero/negative/garbage value falls back."""
    try:
        v = int(value)
        return v if v > 0 else fallback
    except (TypeError, ValueError):
        return fallback


def _int_allow_zero(value, fallback: int) -> int:
    """Like `_int`, but 0 is a legitimate value (meaning "disabled"/"unlimited")."""
    try:
        v = int(value)
        return v if v >= 0 else fallback
    except (TypeError, ValueError):
        return fallback
