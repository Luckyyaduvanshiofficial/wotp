from datetime import datetime, timezone

from app.services.quota import month_window, pb_date, reset_utc_iso


def test_month_window_mid_month():
    now = datetime(2026, 9, 13, 15, 30, 45, tzinfo=timezone.utc)
    start, end = month_window(now)
    assert start == datetime(2026, 9, 1, tzinfo=timezone.utc)
    assert end == datetime(2026, 10, 1, tzinfo=timezone.utc)
    assert reset_utc_iso(now) == "2026-10-01T00:00:00Z"


def test_month_window_year_rollover():
    now = datetime(2026, 12, 31, 23, 59, 59, tzinfo=timezone.utc)
    start, end = month_window(now)
    assert start == datetime(2026, 12, 1, tzinfo=timezone.utc)
    assert end == datetime(2027, 1, 1, tzinfo=timezone.utc)


def test_month_window_january():
    now = datetime(2026, 1, 2, tzinfo=timezone.utc)
    _, end = month_window(now)
    assert end == datetime(2026, 2, 1, tzinfo=timezone.utc)


def test_pb_date_format_matches_pb_filters():
    now = datetime(2026, 9, 13, 15, 30, 45, tzinfo=timezone.utc)
    assert pb_date(now) == "2026-09-13 15:30:45"


# ---- usage is immutable across delivery callbacks (the F1 regression) ----


def test_delivery_callback_does_not_reduce_usage(client):
    """A delivered/read/failed callback must not hand quota back.

    Reproduces the original bug: monthly_used counted status="sent", and the
    status webhook flips rows to "delivered", so usage fell as messages
    succeeded — the cap under-counted and stopped guarding spend.
    """
    from conftest import AUTH, add_developer

    c, fake = client
    add_developer(fake)

    assert c.post("/v1/otp/send", json={"to": "919876543210"}, headers=AUTH).status_code == 200
    assert c.get("/v1/otp/usage", headers=AUTH).json()["used"] == 1

    row = list(fake.records["messages"].values())[0]
    assert row["billable"] is True

    # the provider reports delivery, then the user reads it
    for status in ("delivered", "read"):
        fake.records["messages"][row["id"]]["status"] = status
        assert c.get("/v1/otp/usage", headers=AUTH).json()["used"] == 1, status

    # and a late "failed" for a message the provider had already accepted
    fake.records["messages"][row["id"]]["status"] = "failed"
    assert c.get("/v1/otp/usage", headers=AUTH).json()["used"] == 1


def test_webhook_never_writes_billable(client, monkeypatch):
    """The status callback must not be able to change what was billed."""
    import hashlib
    import hmac
    import json

    from conftest import add_developer
    from app.core.config import get_settings

    c, fake = client
    add_developer(fake)
    monkeypatch.setenv("META_APP_SECRET", "test-app-secret")
    monkeypatch.setenv("META_VERIFY_TOKEN", "test-verify-token")
    get_settings.cache_clear()

    fake.records["messages"]["m1"] = {
        "id": "m1", "owner": "usr1", "api_key": "key1",
        "phone": "919876543210", "channel": "whatsapp",
        "wa_message_id": "wamid.abc123", "status": "sent",
        "error": "", "billable": True,
    }

    payload = {
        "entry": [{"changes": [{"value": {"statuses": [
            {"id": "wamid.abc123", "status": "delivered", "recipient_id": "919876543210"}
        ]}}]}]
    }
    body = json.dumps(payload).encode()
    sig = "sha256=" + hmac.new(b"test-app-secret", body, hashlib.sha256).hexdigest()

    r = c.post(
        "/webhooks/whatsapp",
        content=body,
        headers={"Content-Type": "application/json", "X-Hub-Signature-256": sig},
    )
    assert r.status_code == 200
    assert r.json()["applied"] == 1
    assert fake.records["messages"]["m1"]["status"] == "delivered"
    # untouched by the callback
    assert fake.records["messages"]["m1"]["billable"] is True


def test_failed_send_rows_are_not_billable(client, monkeypatch):
    """A provider rejection is audited but must never consume quota."""
    from conftest import AUTH, add_developer
    from app.core.config import get_settings
    from app.core.security import encrypt_secret

    c, fake = client
    add_developer(fake)
    fake.records["settings"]["set1"]["meta_phone_number_id"] = "PN123"
    fake.records["settings"]["set1"]["meta_token_enc"] = encrypt_secret("REALMETA")
    monkeypatch.setenv("WOTP_MOCK_DELIVERY", "0")
    get_settings.cache_clear()

    async def boom(*args, **kwargs):
        from app.providers import ProviderError
        raise ProviderError('{"error": {"message": "template not approved"}}')

    monkeypatch.setattr("app.providers.meta.MetaProvider.send_otp", boom)

    assert c.post("/v1/otp/send", json={"to": "919876543210"}, headers=AUTH).status_code == 502

    rows = list(fake.records["messages"].values())
    assert len(rows) == 1 and rows[0]["status"] == "failed"
    assert rows[0]["billable"] is False
    assert c.get("/v1/otp/usage", headers=AUTH).json()["used"] == 0


def test_telegram_sends_are_never_billable(client):
    from conftest import AUTH, add_developer

    c, fake = client
    add_developer(fake)
    fake.records["tg_links"]["l1"] = {
        "id": "l1", "phone": "919876543210", "chat_id": "777", "tg_user_id": "555",
    }

    r = c.post(
        "/v1/otp/send", json={"to": "919876543210", "channel": "telegram"}, headers=AUTH
    )
    assert r.status_code == 200

    rows = list(fake.records["messages"].values())
    assert rows and rows[0]["billable"] is False
    assert c.get("/v1/otp/usage", headers=AUTH).json()["used"] == 0


def test_quota_counts_rows_regardless_of_later_status(client):
    """End-to-end cap check: callbacks must not create extra headroom."""
    from conftest import AUTH, add_developer

    c, fake = client
    add_developer(fake)
    fake.records["settings"]["set1"]["monthly_send_quota"] = 2

    assert c.post("/v1/otp/send", json={"to": "919876543210"}, headers=AUTH).status_code == 200
    assert c.post(
        "/v1/otp/send", json={"to": "919876543210", "code": "222222"}, headers=AUTH
    ).status_code == 200

    # both are delivered, which used to free quota
    for row in fake.records["messages"].values():
        row["status"] = "delivered"

    r = c.post(
        "/v1/otp/send", json={"to": "919876543210", "code": "333333"}, headers=AUTH
    )
    assert r.status_code == 429
    assert r.json()["error"] == "quota_exceeded"
    assert r.json()["used"] == 2
