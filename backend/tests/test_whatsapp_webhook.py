"""Meta WhatsApp webhook: handshake + status callbacks.

Failure-first: every section below asserts what happens on bad input (wrong
token, bad signature, unparseable body, unknown message id, unexpected status)
before the happy path.
"""

import hashlib
import hmac
import json

import pytest

from tests.conftest import add_developer

VERIFY_TOKEN = "test-verify-token"
APP_SECRET = "test-app-secret"


def _settings(monkeypatch, **env):
    """Set env vars and drop the cached Settings so they take effect.

    Passing "" is meaningful: it forces a value to empty even when the
    developer's own backend/.env sets it, so these tests are hermetic.
    """
    from app.core.config import get_settings

    for key, value in env.items():
        monkeypatch.setenv(key, value)
    get_settings.cache_clear()


def _sign(body: bytes, secret: str = APP_SECRET) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def _status_payload(message_id="mock-abc123", status="delivered", error=None):
    status_obj = {
        "id": message_id,
        "status": status,
        "timestamp": "1700000000",
        "recipient_id": "919876543210",
    }
    if error:
        status_obj["errors"] = [{"title": error}]
    return {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "WABA_ID",
                "changes": [
                    {"field": "messages", "value": {"statuses": [status_obj]}}
                ],
            }
        ],
    }


def _post(client, payload, *, secret=APP_SECRET, signature=None):
    body = json.dumps(payload).encode()
    headers = {"Content-Type": "application/json"}
    if secret is not None:
        headers["X-Hub-Signature-256"] = (
            signature if signature is not None else _sign(body, secret)
        )
    return client.post("/webhooks/whatsapp", content=body, headers=headers)


# ---- GET handshake -------------------------------------------------------


def test_handshake_rejects_when_verify_token_not_configured(client, monkeypatch):
    """An unconfigured install must not accept a handshake it cannot check."""
    c, _ = client
    _settings(monkeypatch, META_VERIFY_TOKEN="")

    r = c.get(
        "/webhooks/whatsapp",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": "",
            "hub.challenge": "12345",
        },
    )
    assert r.status_code == 403
    assert r.json()["error"] == "forbidden"


def test_handshake_rejects_wrong_token(client, monkeypatch):
    c, _ = client
    _settings(monkeypatch, META_VERIFY_TOKEN=VERIFY_TOKEN)

    r = c.get(
        "/webhooks/whatsapp",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": VERIFY_TOKEN + "x",
            "hub.challenge": "12345",
        },
    )
    assert r.status_code == 403


def test_handshake_rejects_wrong_mode(client, monkeypatch):
    """A matching token with hub.mode != subscribe is still a rejection."""
    c, _ = client
    _settings(monkeypatch, META_VERIFY_TOKEN=VERIFY_TOKEN)

    r = c.get(
        "/webhooks/whatsapp",
        params={
            "hub.mode": "unsubscribe",
            "hub.verify_token": VERIFY_TOKEN,
            "hub.challenge": "12345",
        },
    )
    assert r.status_code == 403


def test_handshake_rejects_missing_params(client, monkeypatch):
    c, _ = client
    _settings(monkeypatch, META_VERIFY_TOKEN=VERIFY_TOKEN)
    r = c.get("/webhooks/whatsapp")
    assert r.status_code == 403


def test_handshake_echoes_challenge(client, monkeypatch):
    """The challenge must come back verbatim, as plain text."""
    c, _ = client
    _settings(monkeypatch, META_VERIFY_TOKEN=VERIFY_TOKEN)

    r = c.get(
        "/webhooks/whatsapp",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": VERIFY_TOKEN,
            "hub.challenge": "1158201444",
        },
    )
    assert r.status_code == 200
    assert r.text == "1158201444"


# ---- POST signature ------------------------------------------------------


