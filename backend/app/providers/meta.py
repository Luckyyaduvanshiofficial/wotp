"""Meta WhatsApp Cloud API provider.

Sends authentication templates and normalises inbound status callbacks. The
request shapes here follow the Cloud API's template message contract: the code
goes in the body parameter AND in the Copy-Code URL button parameter, because
Meta requires both for an authentication template to render its button.
"""

import hashlib
import hmac
import logging
import re

from ..core.config import get_settings
from .base import ProviderError, ProviderStatus, WebhookEvent

logger = logging.getLogger("waotp")

_TIMEOUT = 15.0

# Provider message ids are echoed back to us in status callbacks and then used
# as a lookup key against PocketBase. They arrive from outside the trust
# boundary, so they are whitelisted here rather than trusted: the allowed set
# covers WhatsApp's `wamid.<base64-ish>` ids and Telegram's numeric ids, and
# deliberately excludes quotes, backslashes, whitespace, `&`, `|` and
# parentheses — everything that could terminate a filter literal or change the
# shape of a filter expression.
_MESSAGE_ID_RE = re.compile(r"^[A-Za-z0-9._:+/=-]{1,128}$")


def is_safe_message_id(value: str) -> bool:
    return bool(_MESSAGE_ID_RE.match(value))


# A Meta-provided sandbox template takes three body parameters instead of the
# one-parameter shape of a normal authentication template. It is only useful
# while testing against Meta's own test number, but it is genuinely what the
# sandbox expects, so the shape is preserved — as configuration, though, not as
# a name baked into the source (see META_SANDBOX_TEMPLATE).


