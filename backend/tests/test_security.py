from cryptography.fernet import Fernet

from app.core.config import get_settings
from app.core.security import (
    generate_api_key,
    generate_otp_code,
    make_link_token,
    normalize_phone,
    parse_link_token,
    sha256_hex,
)


def test_api_key_format_and_hash():
    key = generate_api_key()
    assert key.startswith("waotp_")
    assert len(key) == len("waotp_") + 40
    assert sha256_hex(key) == sha256_hex(key)
    assert len(sha256_hex(key)) == 64


def test_otp_code_is_six_digits():
    assert len(generate_otp_code()) == 6
    assert generate_otp_code().isdigit()


def test_normalize_phone():
    assert normalize_phone("919876543210") == "919876543210"
    assert normalize_phone("+91 98765 43210") == "919876543210"
    assert normalize_phone("9876543210") == "919876543210"  # 10 digits -> India
    assert normalize_phone("098765-43210") == "919876543210"
    assert normalize_phone("442071234567") == "442071234567"
    assert normalize_phone("123") is None
    assert normalize_phone("") is None
    assert normalize_phone("abcdefghij") is None


def test_link_token_roundtrip():
    token = make_link_token("usr1", "919876543210")
    parsed = parse_link_token(token)
    assert parsed == {"o": "usr1", "p": "919876543210"}
    assert parse_link_token(token[:-2] + "zz") is None  # tampered
    assert parse_link_token("garbage") is None


def test_fernet_roundtrip():
    from app.core.security import decrypt_secret, encrypt_secret

    cipher = encrypt_secret("META-TOKEN-123")
    assert "META-TOKEN-123" not in cipher
    assert decrypt_secret(cipher) == "META-TOKEN-123"


def test_settings_env_loaded():
    assert get_settings().waotp_mock_delivery is True
    assert Fernet(get_settings().waotp_fernet_key.encode())


# ---- phone numbers must not survive into logs ----


def test_mask_phone_hides_the_number_but_stays_correlatable():
    from app.core.security import mask_phone

    masked = mask_phone("919876543210")
    assert "987654" not in masked
    assert masked.endswith("(len 12)")
    # two different numbers must not collide on the visible part
    assert mask_phone("919876543210") != mask_phone("919876543299")

    assert mask_phone("") == "(none)"
    assert mask_phone("12") == "**"


def test_failed_send_logs_do_not_contain_the_phone_number(client, monkeypatch, caplog):
    """The audit-failure path logs the phone; it must be masked, not raw."""
    import logging

    from conftest import AUTH, add_developer
    from app.core.config import get_settings
    from app.core.security import encrypt_secret
    from app.services.pocketbase import PocketBaseError
    from conftest import FakePB

    c, fake = client
    add_developer(fake)
    fake.records["settings"]["set1"]["meta_phone_number_id"] = "PN123"
    fake.records["settings"]["set1"]["meta_token_enc"] = encrypt_secret("REALMETA")
    monkeypatch.setenv("WAOTP_MOCK_DELIVERY", "0")
    get_settings.cache_clear()

    async def provider_rejects(*args, **kwargs):
        from app.providers import ProviderError
        raise ProviderError("template not approved")

    original_create = FakePB.create

    async def create_fails(self, collection, data):
        if collection == "messages":
            raise PocketBaseError(500, "pb write failed")
        return await original_create(self, collection, data)

    monkeypatch.setattr("app.providers.meta.MetaProvider.send_otp", provider_rejects)
    monkeypatch.setattr(FakePB, "create", create_fails)

    with caplog.at_level(logging.CRITICAL, logger="waotp"):
        c.post(
            "/v1/otp/send",
            json={"to": "919876543210"},
            headers=AUTH,
        )

    text = caplog.text
    assert "919876543210" not in text, text
    assert "***10" in text, text


# ---- sandbox template shape is configuration, not a baked-in name ----


def test_authentication_template_uses_the_two_parameter_shape():
    from app.providers.meta import MetaProvider

    provider = MetaProvider(template="verification_code")
    components = provider._components("123456")
    assert components[0]["parameters"] == [{"type": "text", "text": "123456"}]
    assert components[1]["sub_type"] == "url"
    assert components[1]["parameters"] == [{"type": "text", "text": "123456"}]


def test_sandbox_template_name_is_not_special_by_default():
    """No template name gets the sandbox shape unless the operator names it."""
    from app.providers.meta import MetaProvider

    provider = MetaProvider(template="jaspers_market_order_confirmation_v1")
    assert len(provider._components("123456")) == 2


def test_sandbox_shape_is_opt_in_by_template_name():
    from app.providers.meta import MetaProvider

    provider = MetaProvider(
        template="jaspers_market_order_confirmation_v1",
        sandbox_template="jaspers_market_order_confirmation_v1",
    )
    components = provider._components("123456")
    assert len(components) == 1
    assert len(components[0]["parameters"]) == 3

    # only the named template gets that shape
    other = MetaProvider(template="verification_code",
                         sandbox_template="jaspers_market_order_confirmation_v1")
    assert len(other._components("123456")) == 2
