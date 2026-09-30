#!/usr/bin/env python
"""Create (or reuse) this installation's operator account.

This software ships operator-owned: there is no public signup, so the first
account is created here (or in the PocketBase admin UI). Everything else —
API keys, settings — is then managed from the dashboard as that operator.

Idempotent: running it again for an existing email reports the account and
changes nothing unless --reset-password is passed.

Usage:
    .venv/bin/python scripts/create_admin.py you@example.com 'a-strong-password'
    .venv/bin/python scripts/create_admin.py you@example.com 'new-password' --reset-password

The password is read from the argument or, if omitted, from the
WAOTP_ADMIN_PASSWORD env var (preferred: it keeps the secret out of your shell
history). It is never printed back.
"""

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("email", help="operator email (login for the dashboard)")
    parser.add_argument(
        "password",
        nargs="?",
        help="operator password (min 8 chars); omit to read WAOTP_ADMIN_PASSWORD",
    )
    parser.add_argument(
        "--reset-password",
        action="store_true",
        help="if the account already exists, set its password to the given value",
    )
    args = parser.parse_args()

    password = args.password or os.environ.get("WAOTP_ADMIN_PASSWORD") or ""
    if len(password) < 8:
        print(
            "error: password must be at least 8 characters (pass it as the second\n"
            "argument or set WAOTP_ADMIN_PASSWORD). PocketBase enforces this too.",
            file=sys.stderr,
        )
        return 1

    from app.core.config import get_settings
    from app.services.pocketbase import wa_collection

    cfg = get_settings()
    base = cfg.pb_url.rstrip("/")
    users = wa_collection("users")

    with httpx.Client(
        base_url=base,
        timeout=30,
        headers={"User-Agent": "waotp-create-admin/0.1"},
        follow_redirects=True,
    ) as http:
        r = http.post(
            "/api/collections/_superusers/auth-with-password",
            json={
                "identity": cfg.pb_superuser_email,
                "password": cfg.pb_superuser_password,
            },
        )
        if r.status_code != 200:
            print(
                f"error: PocketBase superuser auth failed ({r.status_code}). Check "
                f"PB_URL / PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD in .env — they "
                f"must match the superuser you created with "
                f"`./pocketbase superuser upsert`.",
                file=sys.stderr,
            )
            return 1
        headers = {"Authorization": r.json()["token"]}

        # look for an existing account first, so the common re-run is a no-op
        r = http.get(
            f"/api/collections/{users}/records",
            headers=headers,
            params={"filter": f"email='{args.email}'"},
        )
        if r.status_code >= 400:
            print(
                f"error: could not read {users} ({r.status_code}): {r.text[:300]}\n"
                f"Has the schema been provisioned? See docs/self-hosting.md.",
                file=sys.stderr,
            )
            return 1
        existing = (r.json().get("items") or [])

        if existing:
            user = existing[0]
            if not args.reset_password:
                print(
                    f"operator {args.email} already exists (id {user['id']}) — nothing "
                    f"to do. Pass --reset-password to change its password."
                )
                return 0
            r = http.patch(
                f"/api/collections/{users}/records/{user['id']}",
                headers=headers,
                json={"password": password, "passwordConfirm": password},
            )
            if r.status_code >= 400:
                print(f"error: password reset failed ({r.status_code}): "
                      f"{r.text[:300]}", file=sys.stderr)
                return 1
            print(f"password updated for operator {args.email} (id {user['id']})")
            return 0

        r = http.post(
            f"/api/collections/{users}/records",
            headers=headers,
            json={
                "email": args.email,
                "password": password,
                "passwordConfirm": password,
                "status": "active",
            },
        )
        if r.status_code >= 400:
            print(f"error: creating the operator failed ({r.status_code}): "
                  f"{r.text[:300]}", file=sys.stderr)
            return 1

        user = r.json()
        print(f"created operator {args.email} (id {user['id']})")
        print("\nNext: sign in at your dashboard, then create an API key for your app.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
