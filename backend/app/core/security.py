import hashlib
import hmac
import json
import secrets
import base64

from cryptography.fernet import Fernet, InvalidToken

from .config import get_settings

API_KEY_PREFIX = "waotp_"

# Bounds for configurable values. OTP length is operator-configurable (see
# OTP_LENGTH) but must stay within what the API accepts as a custom code
# (`CUSTOM_CODE_PATTERN` in routers/otp.py) so generated and supplied codes
# are indistinguishable to a verifier.
OTP_MIN_LENGTH = 4
OTP_MAX_LENGTH = 10

# E.164 allows up to 15 digits; the lower bound rejects obvious garbage.
MIN_PHONE_DIGITS = 10
MAX_PHONE_DIGITS = 15


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def mask_phone(phone: str) -> str:
    """A phone number reduced to something safe to put in a log line.

    Logs are the least-controlled copy of personal data an installation keeps:
    shipped to aggregators, grepped by support, retained far longer than the
    database. Phone numbers are the one piece of end-user PII this service
    handles, so they are written as a length plus the last two digits — enough
    to correlate two lines during an incident, not enough to identify anyone.

    Used for every phone number that reaches a log. Record ids, message ids and
    request ids are logged in full: they are opaque and they are what makes a
    support request traceable.
    """
    if not phone:
        return "(none)"
    if len(phone) <= 2:
        return "*" * len(phone)
    return f"***{phone[-2:]} (len {len(phone)})"


def generate_api_key() -> str:
    """Plaintext key; only its sha256 is ever stored."""
    return API_KEY_PREFIX + secrets.token_hex(20)


def generate_otp_code(length: int | None = None) -> str:
    """CSPRNG code, zero-padded so the digit count is exactly `length`.

    Length comes from settings unless overridden. `secrets.randbelow` is the
    right primitive here (not `random`): it is OS-backed and unbiased enough
    for this range.
    """
    n = length if length is not None else get_settings().otp_length
    n = max(OTP_MIN_LENGTH, min(OTP_MAX_LENGTH, n))
    return f"{secrets.randbelow(10**n):0{n}d}"


_ASCII_DIGITS = frozenset("0123456789")

# Length of a national number in the default numbering plan, used only to
# decide whether a bare digit string is missing its country code. The country
# code itself is configuration (DEFAULT_COUNTRY_CODE), not a constant.
NATIONAL_NUMBER_LENGTH = 10


def normalize_phone(raw: str) -> str | None:
    """Canonical form: digits only, country code included, no `+`.

    Self-hosters are not all in one country, so the country code is config
    (`DEFAULT_COUNTRY_CODE`, default `91`) rather than baked in. A bare
    national number is assumed to be local to that country; anything already
    carrying a country code is left alone.

    Changes here are delivery-critical: the same function runs on send and on
    verify, so both sides always agree on the stored form.

    Deliberately ASCII-only. `str.isdigit()` is true for fullwidth and
    superscript digits, which used to be accepted here and then handed to the
    provider as a recipient id that could never match a real number.
    """
    if not raw:
        return None

    kept: list[str] = []
    for ch in raw:
        if ch in _ASCII_DIGITS:
            kept.append(ch)
        elif ch.isdigit():
            # A digit written in another numbering system (fullwidth,
            # Devanagari, superscript). Dropping it like punctuation would turn
            # one number into a different, structurally valid one and deliver
            # the code to a stranger, so the input is refused instead.
            return None
    digits = "".join(kept)
    if not digits:
        return None

    # "00" is the international prefix, equivalent to "+".
    if digits.startswith("00") and len(digits) > 2:
        digits = digits[2:]

    cc = "".join(ch for ch in get_settings().default_country_code if ch in _ASCII_DIGITS)

    # National format with a trunk prefix (e.g. 09876543210 -> +91 9876543210)
    if len(digits) == NATIONAL_NUMBER_LENGTH + 1 and digits.startswith("0"):
        digits = digits[1:]

    if cc and len(digits) == NATIONAL_NUMBER_LENGTH:
        digits = cc + digits

    if not MIN_PHONE_DIGITS <= len(digits) <= MAX_PHONE_DIGITS:
        return None
    return digits


def encrypt_secret(plaintext: str) -> str:
    f = Fernet(get_settings().waotp_fernet_key.encode())
    return f.encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_secret(ciphertext: str) -> str | None:
    try:
        f = Fernet(get_settings().waotp_fernet_key.encode())
        return f.decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError):
        return None


def _hmac_key() -> bytes:
    """Signing key for Telegram link tokens.

    Fails closed. A hardcoded fallback would mean every installation of this
    software shares one signing key that is published in the source, so any
    self-hoster could mint a link token valid on any other installation.
    """
    key = get_settings().waotp_fernet_key
    if not key:
        raise RuntimeError(
            "WAOTP_FERNET_KEY is not set, so link tokens cannot be signed. "
            "Generate one with:\n"
            '  python -c "from cryptography.fernet import Fernet; '
            'print(Fernet.generate_key().decode())"\n'
            "then set WAOTP_FERNET_KEY in backend/.env and restart."
        )
    return key.encode("utf-8")


def make_link_token(owner_id: str, phone: str) -> str:
    """Signed token embedded in the t.me deep link (?start=<token>).
    Lets the bot greet contextually; the real phone comes from the contact share."""
    payload = base64.urlsafe_b64encode(
        json.dumps({"o": owner_id, "p": phone}).encode()
    ).decode().rstrip("=")
    sig = hmac.new(_hmac_key(), payload.encode(), hashlib.sha256).hexdigest()[:16]
    return f"{payload}.{sig}"


def parse_link_token(token: str) -> dict | None:
    try:
        payload, sig = token.rsplit(".", 1)
        expected = hmac.new(_hmac_key(), payload.encode(), hashlib.sha256).hexdigest()[:16]
        if not hmac.compare_digest(sig, expected):
            return None
        padded = payload + "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(padded))
    except Exception:
        return None
