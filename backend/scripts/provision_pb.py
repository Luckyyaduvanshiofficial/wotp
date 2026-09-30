#!/usr/bin/env python
"""Idempotent provisioning of the wa-otp collections on a (possibly shared)
self-hosted PocketBase instance, via the superuser REST API.

Mirrors backend/pocketbase/pb_migrations/1757750400_init_waotp.pb.js 1:1, but
every wa-otp collection is created under `--prefix` (default "waotp_") so it
can coexist with other projects' collections on the same PB instance.

With a prefix set, the app also gets its OWN auth collection ({prefix}users)
so operator accounts stay fully separate from other apps' users; the shared
`users` collection is never read or modified. Without a prefix (dedicated
instance), `status` is added to the stock `users` collection instead.

Safe to run repeatedly: collections that already exist are reported and
skipped untouched; the settings seed row is only created when the collection
has zero records. The superuser token and password are never printed.

Usage:
    .venv/bin/python scripts/provision_pb.py --url http://127.0.0.1:8090 \
        --email ops@example.com --password '***' --prefix waotp_

Credentials fall back to the PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD env
vars when --email/--password are omitted.
"""

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx

TIMEOUT = 30.0
USER_AGENT = "waotp-provision/1.0"

# Field templates below mirror the JS migration field-for-field, in the same
# order. Index names AND the table names inside their SQL are written with the
# physical (prefixed) name: SQLite index names are unique across the whole
# database file, so an unprefixed `idx_api_keys_hash` would collide with
# another project's identically-named index on a shared instance and fail to
# apply. PocketBase rewrites the table name on save, so naming it explicitly
# here just makes the intent local and correct.
CREATED = {"name": "created", "type": "autodate", "onCreate": True}
UPDATED = {"name": "updated", "type": "autodate", "onCreate": True, "onUpdate": True}

USER_STATUS_FIELD = {
    "name": "status",
    "type": "select",
    "values": ["active", "suspended"],
    "maxSelect": 1,
}

# Self-service update rule for the operator auth collection.
#
# `id = @request.auth.id` alone lets a signed-in user PATCH *any* field of their
# own record — including `status`, which is the only thing that gates a
# suspended account's API keys, and `verified`. The `:changed` modifier is
# PocketBase's documented way to forbid that: it is true only when the client
# submitted the field AND its value differs from the stored one, so a client
# that echoes the current value still works while a real change is rejected.
SELF_UPDATE_RULE = (
    "id = @request.auth.id"
    " && @request.body.status:changed = false"
    " && @request.body.verified:changed = false"
)

SEED_SETTINGS = {
    "meta_phone_number_id": "",
    "meta_token_enc": "",
    # Encrypted at rest like the token: it authenticates inbound webhook calls,
    # so a dump of this row must not hand an attacker the ability to forge them.
    "meta_app_secret_enc": "",
    "meta_verify_token": "",
    "meta_template": "verification_code",
    "meta_template_lang": "en_US",
    "tg_bot_token": "",
    "tg_bot_username": "",
    # 0 = the operator set no monthly cap (they send from their own account)
    "monthly_send_quota": 0,
    "per_phone_hourly": 5,
    "code_ttl_seconds": 300,
    "max_attempts": 3,
    "ratelimit_per_min": 10,
    "ratelimit_per_ip_per_min": 30,
    "resend_cooldown_seconds": 0,
    "otp_length": 6,
}