def test_post_rejects_bad_signature(client, monkeypatch):
    c, fake = client
    _settings(monkeypatch, META_VERIFY_TOKEN=VERIFY_TOKEN, META_APP_SECRET=APP_SECRET)

    r = _post(c, _status_payload(), signature="sha256=" + "0" * 64)
    assert r.status_code == 403
    assert fake.records["messages"] == {}


def test_post_rejects_missing_signature_when_secret_is_set(client, monkeypatch):
    c, _ = client
    _settings(monkeypatch, META_VERIFY_TOKEN=VERIFY_TOKEN, META_APP_SECRET=APP_SECRET)

    r = _post(c, _status_payload(), secret=None)
    assert r.status_code == 403


def test_post_rejects_signature_from_the_wrong_secret(client, monkeypatch):
    """A valid-looking HMAC computed with a different key must not pass."""
    c, _ = client
    _settings(monkeypatch, META_VERIFY_TOKEN=VERIFY_TOKEN, META_APP_SECRET=APP_SECRET)

    r = _post(c, _status_payload(), secret="some-other-secret")
    assert r.status_code == 403


def test_post_accepts_valid_signature(client, monkeypatch):
    c, fake = client
    add_developer(fake)
    _settings(monkeypatch, META_VERIFY_TOKEN=VERIFY_TOKEN, META_APP_SECRET=APP_SECRET)
    fake.records["messages"]["m1"] = {
        "id": "m1", "owner": "usr1", "wa_message_id": "mock-abc123",
        "channel": "whatsapp", "status": "sent", "error": "",
    }

    r = _post(c, _status_payload(status="delivered"))
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["applied"] == 1
    assert fake.records["messages"]["m1"]["status"] == "delivered"


def test_post_without_app_secret_is_accepted_and_reported(client, monkeypatch):
    """Documented trade-off: without META_APP_SECRET the signature cannot be
    checked, so callbacks are accepted unsigned — and /health/ready says so."""
    c, fake = client
    add_developer(fake)
    _settings(monkeypatch, META_VERIFY_TOKEN=VERIFY_TOKEN, META_APP_SECRET="")
    fake.records["messages"]["m1"] = {
        "id": "m1", "owner": "usr1", "wa_message_id": "mock-abc123",
        "channel": "whatsapp", "status": "sent", "error": "",
    }

    r = _post(c, _status_payload(), secret=None)
    assert r.status_code == 200
    assert fake.records["messages"]["m1"]["status"] == "delivered"

    ready = c.get("/health/ready")
    assert ready.status_code == 200
    assert ready.json()["webhook"]["signature_check_enabled"] is False


# ---- POST body handling --------------------------------------------------


def test_post_signed_non_json_is_accepted(client, monkeypatch):
    """Signed but unparseable: 200, because Meta retrying could never help."""
    c, _ = client
    _settings(monkeypatch, META_VERIFY_TOKEN=VERIFY_TOKEN, META_APP_SECRET=APP_SECRET)

    body = b"not json at all"
    r = c.post(
        "/webhooks/whatsapp",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Hub-Signature-256": _sign(body),
        },
    )
    assert r.status_code == 200
    assert r.json()["ok"] is True


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"entry": []},
        {"entry": [{"changes": []}]},
        {"entry": [{"changes": [{"value": {}}]}]},
        {"entry": [{"changes": [{"value": {"statuses": []}}]}]},
        {"entry": "not-a-list"},
        {"entry": [None, 1, "x"]},
        {"entry": [{"changes": [{"value": {"statuses": [None, 5]}}]}]},
    ],
)
def test_post_malformed_payload_never_500s(client, monkeypatch, payload):
    """A payload shape we do not recognise must not raise: Meta would retry
    forever, and the retry would fail identically."""
    c, _ = client
    _settings(monkeypatch, META_VERIFY_TOKEN=VERIFY_TOKEN, META_APP_SECRET=APP_SECRET)

    r = _post(c, payload)
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert r.json()["applied"] == 0


