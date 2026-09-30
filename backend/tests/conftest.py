import os
import re
from datetime import datetime, timezone

from cryptography.fernet import Fernet

# Test env must be set before any app module is imported.
os.environ.setdefault("PB_URL", "http://127.0.0.1:99999")
os.environ.setdefault("PB_SUPERUSER_EMAIL", "test@waotp.local")
os.environ.setdefault("PB_SUPERUSER_PASSWORD", "test-pass-123")
# Empty prefix so the app talks to FakePB using logical (unprefixed) names.
os.environ.setdefault("WAOTP_PB_COLLECTIONS_PREFIX", "")
os.environ.setdefault("WAOTP_FERNET_KEY", Fernet.generate_key().decode())
os.environ.setdefault("TELEGRAM_WEBHOOK_SECRET", "test-webhook-secret")
os.environ.setdefault("WAOTP_MOCK_DELIVERY", "1")

# Credentials are env-first in the app, and pydantic-settings reads
# `backend/.env` whenever the suite runs from `backend/`. A real environment
# variable outranks that file, so pinning these to empty here keeps the suite
# hermetic on a developer's own configured machine: without this, a local
# META_ACCESS_TOKEN or TELEGRAM_BOT_TOKEN would silently change what the
# "unconfigured channel" tests actually exercise.
#
# The PB `settings` row still wins over these, so FakePB's row values below
# remain what the app sees.
for _credential in (
    "META_ACCESS_TOKEN",
    "META_PHONE_NUMBER_ID",
    "META_VERIFY_TOKEN",
    "META_APP_SECRET",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_BOT_USERNAME",
):
    os.environ.setdefault(_credential, "")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.services.pocketbase import PocketBaseError  # noqa: E402

TEST_KEY = "waotp_testkey0000000000000000000000000000"
KEY_HASH = __import__("hashlib").sha256(TEST_KEY.encode()).hexdigest()

CLAUSE_RE = re.compile(r"^\s*(\w+)\s*(>=|<=|!=|>|<|=)\s*('?[^']*'?)\s*$")


def pb_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.000Z")


def _match(record: dict, filter_str: str | None) -> bool:
    """Matches the simple machine-generated filters used by the services:
    `field='value' && field>='2026-01-01 00:00:00' && flag=true`."""
    if not filter_str:
        return True
    for clause in filter_str.split("&&"):
        m = CLAUSE_RE.match(clause)
        if not m:
            raise ValueError(f"FakePB cannot parse filter clause: {clause!r}")
        field, op, raw = m.groups()
        # The capture group is greedy, so an unquoted value followed by " &&"
        # keeps the trailing space ("true " rather than "true"). PocketBase's
        # parser does not care about that whitespace; this double must not
        # either, or a filter is judged by its formatting.
        raw = raw.strip()
        if raw.startswith("'"):
            value = raw[1:-1]
        elif raw == "true":
            value = True
        elif raw == "false":
            value = False
        else:
            value = raw
        actual = record.get(field)
        if op == "=":
            if str(actual) != str(value):
                return False
        else:  # date/number comparisons: lexicographic works for PB date format
            a = str(actual or "")
            v = str(value)
            ok = {
                ">": a > v,
                ">=": a >= v,
                "<": a < v,
                "<=": a <= v,
                "!=": a != v,
            }[op]
            if not ok:
                return False
    return True


class FakePB:
    """In-memory stand-in for PBClient, matching the interface the app uses."""

    COLLECTIONS = (
        "users", "api_keys", "otp_codes", "messages", "tg_links", "settings",
    )

    def __init__(self):
        self.records = {name: {} for name in self.COLLECTIONS}
        self._next_id = 1000
        self.auth_user = None
        self.auth_fail = False
        self.records["settings"]["set1"] = {
            "id": "set1",
            "meta_phone_number_id": "",
            "meta_token_enc": "",
            "meta_template": "verification_code",
            "meta_template_lang": "en_US",
            "tg_bot_token": "TESTBOT:TOKEN",
            "tg_bot_username": "waotp_test_bot",
            "monthly_send_quota": 500,
            "per_phone_hourly": 5,
            "code_ttl_seconds": 300,
            "max_attempts": 3,
            "ratelimit_per_min": 10,
            "ratelimit_per_ip_per_min": 30,
            "resend_cooldown_seconds": 0,
            "otp_length": 6,
        }

    def _id(self) -> str:
        self._next_id += 1
        return f"rec{self._next_id}"

    async def list(self, collection, *, filter=None, fields=None, expand=None,
                   sort=None, page=1, per_page=1):
        items = [
            dict(r)
            for r in self.records.get(collection, {}).values()
            if _match(r, filter)
        ]
        if sort:
            key = sort.lstrip("-")
            items.sort(key=lambda r: str(r.get(key) or ""), reverse=sort.startswith("-"))
        return {
            "items": items[:per_page],
            "totalItems": len(items),
            "page": page,
            "perPage": per_page,
        }

    async def get_one(self, collection, record_id):
        row = self.records.get(collection, {}).get(record_id)
        if row is None:
            raise PocketBaseError(404, "record not found")
        return dict(row)

    async def create(self, collection, data):
        row = dict(data)
        row["id"] = self._id()
        row["created"] = pb_now()
        row["updated"] = row["created"]
        self.records[collection][row["id"]] = row
        return dict(row)

    async def update(self, collection, record_id, data):
        row = self.records.get(collection, {}).get(record_id)
        if row is None:
            raise PocketBaseError(404, "record not found")
        row.update(data)
        row["updated"] = pb_now()
        return dict(row)

    async def delete(self, collection, record_id):
        if record_id not in self.records.get(collection, {}):
            raise PocketBaseError(404, "record not found")
        del self.records[collection][record_id]

    async def auth_refresh(self, user_token):
        if self.auth_fail or user_token != "valid-pb-token":
            raise PocketBaseError(401, "invalid or expired token")
        if self.auth_user is None:
            raise PocketBaseError(401, "no auth user configured")
        return {"token": "refreshed-token", "record": dict(self.auth_user)}


@pytest.fixture()
def client():
    from app import dependencies
    from app.core.config import get_settings
    from app.main import create_app
    from app.services.settings import invalidate_settings_cache

    def _reset_process_state():
        # The limiters and idempotency store are process-global by design
        # (single worker). Tests share one process, so they must be cleared
        # between cases or counters leak across the whole session.
        get_settings.cache_clear()
        invalidate_settings_cache()
        dependencies._api_key_cache.clear()
        dependencies._unknown_key_cache.clear()
        dependencies._key_locks.clear()
        dependencies._verify_locks.clear()
        dependencies.rate_limiter.reset()
        dependencies._ip_rate_limiter.reset()
        dependencies.idempotency_store.reset()

    _reset_process_state()

    app = create_app()
    fake = FakePB()
    with TestClient(app) as test_client:
        test_client.app.state.pb = fake
        yield test_client, fake

    _reset_process_state()


def add_developer(fake: FakePB, *, active=True, status="active"):
    fake.records["users"]["usr1"] = {
        "id": "usr1", "email": "dev@example.com", "status": status,
    }
    fake.records["api_keys"]["key1"] = {
        "id": "key1", "owner": "usr1", "key_hash": KEY_HASH,
        "last4": TEST_KEY[-4:], "label": "dev", "active": active,
    }
    return fake.records["users"]["usr1"]


AUTH = {"X-Api-Key": TEST_KEY}
