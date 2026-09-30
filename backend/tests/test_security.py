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
