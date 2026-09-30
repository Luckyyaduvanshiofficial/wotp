"""Regression tests for collection-name prefixing.

The app must route EVERY wa-otp collection — including its own auth
collection — through wa_collection(); on a shared PocketBase instance the
physical names are prefixed (waotp_users, waotp_api_keys, ...) so other apps'
data and user pools are never touched.
"""

import pytest


@pytest.fixture()
def prefixed_settings(monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setenv("WAOTP_PB_COLLECTIONS_PREFIX", "waotp_")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_every_waotp_collection_is_prefixed(prefixed_settings):
    from app.services.pocketbase import wa_collection

    for logical in (
        "users", "api_keys", "otp_codes", "messages", "tg_links", "settings",
    ):
        assert wa_collection(logical) == f"waotp_{logical}", logical


def test_unprefixed_mode_uses_logical_names():
    from app.core.config import get_settings
    from app.services.pocketbase import wa_collection

    # conftest runs the suite with an empty prefix (dedicated-instance mode)
    get_settings.cache_clear()
    assert wa_collection("users") == "users"
    assert wa_collection("api_keys") == "api_keys"
