from conftest import add_developer

USER_TOKEN = {"Authorization": "Bearer valid-pb-token"}


def setup_auth_user(fake):
    user = add_developer(fake)
    fake.auth_user = dict(user)


def test_issue_key_returns_plaintext_once(client):
    c, fake = client
    setup_auth_user(fake)
    r = c.post("/v1/keys", json={"label": "prod"}, headers=USER_TOKEN)
    assert r.status_code == 201
    body = r.json()
    assert body["api_key"].startswith("waotp_")
    assert body["last4"] == body["api_key"][-4:]
    assert body["label"] == "prod"

    # stored record has only the hash
    row = fake.records["api_keys"][body["id"]]
    assert row["key_hash"] != body["api_key"]
    assert len(row["key_hash"]) == 64
    assert "key_hash" not in body

    # list shows masked keys only (seeded dev key + the one just issued)
    lst = c.get("/v1/keys", headers=USER_TOKEN).json()
    assert len(lst["keys"]) == 2
    k = next(k for k in lst["keys"] if k["id"] == body["id"])
    assert k["last4"] == body["last4"]
    for k in lst["keys"]:
        assert "key_hash" not in k and "api_key" not in k


def test_issue_key_requires_pb_user_token(client):
    c, fake = client
    setup_auth_user(fake)
    assert c.post("/v1/keys", json={}).status_code == 401
    assert c.post("/v1/keys", json={}, headers={"Authorization": "bearer wrong"}).status_code == 401

    fake.auth_fail = True
    r = c.post("/v1/keys", json={}, headers=USER_TOKEN)
    assert r.status_code == 401
    assert r.json()["error"] == "invalid_user_token"


def test_regenerate_deactivates_old_keys(client):
    c, fake = client
    setup_auth_user(fake)
    first = c.post("/v1/keys", json={"label": "a"}, headers=USER_TOKEN).json()
    second = c.post("/v1/keys", json={"label": "b"}, headers=USER_TOKEN).json()

    r = c.post("/v1/keys/regenerate", json={"label": "c"}, headers=USER_TOKEN)
    assert r.status_code == 200
    new = r.json()
    assert new["api_key"] != first["api_key"]

    keys = {k["id"]: k for k in c.get("/v1/keys", headers=USER_TOKEN).json()["keys"]}
    active = [k for k in keys.values() if k["active"]]
    assert len(active) == 1 and active[0]["id"] == new["id"]

    # the old keys stop working immediately (cache cleared by fixture only —
    # resolve_api_key never cached them because they were valid; force re-check
    # by clearing the in-memory cache the way a restart would)
    from app import dependencies
    dependencies._api_key_cache.clear()
    old_key_hash = first["api_key"]
    r = c.post("/v1/otp/send", json={"to": "919876543210"}, headers={"X-Api-Key": old_key_hash})
    assert r.status_code == 401 or r.status_code == 403


def test_dashboard_usage(client):
    c, fake = client
    setup_auth_user(fake)
    r = c.get("/v1/usage", headers=USER_TOKEN)
    assert r.status_code == 200
    body = r.json()
    assert body == {"used": 0, "limit": 500, "reset_utc": body["reset_utc"]}


# ---- key cap + deactivate + cache invalidation ----


def test_issue_key_cap_five_active(client):
    c, fake = client
    setup_auth_user(fake)
    fake.records["api_keys"]["key1"]["active"] = False  # start from zero active
    issued = [
        c.post("/v1/keys", json={"label": f"k{i}"}, headers=USER_TOKEN).json()["id"]
        for i in range(5)
    ]
    assert len(issued) == 5

    r = c.post("/v1/keys", json={"label": "6th"}, headers=USER_TOKEN)
    assert r.status_code == 409
    assert r.json() == {"ok": False, "error": "key_limit_reached"}

    # deactivating one (by hand) frees a slot again
    fake.records["api_keys"][issued[0]]["active"] = False
    assert c.post("/v1/keys", json={"label": "again"}, headers=USER_TOKEN).status_code == 201


def test_deactivate_key_is_owner_scoped(client):
    c, fake = client
    setup_auth_user(fake)
    from app import dependencies
    from app.core.security import sha256_hex

    issued = c.post("/v1/keys", json={"label": "mine"}, headers=USER_TOKEN).json()
    fake.records["users"]["usr2"] = {
        "id": "usr2", "email": "other@example.com", "status": "active",
    }
    fake.records["api_keys"]["other1"] = {
        "id": "other1", "owner": "usr2", "key_hash": "f" * 64, "last4": "abcd",
        "label": "theirs", "active": True,
    }

    # pretend the key was recently resolved: it sits in the 60s auth cache
    key_hash = sha256_hex(issued["api_key"])
    dependencies._api_key_cache[key_hash] = (
        (fake.records["api_keys"][issued["id"]], fake.records["users"]["usr1"]), 1e9,
    )

    r = c.post("/v1/keys/deactivate", json={"id": issued["id"]}, headers=USER_TOKEN)
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    assert fake.records["api_keys"][issued["id"]]["active"] is False
    assert key_hash not in dependencies._api_key_cache  # cache invalidated

    # someone else's key -> 404 (existence not leaked), untouched
    r2 = c.post("/v1/keys/deactivate", json={"id": "other1"}, headers=USER_TOKEN)
    assert r2.status_code == 404
    assert r2.json() == {"ok": False, "error": "key_not_found"}
    assert fake.records["api_keys"]["other1"]["active"] is True

    # unknown id -> 404 too
    r3 = c.post("/v1/keys/deactivate", json={"id": "does-not-exist"}, headers=USER_TOKEN)
    assert r3.status_code == 404
    assert r3.json()["error"] == "key_not_found"


