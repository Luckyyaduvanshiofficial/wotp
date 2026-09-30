#!/usr/bin/env python
"""Register the Telegram webhook (reads the bot token from this app's config).

Usage:
    .venv/bin/python scripts/set_telegram_webhook.py https://api.yourdomain.in
"""

import argparse
import asyncio
import sys
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("public_base_url", help="public base URL of the FastAPI service")
    args = parser.parse_args()

    from app.core.config import get_settings
    from app.services.pocketbase import PBClient
    from app.services.settings import get_app_settings

    async def run() -> int:
        cfg = get_settings()
        pb = PBClient(cfg.pb_url, cfg.pb_superuser_email, cfg.pb_superuser_password)
        app_cfg = await get_app_settings(pb)
        bot_token = app_cfg["tg_bot_token"]
        await pb.close()
        if not bot_token:
            print(
                "no Telegram bot token configured — set TELEGRAM_BOT_TOKEN in "
                "backend/.env (or the tg_bot_token field in the PocketBase "
                "settings row) first",
                file=sys.stderr,
            )
            return 1
        secret = cfg.telegram_webhook_secret
        if not secret:
            print("TELEGRAM_WEBHOOK_SECRET not set in env", file=sys.stderr)
            return 1

        url = f"{args.public_base_url.rstrip('/')}/telegram/webhook"
        async with httpx.AsyncClient(timeout=15) as http:
            r = await http.post(
                f"https://api.telegram.org/bot{bot_token}/setWebhook",
                json={
                    "url": url,
                    "secret_token": secret,
                    "allowed_updates": ["message"],
                },
            )
        data = r.json()
        print("setWebhook:", data.get("result") or data)
        return 0 if data.get("ok") else 1

    return asyncio.run(run())


if __name__ == "__main__":
    raise SystemExit(main())