def auth_collection_payload(physical: str) -> dict:
    """POST /api/collections payload for the dedicated wa-otp auth collection.

    System auth fields (password, tokenKey, email, emailVisibility, verified)
    are added by PocketBase automatically for type "auth". Rules:
    - users can see/update their own record; delete is admin-only.
    - createRule None = operator-only. Accounts are provisioned out-of-band
      (`scripts/create_admin.py`, or the PocketBase admin UI). An open create
      rule would let any visitor register and then mint an API key against the
      operator's own Meta account.
    - updateRule additionally refuses to let a user change their own `status` or
      `verified`. Without that guard, `status` — which is the only thing
      gating a suspended operator's keys — could be set back to "active" by
      that same user through the PocketBase REST API, using their own session
      token. `:changed = false` (PocketBase's documented modifier for exactly
      this) permits a client that round-trips the current value but rejects a
      change to it.
    - Index names embed the physical name: SQLite index names are unique
      across the whole DB file, so they must not collide with the stock
      `users` collection's indexes.
    """
    return {
        "name": physical,
        "type": "auth",
        "listRule": "id = @request.auth.id",
        "viewRule": "id = @request.auth.id",
        "createRule": None,
        "updateRule": SELF_UPDATE_RULE,
        "deleteRule": None,
        "passwordAuth": {"enabled": True, "identityFields": ["email"]},
        "authRule": "",
        "manageRule": None,
        "fields": [USER_STATUS_FIELD],
        "indexes": [
            f"CREATE UNIQUE INDEX idx_{physical}_tokenKey ON `{physical}` (`tokenKey`)",
            f"CREATE UNIQUE INDEX idx_{physical}_email ON `{physical}` (`email`) "
            f"WHERE `email` != ''",
        ],
    }


def collection_payload(logical: str, physical: str, ids: dict[str, str]) -> dict:
    """Full POST /api/collections payload for one wa-otp collection."""
    users_id = ids["users"]

    if logical == "api_keys":
        fields = [
            CREATED,
            UPDATED,
            {"name": "owner", "type": "relation", "collectionId": users_id,
             "cascadeDelete": True, "maxSelect": 1, "required": True},
            {"name": "key_hash", "type": "text", "required": True, "min": 64, "max": 64},
            {"name": "last4", "type": "text", "max": 4},
            {"name": "label", "type": "text", "max": 50},
            {"name": "active", "type": "bool"},
        ]
        indexes = [f"CREATE UNIQUE INDEX idx_{physical}_hash ON `{physical}` (`key_hash`)"]
    elif logical == "otp_codes":
        fields = [
            CREATED,
            UPDATED,
            {"name": "owner", "type": "relation", "collectionId": users_id,
             "cascadeDelete": True, "maxSelect": 1, "required": True},
            {"name": "api_key", "type": "relation", "collectionId": ids["api_keys"],
             "cascadeDelete": True, "maxSelect": 1},
            {"name": "phone", "type": "text", "required": True, "max": 15},
            {"name": "code_hash", "type": "text", "required": True, "min": 64, "max": 64},
            {"name": "expires", "type": "date", "required": True},
            {"name": "attempts", "type": "number", "onlyInt": True},
        ]
        indexes = [
            f"CREATE INDEX idx_{physical}_lookup ON `{physical}` (`owner`, `phone`, `created`)"
        ]
    elif logical == "messages":
        fields = [
            CREATED,
            UPDATED,
            {"name": "owner", "type": "relation", "collectionId": users_id,
             "cascadeDelete": True, "maxSelect": 1, "required": True},
            {"name": "api_key", "type": "relation", "collectionId": ids["api_keys"],
             "cascadeDelete": True, "maxSelect": 1},
            {"name": "phone", "type": "text", "required": True, "max": 15},
            # provider message id: WhatsApp "wamid..." or Telegram message id
            {"name": "wa_message_id", "type": "text", "max": 128},
            {"name": "channel", "type": "select", "values": ["whatsapp", "telegram"], "maxSelect": 1},
            # "sent" is written by the send path; the rest arrive later from the
            # provider's status webhook.
            {"name": "status", "type": "select",
             "values": ["sent", "delivered", "read", "failed"], "maxSelect": 1},
            # Written ONCE by the send path when the provider accepted the
            # message, and never updated afterwards. This — not `status` — is
            # what the monthly cap counts: status moves to delivered/read as
            # callbacks arrive, so counting it would make usage shrink as
            # messages succeeded. See the billable migration.
            {"name": "billable", "type": "bool"},
            {"name": "error", "type": "text", "max": 500},
        ]
        indexes = [
            f"CREATE INDEX idx_{physical}_owner_created ON `{physical}` (`owner`, `created`)",
            f"CREATE INDEX idx_{physical}_wa_message_id ON `{physical}` (`wa_message_id`)",
        ]
    elif logical == "tg_links":
        fields = [
            CREATED,
            UPDATED,
            {"name": "phone", "type": "text", "required": True, "max": 15},
            {"name": "chat_id", "type": "text", "required": True, "max": 32},
            {"name": "tg_user_id", "type": "text", "max": 32},
            {"name": "linked_at", "type": "autodate", "onCreate": True, "onUpdate": True},
        ]
        indexes = [f"CREATE UNIQUE INDEX idx_{physical}_phone ON `{physical}` (`phone`)"]
    elif logical == "settings":
        fields = [
            CREATED,
            UPDATED,
            {"name": "meta_phone_number_id", "type": "text", "max": 64},
            # Fernet-encrypted at rest; even a PB dump should not leak the Meta token.
            {"name": "meta_token_enc", "type": "text", "max": 500},
            # Also encrypted: this one verifies inbound webhook signatures, so
            # leaking it would let an attacker forge delivery-status callbacks.
            {"name": "meta_app_secret_enc", "type": "text", "max": 500},
            {"name": "meta_verify_token", "type": "text", "max": 128},
            {"name": "meta_template", "type": "text", "max": 64},
            {"name": "meta_template_lang", "type": "text", "max": 16},
            {"name": "tg_bot_token", "type": "text", "max": 128},
            {"name": "tg_bot_username", "type": "text", "max": 64},
            # 0 = the operator set no monthly cap
            {"name": "monthly_send_quota", "type": "number", "onlyInt": True},
            {"name": "per_phone_hourly", "type": "number", "onlyInt": True},
            {"name": "code_ttl_seconds", "type": "number", "onlyInt": True},
            {"name": "max_attempts", "type": "number", "onlyInt": True},
            {"name": "ratelimit_per_min", "type": "number", "onlyInt": True},
            {"name": "ratelimit_per_ip_per_min", "type": "number", "onlyInt": True},
            {"name": "resend_cooldown_seconds", "type": "number", "onlyInt": True},
            {"name": "otp_length", "type": "number", "onlyInt": True},
        ]
        indexes = []
    else:  # pragma: no cover - guarded by the caller's ORDER list
        raise ValueError(f"unknown collection: {logical}")

    return {
        "name": physical,
        "type": "base",
        "listRule": None,
        "viewRule": None,
        "createRule": None,
        "updateRule": None,
        "deleteRule": None,
        "fields": fields,
        "indexes": indexes,
    }


