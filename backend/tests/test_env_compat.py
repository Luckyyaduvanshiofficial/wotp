"""Environment-variable compatibility across the renaming to WOTP.

The project was renamed from `WA OTP` to `WOTP`, which renamed the environment
variables with it. An existing install has a `.env` full of the old names, and
two of them are load-bearing in a way that fails badly:

- a missing `*_FERNET_KEY` makes every already-encrypted provider token
  undecryptable, and
- a missing collections prefix points the app at collections that do not exist,
  which looks exactly like an empty database.

So the old names are still read. These tests are what stops someone deleting the
aliases later as dead code.
"""

import pytest


def _clear():
    from app.core.config import get_settings

    get_settings.cache_clear()


@pytest.fixture(autouse=True)
def _reset():
    yield
    _clear()


def test_new_env_names_are_read(monkeypatch):
    monkeypatch.setenv("WOTP_FERNET_KEY", "new-style-key")
    monkeypatch.setenv("WOTP_MOCK_DELIVERY", "1")
    monkeypatch.setenv("WOTP_PB_COLLECTIONS_PREFIX", "wotp_")
    _clear()

    from app.core.config import get_settings

    cfg = get_settings()
    assert cfg.wotp_fernet_key == "new-style-key"
    assert cfg.wotp_mock_delivery is True
    assert cfg.pb_collections_prefix == "wotp_"


def test_pre_rename_env_names_still_work(monkeypatch):
    """An install that predates the rename must keep working untouched."""
    monkeypatch.delenv("WOTP_FERNET_KEY", raising=False)
    monkeypatch.delenv("WOTP_MOCK_DELIVERY", raising=False)
    monkeypatch.delenv("WOTP_PB_COLLECTIONS_PREFIX", raising=False)

    monkeypatch.setenv("WAOTP_FERNET_KEY", "legacy-key")
    monkeypatch.setenv("WAOTP_MOCK_DELIVERY", "1")
    monkeypatch.setenv("WAOTP_PB_COLLECTIONS_PREFIX", "waotp_")
    _clear()

    from app.core.config import get_settings

    cfg = get_settings()
    assert cfg.wotp_fernet_key == "legacy-key"
    assert cfg.wotp_mock_delivery is True
    assert cfg.pb_collections_prefix == "waotp_"


def test_new_name_wins_when_both_are_set(monkeypatch):
    monkeypatch.setenv("WAOTP_FERNET_KEY", "legacy-key")
    monkeypatch.setenv("WOTP_FERNET_KEY", "new-key")
    _clear()

    from app.core.config import get_settings

    assert get_settings().wotp_fernet_key == "new-key"


def test_default_collection_prefix_is_unchanged(monkeypatch):
    """The prefix names tables that already hold data.

    It is a data-level identifier, not branding, so the default deliberately
    stays `waotp_`. A fresh install can opt into `wotp_` by setting the
    variable; an existing one must not be silently repointed at empty
    collections by a rename.
    """
    monkeypatch.delenv("WOTP_PB_COLLECTIONS_PREFIX", raising=False)
    monkeypatch.delenv("WAOTP_PB_COLLECTIONS_PREFIX", raising=False)
    monkeypatch.delenv("PB_COLLECTIONS_PREFIX", raising=False)
    _clear()

    from app.core.config import get_settings

    assert get_settings().pb_collections_prefix == "waotp_"


def test_generated_api_keys_use_the_new_prefix():
    from app.core.security import generate_api_key

    assert generate_api_key().startswith("wotp_")


def test_a_key_issued_before_the_rename_still_authenticates(client):
    """Keys already in customers' hands keep working.

    `resolve_api_key` looks a key up by its SHA-256 digest and never inspects the
    prefix, so a key minted as `waotp_…` still resolves after the rename. This
    exercises that end to end, because the alternative (prefix validation) would
    sign every existing integration out.
    """
    import hashlib

    from conftest import add_developer

    c, fake = client
    add_developer(fake)

    legacy_key = "waotp_legacykey0000000000000000000000000000"
    fake.records["api_keys"]["key1"]["key_hash"] = hashlib.sha256(
        legacy_key.encode()
    ).hexdigest()

    assert c.get("/v1/otp/usage", headers={"X-Api-Key": legacy_key}).status_code == 200
