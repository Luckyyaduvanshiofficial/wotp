"""OTP code lifecycle: create (hashed), verify with attempt counting and TTL.
Codes are never stored in plaintext; rows are single-use (deleted on success
or after the final wrong attempt / expiry)."""

from datetime import datetime, timedelta

from ..core.security import sha256_hex
from .pocketbase import wa_collection
from .quota import pb_date


async def expire_previous_otps(pb, owner_id: str, phone: str, now: datetime) -> None:
    """Mark any prior OTP codes for this phone as expired so only the newest is active."""
    try:
        res = await pb.list(
            wa_collection("otp_codes"),
            filter=f"owner='{owner_id}' && phone='{phone}' && expires>'{pb_date(now)}'",
            per_page=50,
        )
        for item in res.get("items") or []:
            try:
                await pb.update(
                    wa_collection("otp_codes"),
                    item["id"],
                    {"expires": (now - timedelta(seconds=1)).strftime("%Y-%m-%d %H:%M:%S")},
                )
            except Exception:
                pass
    except Exception:
        pass


async def create_otp(
    pb,
    owner_id: str,
    api_key_id: str,
    phone: str,
    code: str,
    ttl_seconds: int,
    now: datetime,
) -> dict:
    await expire_previous_otps(pb, owner_id, phone, now)
    expires = now + timedelta(seconds=ttl_seconds)
    return await pb.create(
        wa_collection("otp_codes"),
        {
            "owner": owner_id,
            "api_key": api_key_id,
            "phone": phone,
            "code_hash": sha256_hex(code),
            "expires": expires.strftime("%Y-%m-%d %H:%M:%S"),
            "attempts": 0,
        },
    )


async def _latest_active(pb, owner_id: str, phone: str, now: datetime) -> dict | None:
    res = await pb.list(
        wa_collection("otp_codes"),
        filter=(
            f"owner='{owner_id}' && phone='{phone}' && expires>'{pb_date(now)}'"
        ),
        sort="-created",
        per_page=1,
    )
    items = res.get("items") or []
    return items[0] if items else None


async def verify_otp(
    pb,
    owner_id: str,
    phone: str,
    code: str,
    max_attempts: int,
    now: datetime,
) -> dict:
    """Returns one of:
    {"result": "verified"}
    {"result": "wrong", "attempts_left": n}
    {"result": "too_many_attempts", "attempts_left": 0}
    {"result": "not_found"}   (expired or never issued — ask to resend)
    """
    row = await _latest_active(pb, owner_id, phone, now)
    if row is None:
        return {"result": "not_found"}

    if int(row.get("attempts") or 0) >= max_attempts:
        await pb.delete(wa_collection("otp_codes"), row["id"])
        return {"result": "not_found"}

    if hmac_compare(code, row.get("code_hash") or ""):
        await pb.delete(wa_collection("otp_codes"), row["id"])
        return {"result": "verified"}

    attempts = int(row.get("attempts") or 0) + 1
    if attempts >= max_attempts:
        await pb.delete(wa_collection("otp_codes"), row["id"])
        return {"result": "too_many_attempts", "attempts_left": 0}
    await pb.update(wa_collection("otp_codes"), row["id"], {"attempts": attempts})
    return {"result": "wrong", "attempts_left": max_attempts - attempts}


def hmac_compare(code: str, stored_hash: str) -> bool:
    import hmac

    return hmac.compare_digest(sha256_hex(code), stored_hash)