def _rebuild_stale_relations(
    http: httpx.Client, headers: dict, prefix: str, users_id: str,
    results: list[tuple[str, str, str]],
) -> bool:
    """One-time self-heal for instances provisioned before the dedicated
    {prefix}users auth collection existed: their {prefix}api_keys/otp_codes/
    messages owner relations point at the shared users pool.

    PocketBase refuses to change a relation's collection in place, so the
    collections must be deleted and recreated. That is only safe when they
    hold zero records — if any has data, abort and let the operator migrate.
    Returns True when the instance is ready for the create pass.
    """
    REBUILD_ORDER = ("messages", "otp_codes", "api_keys")  # children first
    LOGICALS = ("api_keys", "otp_codes", "messages")

    stale: set[str] = set()
    for logical in LOGICALS:
        physical = prefix + logical
        r = http.get(f"/api/collections/{physical}", headers=headers)
        if r.status_code != 200:
            continue
        owner = next((f for f in r.json().get("fields") or []
                      if f.get("name") == "owner" and f.get("type") == "relation"), None)
        if owner is not None and owner.get("collectionId") != users_id:
            stale.add(logical)
    if not stale:
        return True

    # recreating api_keys changes its collection id, so collections holding an
    # api_key relation must be rebuilt with it
    if "api_keys" in stale:
        stale.update(("otp_codes", "messages"))

    for logical in REBUILD_ORDER:
        if logical not in stale:
            continue
        physical = prefix + logical
        r = http.get(f"/api/collections/{physical}/records", headers=headers,
                     params={"perPage": 1})
        count = int(r.json().get("totalItems") or 0) if r.status_code == 200 else -1
        if count != 0:
            print(f"error: {physical} has {count} records but its owner relation "
                  f"targets the old users collection — migrate the data manually "
                  f"(export/re-import) before running provision again.", file=sys.stderr)
            return False

    for logical in REBUILD_ORDER:
        if logical not in stale:
            continue
        physical = prefix + logical
        r = http.delete(f"/api/collections/{physical}", headers=headers)
        if r.status_code >= 400:
            print(f"error: deleting {physical} failed ({r.status_code}): "
                  f"{r.text[:300]}", file=sys.stderr)
            return False
        results.append((physical, "rebuilding", "owner relation re-targeted"))
    return True