class MetaProvider:
    """The only implemented WhatsApp provider. See `base.WhatsAppProvider`."""

    name = "meta"

    def __init__(
        self,
        phone_number_id: str = "",
        token: str = "",
        template: str = "verification_code",
        template_lang: str = "en_US",
        app_secret: str = "",
        graph_base_url: str = "",
        graph_version: str = "",
        sandbox_template: str = "",
    ) -> None:
        self.phone_number_id = phone_number_id
        self.token = token
        self.template = template
        self.template_lang = template_lang
        self.app_secret = app_secret
        # Empty means "no sandbox template": every template uses the normal
        # two-parameter authentication shape unless the operator names the
        # sandbox template they are actually sending with.
        self.sandbox_template = sandbox_template
        env = get_settings()
        self.graph_base_url = (graph_base_url or env.meta_graph_base_url).rstrip("/")
        self.graph_version = graph_version or env.meta_graph_version

    # --- outbound ----------------------------------------------------------

    @property
    def messages_url(self) -> str:
        return (
            f"{self.graph_base_url}/{self.graph_version}"
            f"/{self.phone_number_id}/messages"
        )

    def _components(self, code: str) -> list[dict]:
        if self.sandbox_template and self.template == self.sandbox_template:
            return [
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": "Developer"},
                        {"type": "text", "text": code},
                        {"type": "text", "text": "5 min"},
                    ],
                }
            ]
        return [
            {"type": "body", "parameters": [{"type": "text", "text": code}]},
            {
                "type": "button",
                "sub_type": "url",
                "index": "0",
                "parameters": [{"type": "text", "text": code}],
            },
        ]

    async def send_otp(
        self, client, to_phone: str, code: str, ttl_seconds: int = 300
    ) -> str:
        payload = {
            "messaging_product": "whatsapp",
            "to": to_phone,
            "type": "template",
            "template": {
                "name": self.template,
                "language": {"code": self.template_lang},
                "components": self._components(code),
            },
        }
        return await self._post(client, payload)

    async def send_message(self, client, to_phone: str, text: str) -> str:
        """Free-form text. Only deliverable inside a customer service window;
        outside one Meta rejects it, which is the provider's rule, not ours."""
        payload = {
            "messaging_product": "whatsapp",
            "to": to_phone,
            "type": "text",
            "text": {"body": text},
        }
        return await self._post(client, payload)

    async def _post(self, client, payload: dict) -> str:
        import httpx

        try:
            r = await client.post(
                self.messages_url,
                headers={"Authorization": f"Bearer {self.token}"},
                json=payload,
                timeout=_TIMEOUT,
            )
        except httpx.RequestError as exc:
            raise ProviderError(
                f"meta unreachable: {exc.__class__.__name__}", retryable=True
            ) from exc

        if r.status_code >= 400:
            # Meta's body carries the actionable reason (bad token, unapproved
            # template, outside the 24h window). Truncated so a huge HTML error
            # page cannot flood the ledger row.
            raise ProviderError(r.text[:500])
        data = r.json()
        messages = data.get("messages") or [{}]
        return messages[0].get("id", "")

    # --- inbound -----------------------------------------------------------

    def verify_signature(self, raw_body: bytes, signature_header: str | None) -> bool:
        """Validate `X-Hub-Signature-256` against the Meta app secret.

        Returns True when no app secret is configured, so that a local install
        works without one — callers that care report that state through
        `verify_configuration`. When a secret IS set, a missing or malformed
        header is a rejection, never a pass.
        """
        if not self.app_secret:
            return True
        if not signature_header:
            return False
        prefix = "sha256="
        if not signature_header.startswith(prefix):
            return False
        provided = signature_header[len(prefix) :]
        expected = hmac.new(
            self.app_secret.encode("utf-8"), raw_body, hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(provided, expected)

    def process_webhook(self, payload: dict) -> list[WebhookEvent]:
        """Flatten Meta's entry→changes→value nesting into events.

        Malformed input yields no events rather than an exception: a webhook
        receiver must not 500 on a payload it does not recognise, or Meta
        retries it forever.

        Provider message ids are validated here, at the boundary where they
        enter the process, because downstream they become filter values in
        control-plane queries. An id that fails validation is dropped with a
        warning rather than passed along.
        """
        events: list[WebhookEvent] = []
        if not isinstance(payload, dict):
            return events

        for entry in payload.get("entry") or []:
            if not isinstance(entry, dict):
                continue
            for change in entry.get("changes") or []:
                if not isinstance(change, dict):
                    continue
                value = change.get("value")
                if not isinstance(value, dict):
                    continue

                for status in value.get("statuses") or []:
                    if not isinstance(status, dict):
                        continue
                    message_id = str(status.get("id") or "")
                    if not is_safe_message_id(message_id):
                        logger.warning(
                            "whatsapp webhook: dropping status event with a "
                            "malformed provider message id (len=%d)",
                            len(message_id),
                        )
                        continue
                    errors = status.get("errors") or []
                    first_error = ""
                    if errors and isinstance(errors[0], dict):
                        first_error = str(
                            errors[0].get("title") or errors[0].get("message") or ""
                        )
                    events.append(
                        WebhookEvent(
                            kind="status",
                            provider_message_id=message_id,
                            status=str(status.get("status") or ""),
                            recipient=str(status.get("recipient_id") or ""),
                            error=first_error[:500],
                            raw=status,
                        )
                    )

                for message in value.get("messages") or []:
                    if not isinstance(message, dict):
                        continue
                    message_id = str(message.get("id") or "")
                    if not is_safe_message_id(message_id):
                        continue
                    events.append(
                        WebhookEvent(
                            kind="message",
                            provider_message_id=message_id,
                            recipient=str(message.get("from") or ""),
                            raw=message,
                        )
                    )
        return events

    # --- health ------------------------------------------------------------

    async def verify_configuration(self, client) -> ProviderStatus:
        """Report usability for /health/ready. Never returns secret values."""
        env = get_settings()
        missing: list[str] = []
        if not self.phone_number_id:
            missing.append("META_PHONE_NUMBER_ID")
        if not self.token:
            missing.append("META_ACCESS_TOKEN")
        if missing:
            return ProviderStatus(
                configured=False,
                detail="missing credentials: " + ", ".join(missing),
                missing=missing,
            )

        if not self.app_secret:
            return ProviderStatus(
                configured=True,
                detail=(
                    "credentials present; META_APP_SECRET is unset so inbound "
                    "webhook signatures are not verified"
                ),
            )
        if not env.meta_verify_token:
            return ProviderStatus(
                configured=True,
                detail=(
                    "credentials present; META_VERIFY_TOKEN is unset so the "
                    "webhook handshake cannot complete"
                ),
            )
        return ProviderStatus(configured=True, detail="credentials present")