def test_post_unknown_message_id_is_ignored(client, monkeypatch):
    c, fake = client
    _settings(monkeypatch, META_VERIFY_TOKEN=VERIFY_TOKEN, META_APP_SECRET=APP_SECRET)

    r = _post(c, _status_payload(message_id="wamid.something-we-never-sent"))
    assert r.status_code == 200
    assert r.json()["applied"] == 0


# ---- provider message ids are untrusted input ----


@pytest.mark.parametrize(
    "hostile_id",
    [
        "' || true || wa_message_id!='",  # filter-injection attempt
        "wamid.abc'",                      # unterminated literal
        "wamid.abc\\'",                    # escaped-quote attempt
        "wamid.abc && created>'2000-01-01 00:00:00'",
        "wamid.abc' || wa_message_id='mock-abc123",
        "",
        "x" * 129,                          # over the length cap
    ],
)
def test_post_drops_malformed_provider_message_id(client, monkeypatch, hostile_id):
    """A forged status.id must never reach the control-plane filter.

    With META_APP_SECRET unset (the local-dev default) an attacker can POST an
    unsigned callback, so the id is attacker-controlled input at that point.
    """
    c, fake = client
    add_developer(fake)
    _settings(monkeypatch, META_VERIFY_TOKEN=VERIFY_TOKEN, META_APP_SECRET="")
    fake.records["messages"]["m1"] = {
        "id": "m1", "owner": "usr1", "wa_message_id": "mock-abc123",
        "channel": "whatsapp", "status": "sent", "error": "",
    }

    r = _post(c, _status_payload(message_id=hostile_id, status="failed"), secret=None)
    assert r.status_code == 200
    assert r.json()["applied"] == 0
    # the real row was not touched by the injected filter
    assert fake.records["messages"]["m1"]["status"] == "sent"
    assert fake.records["messages"]["m1"]["error"] == ""


def test_post_still_accepts_realistic_wamid_shapes(client, monkeypatch):
    """The whitelist must not reject ids Meta actually sends."""
    c, fake = client
    add_developer(fake)
    _settings(monkeypatch, META_VERIFY_TOKEN=VERIFY_TOKEN, META_APP_SECRET=APP_SECRET)

    for i, real_id in enumerate(
        [
            "wamid.HBgMOTE5ODc2NTQzMjEwFQIAEhgg",
            "wamid.HBgMOTE5ODc2NTQzMjEwFQIAEhggABIAGBQyNkI0OEY=",
            "1234",  # telegram-shaped numeric id
        ]
    ):
        row_id = f"m{i}"
        fake.records["messages"][row_id] = {
            "id": row_id, "owner": "usr1", "wa_message_id": real_id,
            "channel": "whatsapp", "status": "sent", "error": "",
        }
        r = _post(c, _status_payload(message_id=real_id, status="delivered"))
        assert r.status_code == 200
        assert r.json()["applied"] == 1
        assert fake.records["messages"][row_id]["status"] == "delivered"


def test_pb_literal_rejects_filter_metacharacters():
    from app.services.pocketbase import pb_literal

    assert pb_literal("mock-abc123") == "'mock-abc123'"
    assert pb_literal("wamid.HBgM+/=") == "'wamid.HBgM+/='"
    with pytest.raises(ValueError):
        pb_literal("abc'def")
    with pytest.raises(ValueError):
        pb_literal("abc\\def")


def test_a_rejected_filter_value_never_becomes_a_5xx(client, monkeypatch):
    """Whatever goes wrong applying a status, Meta must see 200 — a 5xx here
    means Meta retries the same doomed callback forever."""
    c, fake = client
    add_developer(fake)
    _settings(monkeypatch, META_VERIFY_TOKEN=VERIFY_TOKEN, META_APP_SECRET=APP_SECRET)

    def boom(_value):
        raise ValueError("not safe to embed")

    monkeypatch.setattr("app.routers.whatsapp_webhook.pb_literal", boom)

    r = _post(c, _status_payload(status="delivered"))
    assert r.status_code == 200
    assert r.json() == {"ok": True, "events": 1, "applied": 0}