def print_summary(rows: list[tuple[str, str, str]]) -> None:
    name_w = max(len(name) for name, _, _ in rows) + 2
    action_w = max(len(action) for _, action, _ in rows) + 2
    print("\n=== provisioning summary ===")
    for name, action, note in rows:
        print(f"  {name:<{name_w}}{action:<{action_w}}{note}".rstrip())
    print("============================")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Idempotently create the (prefixed) wa-otp collections on a "
                    "PocketBase instance via the superuser REST API."
    )
    parser.add_argument("--url", required=True,
                        help="PocketBase base URL, e.g. http://127.0.0.1:8090 or https://pb.example.com")
    parser.add_argument("--email", default=os.environ.get("PB_SUPERUSER_EMAIL", ""),
                        help="superuser email (default: PB_SUPERUSER_EMAIL env)")
    parser.add_argument("--password", default=os.environ.get("PB_SUPERUSER_PASSWORD", ""),
                        help="superuser password (default: PB_SUPERUSER_PASSWORD env)")
    parser.add_argument("--prefix", default="waotp_",
                        help="physical collection name prefix (default: waotp_)")
    args = parser.parse_args()

    if not args.email or not args.password:
        print("error: superuser credentials missing — pass --email/--password or set "
              "PB_SUPERUSER_EMAIL/PB_SUPERUSER_PASSWORD", file=sys.stderr)
        return 1

    base = args.url.rstrip("/")
    results: list[tuple[str, str, str]] = []

    with httpx.Client(
        base_url=base,
        timeout=TIMEOUT,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT},
    ) as http:
        # 1. superuser auth (token is kept out of all output)
        r = http.post(
            "/api/collections/_superusers/auth-with-password",
            json={"identity": args.email, "password": args.password},
        )
        if r.status_code != 200:
            print(f"error: superuser auth failed ({r.status_code}): {r.text[:200]}", file=sys.stderr)
            return 1
        headers = {"Authorization": r.json()["token"]}

        # 2. developer auth collection. With a prefix, wa-otp gets its own
        # {prefix}users auth collection (separate login pool from other apps);
        # without a prefix (dedicated instance), `status` is added to the
        # stock `users` instead. Relations in api_keys/... reference this id,
        # so it must exist before the base collections.
        ids: dict[str, str] = {}
        if args.prefix:
            physical_users = args.prefix + "users"
            r = http.get(f"/api/collections/{physical_users}", headers=headers)
            if r.status_code == 200:
                ids["users"] = r.json()["id"]
                results.append((physical_users, "exists", "skipping"))
            elif r.status_code == 404:
                r = http.post("/api/collections", headers=headers,
                              json=auth_collection_payload(physical_users))
                if r.status_code >= 400:
                    print(f"error: creating {physical_users} failed ({r.status_code}): "
                          f"{r.text[:300]}", file=sys.stderr)
                    return 1
                ids["users"] = r.json()["id"]
                results.append((physical_users, "created",
                                "own auth collection (invite-only signup)"))
            else:
                print(f"error: GET /api/collections/{physical_users} -> {r.status_code}: "
                      f"{r.text[:200]}", file=sys.stderr)
                return 1
            if not _rebuild_stale_relations(http, headers, args.prefix,
                                            ids["users"], results):
                return 1
        else:
            r = http.get("/api/collections/users", headers=headers)
            if r.status_code != 200:
                print(f"error: cannot read the users auth collection ({r.status_code}): "
                      f"{r.text[:200]}", file=sys.stderr)
                return 1
            users_json = r.json()
            existing_names = {f.get("name") for f in users_json.get("fields") or []}
            missing = [d for d in (USER_STATUS_FIELD,)
                       if d["name"] not in existing_names]
            # A dedicated instance still needs the same self-update guard: the
            # stock `users` collection ships with a permissive update rule, so
            # `status` would be self-editable there too.
            rule_needs_guard = users_json.get("updateRule") != SELF_UPDATE_RULE
            if not missing and not rule_needs_guard:
                results.append(("users", "exists", "status field and update rule already present"))
            else:
                patched = dict(users_json)
                if missing:
                    patched["fields"] = list(users_json.get("fields") or []) + missing
                patched["updateRule"] = SELF_UPDATE_RULE
                r = http.patch("/api/collections/users", headers=headers, json=patched)
                if r.status_code >= 400:
                    print(f"error: patching users failed ({r.status_code}): "
                          f"{r.text[:300]}", file=sys.stderr)
                    return 1
                added = [d["name"] for d in missing]
                if added:
                    results.append(("users", "patched", "added: " + ", ".join(added)))
                if rule_needs_guard:
                    results.append(("users", "patched", "self-update guard on status/verified"))
            ids["users"] = users_json["id"]

        # 3. prefixed wa-otp base collections; api_keys first because otp_codes
        # and messages hold relations to it.
        order = [
            "api_keys", "otp_codes", "messages", "tg_links", "settings",
        ]
        for logical in order:
            physical = args.prefix + logical
            r = http.get(f"/api/collections/{physical}", headers=headers)
            if r.status_code == 200:
                ids[logical] = r.json()["id"]
                results.append((physical, "exists", "skipping"))
                continue
            if r.status_code != 404:
                print(f"error: GET /api/collections/{physical} -> {r.status_code}: "
                      f"{r.text[:200]}", file=sys.stderr)
                return 1
            r = http.post("/api/collections", headers=headers,
                          json=collection_payload(logical, physical, ids))
            if r.status_code >= 400:
                print(f"error: creating {physical} failed ({r.status_code}): "
                      f"{r.text[:300]}", file=sys.stderr)
                return 1
            ids[logical] = r.json()["id"]
            results.append((physical, "created", ""))

        # 4. seed the single settings row (only when the collection is empty).
        physical_settings = args.prefix + "settings"
        r = http.get(f"/api/collections/{physical_settings}/records",
                     headers=headers, params={"perPage": 1})
        if r.status_code != 200:
            print(f"error: cannot list {physical_settings} records ({r.status_code}): "
                  f"{r.text[:200]}", file=sys.stderr)
            return 1
        if int(r.json().get("totalItems") or 0) == 0:
            r = http.post(f"/api/collections/{physical_settings}/records",
                          headers=headers, json=SEED_SETTINGS)
            if r.status_code >= 400:
                print(f"error: seeding {physical_settings} failed ({r.status_code}): "
                      f"{r.text[:300]}", file=sys.stderr)
                return 1
            results.append((f"{physical_settings} seed row", "created", "PRD defaults"))
        else:
            results.append((f"{physical_settings} seed row", "exists", "skipping"))

    print_summary(results)
    return 0


if __name__ == "__main__":
    try:
        code = main()
    except httpx.HTTPError as exc:  # DNS/TLS/timeouts — e.g. Cloudflare-fronted hosts
        print(f"error: request to the PocketBase server failed: {exc}", file=sys.stderr)
        code = 1
    raise SystemExit(code)
