"""Provider registry.

`build_whatsapp_provider` is the single place the configured provider name is
turned into an implementation. An unknown name raises rather than falling back
to a default — a typo in WHATSAPP_PROVIDER should be a startup error, not a
silently wrong delivery path.
"""

from ..core.config import get_settings
from .base import ProviderError, ProviderStatus, WebhookEvent, WhatsAppProvider
from .meta import MetaProvider

SUPPORTED_WHATSAPP_PROVIDERS = ("meta",)

__all__ = [
    "MetaProvider",
    "ProviderError",
    "ProviderStatus",
    "SUPPORTED_WHATSAPP_PROVIDERS",
    "WebhookEvent",
    "WhatsAppProvider",
    "build_whatsapp_provider",
]


def build_whatsapp_provider(cfg: dict | None = None) -> MetaProvider:
    """Instantiate the configured WhatsApp provider.

    `cfg` is the merged settings dict from `services.settings.get_app_settings`
    (PB row over env). Passing it keeps a single source of truth for
    credentials; omitting it falls back to env only.
    """
    cfg = cfg or {}
    name = (get_settings().whatsapp_provider or "meta").strip().lower()
    if name not in SUPPORTED_WHATSAPP_PROVIDERS:
        raise ValueError(
            f"WHATSAPP_PROVIDER={name!r} is not supported. "
            f"Supported values: {', '.join(SUPPORTED_WHATSAPP_PROVIDERS)}."
        )

    return MetaProvider(
        phone_number_id=cfg.get("meta_phone_number_id") or "",
        token=cfg.get("meta_token") or "",
        template=cfg.get("meta_template") or "verification_code",
        template_lang=cfg.get("meta_template_lang") or "en_US",
        app_secret=(
            cfg.get("meta_app_secret") or get_settings().meta_app_secret
        ),
        sandbox_template=(
            cfg.get("meta_sandbox_template") or get_settings().meta_sandbox_template
        ),
    )
