import hashlib

from conftest import AUTH, TEST_KEY, add_developer


def send(client, payload=None, headers=AUTH):
    payload = payload or {"to": "919876543210"}
    return client.post("/v1/otp/send", json=payload, headers=headers)


def test_health(client):
    c, _fake = client
    r = c.get("/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["pb"] is True
    assert body["mock_delivery"] is True


def test_send_whatsapp_happy_path(client):
    c, fake = client
    add_developer(fake)
    r = send(client=c, payload={"to": "+91 98765 43210"})
    assert r.status_code == 200
    body = r.json()
    assert body == {
        "ok": True,
        "channel": "whatsapp",
        "request_id": body["request_id"],
        "message_id": body["message_id"],
        "expires_in": 300,
        "used": 1,
        "limit": 500,
        "reset_utc": body["reset_utc"],
    }
    assert body["reset_utc"].endswith("T00:00:00Z")

    # audit row written; response links to it
    messages = list(fake.records["messages"].values())
    assert len(messages) == 1
    assert messages[0]["phone"] == "919876543210"
    assert messages[0]["status"] == "sent"
    assert messages[0]["wa_message_id"].startswith("mock-")
    assert body["request_id"] == messages[0]["id"]
    assert body["message_id"] == messages[0]["wa_message_id"]

    # exactly one hashed code stored; plaintext never returned anywhere
    codes = list(fake.records["otp_codes"].values())
    assert len(codes) == 1
    assert len(codes[0]["code_hash"]) == 64
    assert "code" not in body and "code_hash" not in body


def test_send_custom_code_and_verify_roundtrip(client):
    c, fake = client
    add_developer(fake)
    r = send(client=c, payload={"to": "919876543210", "code": "135790"})
    assert r.status_code == 200

    v = c.post(
        "/v1/otp/verify",
        json={"to": "+91 98765 43210", "code": "135790"},  # different formatting, same phone
        headers=AUTH,
    )
    assert v.status_code == 200
    assert v.json() == {"ok": True, "verified": True}
    # single-use: code row deleted on success
    assert not fake.records["otp_codes"]


def test_verify_wrong_then_exhausted(client):
    c, fake = client
    add_developer(fake)
    send(client=c)

    # 1st wrong -> 2 attempts left
    v1 = c.post("/v1/otp/verify", json={"to": "919876543210", "code": "000000"}, headers=AUTH)
    assert v1.status_code == 400
    assert v1.json()["error"] == "wrong_code"
    assert v1.json()["attempts_left"] == 2

    # 2nd wrong -> 1 left
    v2 = c.post("/v1/otp/verify", json={"to": "919876543210", "code": "000001"}, headers=AUTH)
    assert v2.json()["attempts_left"] == 1

    # 3rd wrong -> code deleted
    v3 = c.post("/v1/otp/verify", json={"to": "919876543210", "code": "000002"}, headers=AUTH)
    assert v3.status_code == 400
    assert v3.json()["error"] == "too_many_attempts"
    assert v3.json()["attempts_left"] == 0
    assert not fake.records["otp_codes"]

    # afterwards: nothing to verify -> ask to resend
    v4 = c.post("/v1/otp/verify", json={"to": "919876543210", "code": "000003"}, headers=AUTH)
    assert v4.json()["error"] == "code_expired"


def test_verify_expired_code(client):
    c, fake = client
    add_developer(fake)
    fake.records["otp_codes"]["old"] = {
        "id": "old", "owner": "usr1", "api_key": "key1",
        "phone": "919876543210",
        "code_hash": hashlib.sha256(b"654321").hexdigest(),
        "expires": "2020-01-01 00:00:00",  # long past
        "attempts": 0,
        "created": "2020-01-01 00:00:00.000Z",
    }
    v = c.post("/v1/otp/verify", json={"to": "919876543210", "code": "654321"}, headers=AUTH)
    assert v.status_code == 400
    assert v.json()["error"] == "code_expired"


def test_send_monthly_quota_blocks(client):
    c, fake = client
    add_developer(fake)
    fake.records["settings"]["set1"]["monthly_send_quota"] = 2

    assert send(client=c).status_code == 200
    assert send(client=c, payload={"to": "919876543210", "code": "111111"}).status_code == 200
    r = send(client=c, payload={"to": "919876543210", "code": "222222"})
    assert r.status_code == 429
    body = r.json()
    assert body["error"] == "quota_exceeded"
    assert body["used"] == 2
    assert body["limit"] == 2
    # Retry-After points at the monthly reset (min 60s)
    assert int(r.headers["Retry-After"]) >= 60

    # failed attempts never add messages rows
    assert len(fake.records["messages"]) == 2


def test_failed_delivery_never_consumes_quota(client, monkeypatch):
    c, fake = client
    add_developer(fake)
    from app.core.config import get_settings
    from app.core.security import encrypt_secret

    # real (live) configuration: meta settings present and decryptable
    fake.records["settings"]["set1"]["meta_phone_number_id"] = "PN123"
    fake.records["settings"]["set1"]["meta_token_enc"] = encrypt_secret("REALMETA")

    # turn mock delivery off for this test and force a Meta failure
    monkeypatch.setenv("WAOTP_MOCK_DELIVERY", "0")
    get_settings.cache_clear()

    async def boom(*args, **kwargs):
        from app.providers import ProviderError
        raise ProviderError('{"error": {"message": "template not approved"}}')

    monkeypatch.setattr("app.providers.meta.MetaProvider.send_otp", boom)

    r = send(client=c)
    assert r.status_code == 502
    body = r.json()
    assert body["ok"] is False
    assert body["error"] == "delivery_failed"
    # an HTTP rejection is NOT retryable (no transient failure involved)
    assert body["retryable"] is False

    # failure logged for audit...
    msgs = list(fake.records["messages"].values())
    assert len(msgs) == 1 and msgs[0]["status"] == "failed"
    assert "template not approved" in msgs[0]["error"]
    # ...but no otp code stored and quota not consumed
    assert not fake.records["otp_codes"]


def test_per_phone_hourly_throttle(client):
    c, fake = client
    add_developer(fake)
    for i in range(5):
        assert send(client=c, payload={"to": "919876543210", "code": f"10000{i}"}).status_code == 200
    r = send(client=c, payload={"to": "919876543210", "code": "999999"})
    assert r.status_code == 429
    assert r.json()["error"] == "phone_throttled"
    assert r.headers["Retry-After"] == "3600"

    # a different phone is unaffected
    assert send(client=c, payload={"to": "919888888888", "code": "888888"}).status_code == 200


def test_send_auth_errors(client):
    c, fake = client
    add_developer(fake)

    assert send(client=c, headers={}).status_code == 401
    assert send(client=c, headers={"X-Api-Key": "waotp_wrong"}).status_code == 401

    fake.records["api_keys"]["key1"]["active"] = False
    from app import dependencies
    dependencies._api_key_cache.clear()
    r = send(client=c)
    assert r.status_code == 403
    assert r.json()["error"] == "key_disabled"

    # suspended developer is blocked too
    fake.records["api_keys"]["key1"]["active"] = True
    fake.records["users"]["usr1"]["status"] = "suspended"
    dependencies._api_key_cache.clear()
    assert send(client=c).status_code == 403


def test_send_validation(client):
    c, fake = client
    add_developer(fake)
    assert send(client=c, payload={"to": "12"}).status_code == 400
    assert send(client=c, payload={"to": "919876543210", "channel": "pigeon"}).status_code == 400
    assert send(client=c, payload={"to": "919876543210", "code": "12"}).status_code == 400  # too short
    assert send(client=c, payload={"to": "919876543210", "code": "12345678901"}).status_code == 400


def test_usage_endpoint(client):
    c, fake = client
    add_developer(fake)
    send(client=c)
    r = c.get("/v1/otp/usage", headers=AUTH)
    assert r.status_code == 200
    body = r.json()
    assert body["used"] == 1
    assert body["limit"] == 500
    assert body["reset_utc"].endswith("T00:00:00Z")


# ---- Idempotency-Key on /v1/otp/send ----


def test_send_idempotency_replays_original_response(client):
    c, fake = client
    add_developer(fake)
    hdrs = {**AUTH, "Idempotency-Key": "order-123"}

    first = send(client=c, headers=hdrs)
    assert first.status_code == 200
    second = send(client=c, headers=hdrs)
    assert second.status_code == 200
    assert second.json() == first.json()
    assert second.headers.get("Idempotency-Replayed") == "true"
    assert first.headers.get("Idempotency-Replayed") is None

    # the replay did not double-send: one audit row, one stored code
    assert len(fake.records["messages"]) == 1
    assert len(fake.records["otp_codes"]) == 1


def test_send_idempotency_scoped_per_key_value(client):
    c, fake = client
    add_developer(fake)
    r1 = send(client=c, headers={**AUTH, "Idempotency-Key": "a"})
    r2 = send(client=c, headers={**AUTH, "Idempotency-Key": "b"})
    assert r1.json()["request_id"] != r2.json()["request_id"]
    assert len(fake.records["messages"]) == 2


def test_send_idempotency_replay_expires_with_the_code(client):
    c, fake = client
    add_developer(fake)
    hdrs = {**AUTH, "Idempotency-Key": "k1"}

    first = send(client=c, headers=hdrs)
    # backdate the cache entry past the code TTL (300 s in test settings)
    from app import dependencies
    entry = ("key1", "k1")
    _expires, body = dependencies.idempotency_store._entries[entry]
    dependencies.idempotency_store._entries[entry] = (0.0, body)

    second = send(client=c, headers=hdrs)
    assert second.status_code == 200
    assert second.json()["request_id"] != first.json()["request_id"]
    assert "Idempotency-Replayed" not in second.headers
    assert len(fake.records["messages"]) == 2  # a fresh code was really sent


def test_send_idempotency_invalid_header_is_400(client):
    c, fake = client
    add_developer(fake)
    r = send(client=c, headers={**AUTH, "Idempotency-Key": "bad key with spaces"})
    assert r.status_code == 400
    assert r.json()["error"] == "invalid_request"
    assert "Idempotency-Key" in r.json()["detail"]
    assert not fake.records["messages"]  # nothing was sent


def test_send_idempotency_failures_are_not_cached(client):
    c, fake = client
    add_developer(fake)
    hdrs = {**AUTH, "Idempotency-Key": "k1"}

    # unlinked telegram phone -> 409; the failure must NOT be cached
    r1 = send(client=c, payload={"to": "919876543210", "channel": "telegram"}, headers=hdrs)
    assert r1.status_code == 409

    # the phone gets linked; the same Idempotency-Key now delivers for real
    fake.records["tg_links"]["l1"] = {
        "id": "l1", "phone": "919876543210", "chat_id": "555", "tg_user_id": "42",
    }
    r2 = send(client=c, payload={"to": "919876543210", "channel": "telegram"}, headers=hdrs)
    assert r2.status_code == 200
    assert "Idempotency-Replayed" not in r2.headers
    assert len(fake.records["messages"]) == 1  # the 409 wrote nothing


def test_send_idempotency_replay_beats_throttle(client):
    c, fake = client
    add_developer(fake)
    fake.records["settings"]["set1"]["per_phone_hourly"] = 1
    from app.services.settings import invalidate_settings_cache
    invalidate_settings_cache()

    hdrs = {**AUTH, "Idempotency-Key": "k1"}
    assert send(client=c, headers=hdrs).status_code == 200
    # the retry is a duplicate of a request that already succeeded — it must
    # replay the original 200, not be throttled
    r = send(client=c, headers=hdrs)
    assert r.status_code == 200
    assert r.headers.get("Idempotency-Replayed") == "true"


def test_per_key_rate_limit(client):
    c, fake = client
    add_developer(fake)
    fake.records["settings"]["set1"]["ratelimit_per_min"] = 2
    from app.services.settings import invalidate_settings_cache
    invalidate_settings_cache()

    assert send(client=c).status_code == 200
    assert send(client=c, payload={"to": "919876543210", "code": "111111"}).status_code == 200
    r = send(client=c, payload={"to": "919876543210", "code": "222222"})
    assert r.status_code == 429
    assert r.json()["error"] == "rate_limited"
    assert r.headers["Retry-After"] == "60"


# ---- per-IP limiter runs BEFORE authentication ----


def test_ip_rate_limit_applies_without_any_credential(client):
    """The per-IP gate must cover a caller with no valid credential at all —
    otherwise the only limit on unauthenticated traffic is nothing."""
    c, fake = client
    fake.records["settings"]["set1"]["ratelimit_per_ip_per_min"] = 1
    from app.services.settings import invalidate_settings_cache
    invalidate_settings_cache()

    assert send(client=c, headers={}).status_code == 401  # no key at all
    r = send(client=c, headers={})
    assert r.status_code == 429
    assert r.json()["error"] == "rate_limited"
    assert r.headers["Retry-After"] == "60"


def test_ip_rate_limit_applies_to_invented_keys(client):
    """A flood of made-up keys must hit the IP ceiling, not sail past it."""
    c, fake = client
    fake.records["settings"]["set1"]["ratelimit_per_ip_per_min"] = 2
    from app.services.settings import invalidate_settings_cache
    invalidate_settings_cache()

    hdrs = {"X-Api-Key": "waotp_0000000000000000000000000000000000000000"}
    assert send(client=c, headers=hdrs).status_code == 401
    assert send(client=c, headers=hdrs).status_code == 401
    assert send(client=c, headers=hdrs).status_code == 429


def test_unknown_api_key_is_negatively_cached(client, monkeypatch):
    """Repeating an unknown key must not repeat the control-plane lookup."""
    c, fake = client
    add_developer(fake)

    lookups = []
    original_list = fake.list

    async def counting_list(collection, **kwargs):
        if collection == "api_keys":
            lookups.append(collection)
        return await original_list(collection, **kwargs)

    monkeypatch.setattr(fake, "list", counting_list)

    bad = {"X-Api-Key": "waotp_this-key-does-not-exist-00000000000"}
    for _ in range(4):
        assert send(client=c, headers=bad).status_code == 401
    assert len(lookups) == 1


def test_negative_cache_is_bounded(client):
    """The negative cache itself must not be growable without limit."""
    from app import dependencies

    now = 1_000_000.0
    for i in range(dependencies._UNKNOWN_KEY_MAX + 500):
        dependencies._remember_unknown(f"hash-{i}", now)
    assert len(dependencies._unknown_key_cache) <= dependencies._UNKNOWN_KEY_MAX


def test_forwarded_header_is_ignored_unless_proxy_is_trusted(client, monkeypatch):
    c, fake = client
    add_developer(fake)
    from app import dependencies
    from app.core.config import get_settings

    monkeypatch.setenv("TRUST_PROXY_HEADERS", "0")
    get_settings.cache_clear()

    assert send(client=c, headers={**AUTH, "X-Forwarded-For": "1.2.3.4"}).status_code == 200
    assert "1.2.3.4" not in dependencies._ip_rate_limiter._hits
    assert "testclient" in dependencies._ip_rate_limiter._hits


def test_forwarded_header_uses_rightmost_entry_when_trusted(client, monkeypatch):
    """The right-most entry is the one the nearest proxy appended; the left
    side is client-controlled and must not become the limiter bucket."""
    c, fake = client
    add_developer(fake)
    from app import dependencies
    from app.core.config import get_settings

    monkeypatch.setenv("TRUST_PROXY_HEADERS", "1")
    get_settings.cache_clear()

    r = send(client=c, headers={**AUTH, "X-Forwarded-For": "1.2.3.4, 5.6.7.8"})
    assert r.status_code == 200
    assert "5.6.7.8" in dependencies._ip_rate_limiter._hits
    assert "1.2.3.4" not in dependencies._ip_rate_limiter._hits


def test_unparseable_forwarded_header_falls_back_to_socket_peer(client, monkeypatch):
    """A junk header must not mint a fresh limiter bucket per request."""
    c, fake = client
    add_developer(fake)
    from app import dependencies
    from app.core.config import get_settings

    monkeypatch.setenv("TRUST_PROXY_HEADERS", "1")
    get_settings.cache_clear()

    assert send(client=c, headers={**AUTH, "X-Forwarded-For": "not-an-ip"}).status_code == 200
    assert "not-an-ip" not in dependencies._ip_rate_limiter._hits
    assert "testclient" in dependencies._ip_rate_limiter._hits


def test_telegram_not_linked_then_linked(client):
    c, fake = client
    add_developer(fake)

    r = send(client=c, payload={"to": "919876543210", "channel": "telegram"})
    assert r.status_code == 409
    body = r.json()
    assert body["error"] == "user_not_linked"
    assert body["link_url"].startswith("https://t.me/waotp_test_bot?start=")
    assert not fake.records["messages"]  # nothing sent, nothing logged as sent

    # user links via the bot -> tg_links row appears
    fake.records["tg_links"]["link1"] = {
        "id": "link1", "phone": "919876543210", "chat_id": "777", "tg_user_id": "777",
    }
    r2 = send(client=c, payload={"to": "919876543210", "channel": "telegram"})
    assert r2.status_code == 200
    assert r2.json()["channel"] == "telegram"
    msgs = list(fake.records["messages"].values())
    assert msgs[0]["channel"] == "telegram"


def test_error_shape_is_consistent(client):
    c, fake = client
    r = send(client=c, headers={})
    body = r.json()
    assert body["ok"] is False and body["error"] == "invalid_api_key"

    add_developer(fake)
    r = c.post("/v1/otp/send", json={"nope": 1}, headers=AUTH)  # missing "to"
    assert r.status_code == 400  # PRD: 400 for bad input, not 422
    assert r.json()["error"] == "invalid_request"


# ---- P0: telegram must not be blocked by (or consume) whatsapp quota ----


def test_telegram_bypasses_whatsapp_quota(client):
    """PRD §7: Telegram OTP is unlimited — a maxed-out WhatsApp quota must not
    block telegram sends, and telegram sends must not consume quota."""
    c, fake = client
    add_developer(fake)
    fake.records["settings"]["set1"]["monthly_send_quota"] = 1
    fake.records["tg_links"]["link1"] = {
        "id": "link1", "phone": "919876543210", "chat_id": "777", "tg_user_id": "555",
    }

    # exhaust the whatsapp quota (1/month)
    assert send(client=c).status_code == 200
    r_wa = send(client=c, payload={"to": "919876543210", "code": "222222"})
    assert r_wa.status_code == 429
    assert r_wa.json()["error"] == "quota_exceeded"

    # telegram send still succeeds and does NOT increment reported usage
    r_tg = send(client=c, payload={"to": "919876543210", "channel": "telegram"})
    assert r_tg.status_code == 200
    body = r_tg.json()
    assert body["channel"] == "telegram"
    assert body["used"] == 1  # current whatsapp used, NOT incremented
    assert body["limit"] == 1
    assert body["request_id"]  # linked to the telegram audit row

    # telegram rows don't count towards the whatsapp quota either
    usage = c.get("/v1/otp/usage", headers=AUTH).json()
    assert usage["used"] == 1
    tg_rows = [m for m in fake.records["messages"].values() if m["channel"] == "telegram"]
    assert len(tg_rows) == 1


# ---- P0: verify double-spend ----


def test_verify_no_double_spend(client, monkeypatch):
    """Two concurrent verifies of the same code: exactly one wins."""
    import asyncio
    import hashlib
    import threading
    from datetime import datetime, timedelta, timezone

    c, fake = client
    add_developer(fake)
    code = "123456"
    future = (datetime.now(timezone.utc) + timedelta(minutes=5)).strftime("%Y-%m-%d %H:%M:%S")
    fake.records["otp_codes"]["otp1"] = {
        "id": "otp1", "owner": "usr1", "api_key": "key1", "phone": "919876543210",
        "code_hash": hashlib.sha256(code.encode()).hexdigest(),
        "expires": future, "attempts": 0,
    }

    import app.routers.otp as otp_router

    real_verify = otp_router.verify_otp

    async def slow_verify(*args, **kwargs):
        await asyncio.sleep(0.05)  # widen the race window
        return await real_verify(*args, **kwargs)

    monkeypatch.setattr(otp_router, "verify_otp", slow_verify)

    barrier = threading.Barrier(2)
    statuses = []

    def hit():
        barrier.wait()
        r = c.post("/v1/otp/verify", json={"to": "919876543210", "code": code}, headers=AUTH)
        statuses.append(r.status_code)

    threads = [threading.Thread(target=hit) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sorted(statuses) == [200, 400]
    # the single-use row is gone — no code left to re-verify
    assert not fake.records["otp_codes"]


# ---- P1: per-key send lock (send race) ----


def test_concurrent_sends_cannot_exceed_quota(client, monkeypatch):
    """Per-key lock serializes send: with a quota of 1, two concurrent sends
    yield exactly one success, never two over-quota deliveries."""
    import asyncio
    import threading

    from app.core.config import get_settings
    from app.core.security import encrypt_secret

    c, fake = client
    add_developer(fake)
    fake.records["settings"]["set1"]["monthly_send_quota"] = 1
    fake.records["settings"]["set1"]["meta_phone_number_id"] = "PN123"
    fake.records["settings"]["set1"]["meta_token_enc"] = encrypt_secret("REALMETA")

    monkeypatch.setenv("WAOTP_MOCK_DELIVERY", "0")
    get_settings.cache_clear()

    async def slow_send(*args, **kwargs):
        await asyncio.sleep(0.05)  # hold the lock across the provider await
        return "prov-msg-1"

    monkeypatch.setattr("app.providers.meta.MetaProvider.send_otp", slow_send)

    barrier = threading.Barrier(2)
    statuses = []

    def hit():
        barrier.wait()
        r = c.post("/v1/otp/send", json={"to": "919876543210"}, headers=AUTH)
        statuses.append(r.status_code)

    threads = [threading.Thread(target=hit) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sorted(statuses) == [200, 429]
    assert len(fake.records["messages"]) == 1  # exactly one ledger row


def test_two_keys_of_one_owner_cannot_double_spend_quota(client, monkeypatch):
    """The cap and the throttle are owner-scoped, so the lock must be too.

    Reproduces the gap this replaces: the send lock was keyed on the API key
    id, so two concurrent sends on two different keys belonging to the same
    owner each passed the quota check before either wrote its ledger row — and
    both delivered, over cap.
    """
    import asyncio
    import threading

    from app.core.config import get_settings
    from app.core.security import encrypt_secret, sha256_hex

    c, fake = client
    add_developer(fake)

    second_key = "waotp_secondkey000000000000000000000000000"
    fake.records["api_keys"]["key2"] = {
        "id": "key2", "owner": "usr1", "key_hash": sha256_hex(second_key),
        "last4": second_key[-4:], "label": "second", "active": True,
    }
    fake.records["settings"]["set1"]["monthly_send_quota"] = 1
    fake.records["settings"]["set1"]["meta_phone_number_id"] = "PN123"
    fake.records["settings"]["set1"]["meta_token_enc"] = encrypt_secret("REALMETA")

    monkeypatch.setenv("WAOTP_MOCK_DELIVERY", "0")
    get_settings.cache_clear()

    async def slow_send(*args, **kwargs):
        await asyncio.sleep(0.05)  # hold the lock across the provider await
        return "prov-msg-1"

    monkeypatch.setattr("app.providers.meta.MetaProvider.send_otp", slow_send)

    barrier = threading.Barrier(2)
    statuses = []

    def hit(key):
        barrier.wait()
        r = c.post("/v1/otp/send", json={"to": "919876543210"}, headers={"X-Api-Key": key})
        statuses.append(r.status_code)

    threads = [
        threading.Thread(target=hit, args=(TEST_KEY,)),
        threading.Thread(target=hit, args=(second_key,)),
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sorted(statuses) == [200, 429]
    assert len(fake.records["messages"]) == 1  # exactly one ledger row


def test_two_keys_of_one_owner_share_the_phone_throttle(client, monkeypatch):
    """Same gap, via the per-phone throttle rather than the monthly cap."""
    import asyncio
    import threading

    from app.core.config import get_settings
    from app.core.security import encrypt_secret, sha256_hex

    c, fake = client
    add_developer(fake)

    second_key = "waotp_secondkey000000000000000000000000001"
    fake.records["api_keys"]["key2"] = {
        "id": "key2", "owner": "usr1", "key_hash": sha256_hex(second_key),
        "last4": second_key[-4:], "label": "second", "active": True,
    }
    # cap off; the throttle is the only limit under test
    fake.records["settings"]["set1"]["monthly_send_quota"] = 0
    fake.records["settings"]["set1"]["per_phone_hourly"] = 1
    fake.records["settings"]["set1"]["meta_phone_number_id"] = "PN123"
    fake.records["settings"]["set1"]["meta_token_enc"] = encrypt_secret("REALMETA")

    monkeypatch.setenv("WAOTP_MOCK_DELIVERY", "0")
    get_settings.cache_clear()

    async def slow_send(*args, **kwargs):
        await asyncio.sleep(0.05)
        return "prov-msg-1"

    monkeypatch.setattr("app.providers.meta.MetaProvider.send_otp", slow_send)

    barrier = threading.Barrier(2)
    statuses = []

    def hit(key):
        barrier.wait()
        r = c.post("/v1/otp/send", json={"to": "919876543210"}, headers={"X-Api-Key": key})
        statuses.append(r.status_code)

    threads = [
        threading.Thread(target=hit, args=(TEST_KEY,)),
        threading.Thread(target=hit, args=(second_key,)),
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sorted(statuses) == [200, 429]
    assert len(fake.records["messages"]) == 1


# ---- P1: malformed JSON must 400, not 500 ----


def test_malformed_json_body_is_400(client):
    c, fake = client
    add_developer(fake)
    r = c.post(
        "/v1/otp/send",
        content="not-json{",
        headers={"Content-Type": "application/json", **AUTH},
    )
    assert r.status_code == 400  # NOT 500
    body = r.json()  # response must be JSON-serializable
    assert body["ok"] is False and body["error"] == "invalid_request"
    # whitelisted detail: no raw pydantic entries, no input echo
    for entry in body["detail"]:
        assert set(entry) == {"loc", "msg", "type"}


def test_validation_detail_is_whitelisted(client):
    c, fake = client
    add_developer(fake)
    r = c.post("/v1/otp/send", json={"nope": 1}, headers=AUTH)  # missing "to"
    assert r.status_code == 400
    body = r.json()
    assert body["error"] == "invalid_request"
    assert body["detail"] and set(body["detail"][0]) == {"loc", "msg", "type"}
    assert body["detail"][0]["loc"][-1] == "to"


# ---- P1: upstream/unhandled error contract ----


def test_health_pb_unreachable_is_503(client):
    c, _fake = client
    from app.services.pocketbase import PocketBaseError

    class BrokenPB:
        async def list(self, *args, **kwargs):
            raise PocketBaseError(500, "pb exploded")

    c.app.state.pb = BrokenPB()
    r = c.get("/v1/health")
    assert r.status_code == 503
    assert r.json() == {"ok": False, "error": "upstream_unavailable"}


def test_pocketbase_outage_is_503_not_500(client, monkeypatch):
    c, fake = client
    add_developer(fake)
    from app.services.pocketbase import PocketBaseError

    async def pb_down(*args, **kwargs):
        raise PocketBaseError(500, "pb down")

    monkeypatch.setattr("app.routers.otp.monthly_used", pb_down)
    r = c.get("/v1/otp/usage", headers=AUTH)
    assert r.status_code == 503
    assert r.json() == {"ok": False, "error": "upstream_unavailable"}


def test_unhandled_exception_is_500_internal_error(client, monkeypatch):
    from fastapi.testclient import TestClient

    c, fake = client
    add_developer(fake)

    async def boom(*args, **kwargs):
        raise RuntimeError("unexpected bug")

    monkeypatch.setattr("app.routers.otp.monthly_used", boom)
    # ServerErrorMiddleware re-raises after responding; disable that to assert
    # the sanitized body a real server would send.
    raw = TestClient(c.app, raise_server_exceptions=False)
    r = raw.get("/v1/otp/usage", headers=AUTH)
    assert r.status_code == 500
    assert r.json() == {"ok": False, "error": "internal_error"}


# ---- P1: delivery_failed.retryable ----


def test_delivery_failed_retryable_on_meta_timeout(client, monkeypatch):
    c, fake = client
    add_developer(fake)
    from app.core.config import get_settings
    from app.core.security import encrypt_secret

    fake.records["settings"]["set1"]["meta_phone_number_id"] = "PN123"
    fake.records["settings"]["set1"]["meta_token_enc"] = encrypt_secret("REALMETA")
    monkeypatch.setenv("WAOTP_MOCK_DELIVERY", "0")
    get_settings.cache_clear()

    async def timeout(*args, **kwargs):
        from app.providers import ProviderError
        raise ProviderError("meta unreachable: ConnectTimeout", retryable=True)

    monkeypatch.setattr("app.providers.meta.MetaProvider.send_otp", timeout)
    r = send(client=c)
    assert r.status_code == 502
    body = r.json()
    assert body["error"] == "delivery_failed"
    assert body["retryable"] is True  # transient: safe to retry
    assert len(fake.records["messages"]) == 1  # failure still audited


def test_delivery_failed_retryable_on_telegram_timeout(client, monkeypatch):
    c, fake = client
    add_developer(fake)
    from app.core.config import get_settings

    fake.records["tg_links"]["link1"] = {
        "id": "link1", "phone": "919876543210", "chat_id": "777", "tg_user_id": "555",
    }
    monkeypatch.setenv("WAOTP_MOCK_DELIVERY", "0")
    get_settings.cache_clear()

    async def timeout(*args, **kwargs):
        from app.services.telegram import TelegramError
        raise TelegramError("telegram unreachable: ReadTimeout", retryable=True)

    monkeypatch.setattr("app.services.telegram.send_message", timeout)
    r = send(client=c, payload={"to": "919876543210", "channel": "telegram"})
    assert r.status_code == 502
    assert r.json()["retryable"] is True
    msgs = list(fake.records["messages"].values())
    assert msgs[0]["status"] == "failed" and msgs[0]["channel"] == "telegram"


# ---- P1: ledger write failure after successful delivery ----


def test_ledger_write_failure_returns_502_and_logs(client, monkeypatch, caplog):
    """Known limitation: delivery succeeded but the audit/code rows could not
    be written -> 502 (not retryable) + critical log with wa_message_id."""
    import logging

    from app.services.pocketbase import PocketBaseError
    from conftest import FakePB

    c, fake = client
    add_developer(fake)

    original_create = FakePB.create

    async def create_fails(self, collection, data):
        if collection == "messages":  # only the post-delivery audit write fails
            raise PocketBaseError(500, "pb write failed")
        return await original_create(self, collection, data)

    monkeypatch.setattr(FakePB, "create", create_fails)
    with caplog.at_level(logging.CRITICAL, logger="waotp"):
        r = send(client=c)
    assert r.status_code == 502
    body = r.json()
    assert body["error"] == "delivery_failed"
    assert body["retryable"] is False  # retrying would double-send
    assert not fake.records["messages"] and not fake.records["otp_codes"]
    assert any("wa_message_id=mock-" in rec.getMessage() for rec in caplog.records)


def test_old_otp_invalidated_on_resend(client):
    """Sending a new OTP invalidates the previous active OTP for that phone."""
    c, fake = client
    add_developer(fake)

    # First send with custom code 111111
    r1 = send(client=c, payload={"to": "919876543210", "code": "111111"})
    assert r1.status_code == 200

    # Second send with custom code 222222
    r2 = send(client=c, payload={"to": "919876543210", "code": "222222"})
    assert r2.status_code == 200

    # Old code 111111 cannot be verified
    v1 = c.post("/v1/otp/verify", json={"to": "919876543210", "code": "111111"}, headers=AUTH)
    assert v1.status_code == 400
    assert v1.json()["verified"] is False

    # New code 222222 verifies successfully
    v2 = c.post("/v1/otp/verify", json={"to": "919876543210", "code": "222222"}, headers=AUTH)
    assert v2.status_code == 200
    assert v2.json()["verified"] is True