def test_regenerate_invalidates_api_key_cache(client):
    c, fake = client
    setup_auth_user(fake)
    from app import dependencies
    from app.core.security import sha256_hex

    first = c.post("/v1/keys", json={"label": "a"}, headers=USER_TOKEN).json()
    key_hash = sha256_hex(first["api_key"])
    dependencies._api_key_cache[key_hash] = (
        (fake.records["api_keys"][first["id"]], fake.records["users"]["usr1"]), 1e9,
    )

    r = c.post("/v1/keys/regenerate", json={"label": "b"}, headers=USER_TOKEN)
    assert r.status_code == 200
    assert key_hash not in dependencies._api_key_cache


def test_delete_key_is_owner_scoped(client):
    c, fake = client
    setup_auth_user(fake)
    from app import dependencies
    from app.core.security import sha256_hex

    issued = c.post("/v1/keys", json={"label": "mine"}, headers=USER_TOKEN).json()
    # pretend the key was recently resolved: it sits in the 60s auth cache
    key_hash = sha256_hex(issued["api_key"])
    dependencies._api_key_cache[key_hash] = (
        (fake.records["api_keys"][issued["id"]], fake.records["users"]["usr1"]), 1e9,
    )

    r = c.delete(f"/v1/keys/{issued['id']}", headers=USER_TOKEN)
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    assert fake.records["api_keys"][issued["id"]]["active"] is False
    assert key_hash not in dependencies._api_key_cache  # cache invalidated

    # someone else's key -> 404 (existence not leaked), untouched
    fake.records["users"]["usr2"] = {
        "id": "usr2", "email": "other@example.com", "status": "active",
    }
    fake.records["api_keys"]["other1"] = {
        "id": "other1", "owner": "usr2", "key_hash": "f" * 64, "last4": "abcd",
        "label": "theirs", "active": True,
    }
    assert c.delete("/v1/keys/other1", headers=USER_TOKEN).status_code == 404
    assert fake.records["api_keys"]["other1"]["active"] is True

    # unknown id -> 404 too
    assert c.delete("/v1/keys/does-not-exist", headers=USER_TOKEN).status_code == 404


def test_deactivate_is_deprecated_alias_of_delete(client):
    c, fake = client
    setup_auth_user(fake)
    issued = c.post("/v1/keys", json={"label": "old-client"}, headers=USER_TOKEN).json()

    r = c.post("/v1/keys/deactivate", json={"id": issued["id"]}, headers=USER_TOKEN)
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    assert fake.records["api_keys"][issued["id"]]["active"] is False


def test_openapi_documents_security_and_errors(client):
    c, _fake = client
    spec = c.get("/openapi.json").json()

    # security schemes registered (Authorize button in /docs works)
    schemes = spec["components"]["securitySchemes"]
    assert schemes, "no securitySchemes in the OpenAPI spec"

    # API-key routes declare their security requirement
    assert spec["paths"]["/v1/otp/send"]["post"]["security"]
    assert spec["paths"]["/v1/keys/{key_id}"]["delete"]["security"]

    # the error catalog is documented on the routes, with named examples
    send_responses = spec["paths"]["/v1/otp/send"]["post"]["responses"]
    assert "429" in send_responses
    assert "quota_exceeded" in send_responses["429"]["content"]["application/json"]["examples"]
    assert "user_not_linked" in send_responses["409"]["content"]["application/json"]["examples"]
    delete_responses = spec["paths"]["/v1/keys/{key_id}"]["delete"]["responses"]
    assert "key_not_found" in delete_responses["404"]["content"]["application/json"]["examples"]

    # creation is 201, and the deprecated alias is marked
    assert "201" in spec["paths"]["/v1/keys"]["post"]["responses"]
    assert spec["paths"]["/v1/keys/deactivate"]["post"]["deprecated"] is True


def test_dashboard_auth_pb_outage_is_503(client):
    c, fake = client
    setup_auth_user(fake)
    from app.services.pocketbase import PocketBaseError

    async def pb_down(token):
        raise PocketBaseError(503, "pb down")

    fake.auth_refresh = pb_down  # instance attribute shadows the method
    r = c.get("/v1/usage", headers=USER_TOKEN)
    assert r.status_code == 503
    assert r.json() == {"ok": False, "error": "upstream_unavailable"}
