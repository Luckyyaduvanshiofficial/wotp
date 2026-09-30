"""Monthly send cap and per-phone throttle, both sourced from append-only data:
- the monthly cap counts `messages` rows with channel=whatsapp and
  billable=true in the current calendar month (UTC) — Telegram is never
  metered against it, and a cap of 0 means the operator set no limit
- per-phone throttle counts `otp_codes` rows created in the trailing hour
  (both channels: victim-number protection)
"""

from datetime import datetime, timedelta, timezone

from .pocketbase import wa_collection

MONTH_LIMIT_FALLBACK_NOTE = "limits live in the settings collection"


def month_window(now: datetime) -> tuple[datetime, datetime]:
    """(start of current UTC month, start of next UTC month)."""
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if now.month == 12:
        end = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)
    return start, end


def reset_utc_iso(now: datetime) -> str:
    _, end = month_window(now)
    return end.strftime("%Y-%m-%dT%H:%M:%SZ")


def pb_date(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


async def monthly_used(pb, owner_id: str, now: datetime) -> int:
    """WhatsApp sends this owner has been billed for this UTC month.

    Counts `billable`, which is written once when the provider accepts a
    message and is never changed afterwards. It deliberately does NOT count
    `status`: status moves from sent -> delivered/read/failed as the provider's
    callbacks arrive, so counting it made the cap shrink as messages were
    successfully delivered and handed back quota to anyone who could provoke a
    status change. Usage has to be append-only to be a spend guard.
    """
    start, _ = month_window(now)
    res = await pb.list(
        wa_collection("messages"),
        filter=(
            f"owner='{owner_id}' && channel='whatsapp' && billable=true "
            f"&& created>='{pb_date(start)}'"
        ),
        per_page=1,
    )
    return int(res.get("totalItems", 0))


async def phone_sends_last_hour(pb, owner_id: str, phone: str, now: datetime) -> int:
    since = now - timedelta(hours=1)
    res = await pb.list(
        wa_collection("otp_codes"),
        filter=f"owner='{owner_id}' && phone='{phone}' && created>='{pb_date(since)}'",
        per_page=1,
    )
    return int(res.get("totalItems", 0))


async def sent_within(pb, owner_id: str, phone: str, seconds: int, now: datetime) -> bool:
    """True if a code was sent to this phone within the last `seconds`.

    Backs the configurable resend cooldown. Implemented as a cutoff count
    rather than "read the newest row and subtract its timestamp": PocketBase
    returns dates as strings in its own format, and comparing against a
    server-computed cutoff avoids parsing them (and avoids a client clock
    being able to influence the answer).
    """
    if seconds <= 0:
        return False
    since = now - timedelta(seconds=seconds)
    res = await pb.list(
        wa_collection("otp_codes"),
        filter=f"owner='{owner_id}' && phone='{phone}' && created>='{pb_date(since)}'",
        per_page=1,
    )
    return int(res.get("totalItems", 0)) > 0