# ---- the settings row can supply the Meta credentials ----


def test_app_secret_from_the_settings_row_is_enforced(client, monkeypatch):
    """meta_app_secret_enc must actually be used, not just stored — otherwise
    rotating the secret from the admin UI would leave the webhook verifying
    against the old env value."""
    from app.core.security import encrypt_secret
    from app.services.settings import invalidate_settings_cache

    c, fake = client
    add_developer(fake)
    _settings(monkeypatch, META_VERIFY_TOKEN=VERIFY_TOKEN, META_APP_SECRET="")

    row_secret = "secret-from-the-settings-row"
    fake.records["settings"]["set1"]["meta_app_secret_enc"] = encrypt_secret(row_secret)
    invalidate_settings_cache()

    fake.records["messages"]["m1"] = {
        "id": "m1", "owner": "usr1", "wa_message_id": "mock-abc123",
        "channel": "whatsapp", "status": "sent", "error": "",
    }

    # signed with the row secret: accepted
    body = json.dumps(_status_payload(status="delivered")).encode()
    r = c.post("/webhooks/whatsapp", content=body, headers={
        "Content-Type": "application/json",
        "X-Hub-Signature-256": _sign(body, row_secret),
    })
    assert r.status_code == 200
    assert r.json()["applied"] == 1

    # unsigned: rejected, because a secret is now configured
    assert _post(c, _status_payload(status="read"), secret=None).status_code == 403


def test_verify_token_from_the_settings_row_completes_the_handshake(client, monkeypatch):
    """meta_verify_token was read by the merge but never existed as a collection
    field, so setting it in the admin UI silently did nothing."""
    from app.services.settings import invalidate_settings_cache

    c, fake = client
    _settings(monkeypatch, META_VERIFY_TOKEN="")

    fake.records["settings"]["set1"]["meta_verify_token"] = "row-verify-token"
    invalidate_settings_cache()

    r = c.get("/webhooks/whatsapp", params={
        "hub.mode": "subscribe",
        "hub.verify_token": "row-verify-token",
        "hub.challenge": "1158201444",
    })
    assert r.status_code == 200
    assert r.text == "1158201444"

    # a wrong token is still a rejection
    bad = c.get("/webhooks/whatsapp", params={
        "hub.mode": "subscribe",
        "hub.verify_token": "nope",
        "hub.challenge": "1158201444",
    })
    assert bad.status_code == 403


def test_health_ready_reports_the_merged_webhook_state(client, monkeypatch):
    """It must report what the app will actually do, not what env says."""
    from app.core.security import encrypt_secret
    from app.services.settings import invalidate_settings_cache

    c, fake = client
    _settings(monkeypatch, META_VERIFY_TOKEN="", META_APP_SECRET="")
    fake.records["settings"]["set1"]["meta_app_secret_enc"] = encrypt_secret("row-secret")
    fake.records["settings"]["set1"]["meta_verify_token"] = "row-verify-token"
    invalidate_settings_cache()

    body = c.get("/health/ready").json()
    assert body["webhook"]["signature_check_enabled"] is True
    assert body["webhook"]["verify_token_configured"] is True


def test_production_requires_app_secret_when_whatsapp_is_configured():
    from app.core.config import Settings

    base = dict(
        app_env="production",
        wotp_fernet_key="k" * 44,
        secret_key="s" * 32,
        pb_superuser_password="a-strong-password",
        wotp_mock_delivery=False,
    )

    # no WhatsApp credentials: nothing to verify, boots fine
    Settings(**base)

    # WhatsApp via env without an app secret: refused
    with pytest.raises(ValueError) as exc:
        Settings(**base, meta_phone_number_id="1000000000000001")
    assert "META_APP_SECRET" in str(exc.value)

    # same, but the secret is present: boots
    Settings(
        **base,
        meta_phone_number_id="1000000000000001",
        meta_app_secret="app-secret",
    )


