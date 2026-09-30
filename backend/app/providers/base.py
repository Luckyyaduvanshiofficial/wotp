"""WhatsApp provider interface.

Only Meta's WhatsApp Cloud API is implemented (see `meta.py`). This module
exists so the delivery path has one seam: the OTP router depends on this
interface, not on Meta specifics, and adding another provider later means
adding one module next to `meta.py` rather than editing the router.

Nothing here invents capabilities a provider does not have — `send_message` and
`send_otp` are separate because the Cloud API genuinely distinguishes a
template message (required for a business-initiated OTP) from a free-form one.
"""

from dataclasses import dataclass, field
from typing import Any, Protocol


class ProviderError(Exception):
    """A delivery failure, carrying enough for the API layer to decide."""

    def __init__(self, message: str, retryable: bool = False, provider_message_id: str = ""):
        self.message = message
        # True only for transient transport failures (timeout, DNS, reset).
        # A provider rejection (bad token, unapproved template) is not
        # retryable — retrying just burns quota and looks like spam.
        self.retryable = retryable
        self.provider_message_id = provider_message_id
        super().__init__(message)


@dataclass
class ProviderStatus:
    """Result of a configuration check.

    `detail` is surfaced in /health/ready and the dashboard, so it must never
    contain a token or any other secret.
    """

    configured: bool
    detail: str = ""
    missing: list[str] = field(default_factory=list)


@dataclass
class WebhookEvent:
    """A normalised inbound webhook event.

    Providers differ wildly in payload shape; the router only ever sees this.
    """

    kind: str  # "status" | "message" | "unknown"
    provider_message_id: str = ""
    status: str = ""  # sent | delivered | read | failed
    recipient: str = ""
    error: str = ""
    raw: dict[str, Any] = field(default_factory=dict)


class WhatsAppProvider(Protocol):
    """Everything the app needs from a WhatsApp provider."""

    name: str

    async def send_otp(
        self, client, to_phone: str, code: str, ttl_seconds: int = 300
    ) -> str:
        """Deliver an authentication code. Returns the provider message id."""
        ...

    async def send_message(self, client, to_phone: str, text: str) -> str:
        """Deliver a free-form text message. Returns the provider message id."""
        ...

    def process_webhook(self, payload: dict) -> list[WebhookEvent]:
        """Normalise a verified inbound webhook payload into events."""
        ...

    async def verify_configuration(self, client) -> ProviderStatus:
        """Report whether this provider is usable, without leaking secrets."""
        ...
