from functools import lru_cache

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration.

    Everything an operator needs to tune is here or in the PocketBase
    `settings` row. Nothing in this file points at infrastructure the operator
    does not own.
    """

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # --- Application identity ------------------------------------------------
    app_name: str = "WA OTP"
    # `development` and `production` behave differently: production refuses to
    # boot with missing secrets rather than running with a weakened default.
    app_env: str = Field(
        default="development",
        validation_alias=AliasChoices("app_env", "environment", "env"),
    )
    # Public origin of *this* API, used to build the webhook URL shown in the
    # dashboard and docs. Example: https://otp.example.com
    app_url: str = Field(default="", validation_alias=AliasChoices("app_url", "api_url"))
    # General-purpose signing secret. Required in production.
    secret_key: str = ""

    # --- PocketBase control plane (data store + auth source of truth) -------
    pb_url: str = "http://127.0.0.1:8090"
    pb_superuser_email: str = ""
    pb_superuser_password: str = ""

    # Prefix prepended to every wa-otp collection name (users -> waotp_users,
    # api_keys -> waotp_api_keys, ...). It exists so this app can share one
    # PocketBase instance with other projects without collection-name
    # collisions. For a dedicated PocketBase serving only this app, the default
    # is fine and you never have to think about it. The PB `users` auth
    # collection and PB system routes (_superusers auth, users auth-refresh)
    # are never prefixed; see scripts/provision_pb.py.
    pb_collections_prefix: str = Field(
        default="waotp_",
        validation_alias=AliasChoices(
            "pb_collections_prefix",  # default env name + .env key
            "waotp_pb_collections_prefix",  # WAOTP_-prefixed env variant
        ),
    )

    # --- Secrets -------------------------------------------------------------
    # fernet: encrypts the Meta token at rest in the PB `settings` row, and
    # signs Telegram link tokens. Generate:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    waotp_fernet_key: str = ""

    # Shared secret Telegram echoes back in X-Telegram-Bot-Api-Secret-Token.
    # Must match the secret_token passed to setWebhook.
    telegram_webhook_secret: str = ""

    # CORS origin of the Next.js dashboard. Required for browser calls; without
    # it the dashboard presents as a dead backend rather than a config error.
    dashboard_origin: str = ""

    # Dev-only: fake provider delivery so the full flow runs without Meta or
    # Telegram credentials. Must be false in production.
    waotp_mock_delivery: bool = False

    # Public signup for the dashboard. Off by default: this is an
    # operator-owned installation, and an open signup form would let any
    # visitor mint an API key against the operator's WhatsApp account.
    # Turn on only for a deliberately shared team instance.
    allow_signup: bool = False

    # --- WhatsApp provider ---------------------------------------------------
    # Which provider implementation delivers WhatsApp OTPs. Only `meta` exists
    # today (Meta WhatsApp Cloud API) — see app/providers/.
    whatsapp_provider: str = "meta"

    meta_phone_number_id: str = Field(
        default="",
        validation_alias=AliasChoices("meta_phone_number_id", "waotp_meta_phone_number_id"),
    )
    meta_waba_id: str = Field(
        default="",
        validation_alias=AliasChoices("meta_waba_id", "meta_business_account_id"),
    )
    meta_access_token: str = Field(
        default="",
        validation_alias=AliasChoices("meta_access_token", "meta_token", "waotp_meta_token"),
    )
    meta_template: str = "verification_code"
    meta_template_lang: str = "en_US"
    # Optional. Meta's sandbox/test number ships with a sample template that
    # takes three body parameters instead of the single parameter a normal
    # authentication template takes. Naming it here selects that shape for that
    # one template; every other template uses the standard authentication
    # shape. Empty means "no sandbox template", which is right for any real
    # install — this is a test-number convenience, not a default.
    meta_sandbox_template: str = Field(
        default="",
        validation_alias=AliasChoices("meta_sandbox_template", "waotp_meta_sandbox_template"),
    )
    # Echoed back during Meta's webhook verification handshake. You choose this
    # string and paste the same value into the Meta app dashboard.
    meta_verify_token: str = ""
    # Meta app secret, used to validate X-Hub-Signature-256 on inbound webhook
    # calls. When unset, signature validation is skipped (and reported as such
    # by /health/ready) so a local install still works.
    meta_app_secret: str = ""
    # Graph API version. Credentials and templates are version-specific, so
    # this is config rather than a constant.
    meta_graph_version: str = "v21.0"
    meta_graph_base_url: str = "https://graph.facebook.com"

    # --- Telegram channel ----------------------------------------------------
    # Bot token from @BotFather. Env-first like the Meta credentials, so a
    # Docker or PaaS install can be configured entirely from `.env`; the PB
    # `settings` row still wins when the operator sets it from the admin UI.
    telegram_bot_token: str = Field(
        default="",
        validation_alias=AliasChoices("telegram_bot_token", "tg_bot_token"),
    )
    # Bot username without the leading "@", used to build t.me deep links for
    # the account-linking flow. Required for Telegram: without it a send to an
    # unlinked number cannot tell the user where to go.
    telegram_bot_username: str = Field(
        default="",
        validation_alias=AliasChoices("telegram_bot_username", "tg_bot_username"),
    )

    # --- OTP policy (env fallbacks; the PB `settings` row wins when set) -----
    otp_length: int = 6
    # Country code assumed for a bare national number. Self-hosters are not all
    # in one country, so this is not baked in. Digits only, no "+".
    default_country_code: str = "91"

    code_ttl_seconds: int = Field(
        default=300,
        validation_alias=AliasChoices("code_ttl_seconds", "otp_expiration_seconds"),
    )
    max_attempts: int = 3
    # Monthly cap on WhatsApp-delivered sends for the whole installation.
    # 0 means unlimited. Telegram is never counted against it.
    monthly_send_quota: int = Field(
        default=500,
        validation_alias=AliasChoices("monthly_send_quota", "free_monthly_limit"),
    )
    per_phone_hourly: int = 5
    # Minimum gap between two sends to the same phone number, in seconds.
    resend_cooldown_seconds: int = 0

    # --- Rate limiting -------------------------------------------------------
    rate_limit_enabled: bool = True
    # Per API key, per minute.
    ratelimit_per_min: int = Field(
        default=10,
        validation_alias=AliasChoices("ratelimit_per_min", "otp_rate_limit"),
    )
    # Per client IP, per minute. Guards the unauthenticated surface (and a
    # leaked key) from being used as a bulk WhatsApp spam gateway.
    ratelimit_per_ip_per_min: int = 30
    # Only enable behind a reverse proxy that *overwrites* X-Forwarded-For.
    # When true, the per-IP limiter trusts that header — and a client that can
    # set it freely would be able to bypass the limit by rotating the value.
    trust_proxy_headers: bool = False

    @model_validator(mode="after")
    def _require_secrets_in_production(self) -> "Settings":
        """Refuse to start in production with a weakened configuration.

        Booting with a missing signing key would silently degrade security
        (unsigned link tokens, or an unauthenticated webhook), which is worse
        than not booting at all.
        """
        if self.app_env.strip().lower() != "production":
            return self

        missing: list[str] = []
        if not self.waotp_fernet_key:
            missing.append("WAOTP_FERNET_KEY")
        if not self.secret_key:
            missing.append("SECRET_KEY")
        if not self.pb_superuser_password:
            missing.append("PB_SUPERUSER_PASSWORD")
        if self.waotp_mock_delivery:
            missing.append("WAOTP_MOCK_DELIVERY must be 0 (mock delivery fakes sends)")

        # WhatsApp configured but unsigned callbacks accepted: anyone who
        # learns the webhook URL could post forged delivery statuses, and those
        # payloads feed a control-plane query. The webhook only tolerates a
        # missing secret so that a local install can run without a full Meta
        # app; that trade-off must not survive into production.
        # Checked against the env credentials, which is where this app reads
        # WhatsApp credentials from first. Credentials supplied only through
        # the PocketBase settings row cannot be inspected at boot — that case
        # is reported by GET /health/ready instead.
        whatsapp_from_env = bool(self.meta_phone_number_id or self.meta_access_token)
        if whatsapp_from_env and not self.meta_app_secret:
            missing.append(
                "META_APP_SECRET (WhatsApp credentials are set, so inbound "
                "webhook signatures must be verifiable)"
            )
        if missing:
            raise ValueError(
                "Refusing to start with APP_ENV=production and an incomplete "
                "configuration. Fix these in backend/.env:\n  - "
                + "\n  - ".join(missing)
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