def test_post_unmodelled_status_is_skipped(client, monkeypatch):
    """Meta sends statuses we do not model (e.g. "deleted"); writing one would
    violate the select field, so it must be skipped, not attempted."""
    c, fake = client
    add_developer(fake)
    _settings(monkeypatch, META_VERIFY_TOKEN=VERIFY_TOKEN, META_APP_SECRET=APP_SECRET)
    fake.records["messages"]["m1"] = {
        "id": "m1", "owner": "usr1", "wa_message_id": "mock-abc123",
        "channel": "whatsapp", "status": "sent", "error": "",
    }

    r = _post(c, _status_payload(status="deleted"))
    assert r.status_code == 200
    assert r.json()["applied"] == 0
    assert fake.records["messages"]["m1"]["status"] == "sent"


def test_post_failed_status_records_provider_error(client, monkeypatch):
    c, fake = client
    add_developer(fake)
    _settings(monkeypatch, META_VERIFY_TOKEN=VERIFY_TOKEN, META_APP_SECRET=APP_SECRET)
    fake.records["messages"]["m1"] = {
        "id": "m1", "owner": "usr1", "wa_message_id": "mock-abc123",
        "channel": "whatsapp", "status": "sent", "error": "",
    }

    r = _post(c, _status_payload(status="failed", error="Recipient not on WhatsApp"))
    assert r.status_code == 200
    row = fake.records["messages"]["m1"]
    assert row["status"] == "failed"
    assert "Recipient not on WhatsApp" in row["error"]


def test_late_duplicate_callback_does_not_reopen_a_terminal_state(client, monkeypatch):
    """Meta can deliver callbacks out of order; a stale "sent" must not roll a
    delivered message back."""
    c, fake = client
    add_developer(fake)
    _settings(monkeypatch, META_VERIFY_TOKEN=VERIFY_TOKEN, META_APP_SECRET=APP_SECRET)
    fake.records["messages"]["m1"] = {
        "id": "m1", "owner": "usr1", "wa_message_id": "mock-abc123",
        "channel": "whatsapp", "status": "read", "error": "",
    }

    r = _post(c, _status_payload(status="sent"))
    assert r.status_code == 200
    assert fake.records["messages"]["m1"]["status"] == "read"


def test_post_survives_pocketbase_failure(client, monkeypatch):
    """A control-plane error must not become a 5xx, or Meta retries the same
    doomed callback in a loop."""
    c, fake = client
    add_developer(fake)
    _settings(monkeypatch, META_VERIFY_TOKEN=VERIFY_TOKEN, META_APP_SECRET=APP_SECRET)

    async def boom(*args, **kwargs):
        from app.services.pocketbase import PocketBaseError
        raise PocketBaseError(500, "pb on fire")

    monkeypatch.setattr(fake, "list", boom)

    r = _post(c, _status_payload())
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert r.json()["applied"] == 0


def test_post_inbound_message_event_is_not_a_status(client, monkeypatch):
    """A user replying to the OTP is an inbound message, not a status change;
    it must not touch any messages row."""
    c, fake = client
    add_developer(fake)
    _settings(monkeypatch, META_VERIFY_TOKEN=VERIFY_TOKEN, META_APP_SECRET=APP_SECRET)
    fake.records["messages"]["m1"] = {
        "id": "m1", "owner": "usr1", "wa_message_id": "mock-abc123",
        "channel": "whatsapp", "status": "sent", "error": "",
    }

    payload = {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "messages": [
                                {"id": "wamid.inbound", "from": "919876543210",
                                 "text": {"body": "hello"}}
                            ]
                        }
                    }
                ]
            }
        ]
    }
    r = _post(c, payload)
    assert r.status_code == 200
    assert r.json()["applied"] == 0
    assert fake.records["messages"]["m1"]["status"] == "sent"
