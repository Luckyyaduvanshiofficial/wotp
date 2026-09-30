#!/usr/bin/env python
"""Create (or reuse) a dev developer account + API key against the local
PocketBase, and print the plaintext API key once.

Usage:
    .venv/bin/python scripts/seed_dev.py dev@waotp.local test1234
"""

import argparse
import hashlib
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("email", help="developer email (PB users auth record)")
    parser.add_argument("password", help="developer password (min 8 chars)")
    parser.add_argument("--label", default="dev")
    args = parser.parse_args()

    from app.core.config import get_settings
    from app.services.pocketbase import wa_collection

    cfg = get_settings()
    base = cfg.pb_url.rstrip("/")

    # Cloudflare-fronted PB hosts hold the default python-httpx UA; send a
    # custom one and allow generous timeouts.
    with httpx.Client(
        base_url=base, timeout=30,
        headers={"User-Agent": "waotp-seed/0.1"}, follow_redirects=True,
    ) as http:
        r = http.post(
            "/api/collections/_superusers/auth-with-password",
            json={"identity": cfg.pb_superuser_email, "password": cfg.pb_superuser_password},
        )
        if r.status_code != 200:
            print(f"superuser auth failed: {r.status_code} {r.text[:200]}", file=sys.stderr)
            return 1
        token = r.json()["token"]
        headers = {"Authorization": token}

        # create or reuse the developer user (in the app's own auth collection
        # — {prefix}users when targeting a shared PocketBase instance)
        r = http.post(
            f"/api/collections/{wa_collection('users')}/records",
            headers=headers,
            json={"email": args.email, "password": args.password,
                  "passwordConfirm": args.password, "status": "active"},
        )
        err = r.text.lower()
        if r.status_code == 400 and ("already exists" in err or "must be unique" in err
                                     or "validation_not_unique" in err):
            r = http.get(
                f"/api/collections/{wa_collection('users')}/records",
                headers=headers,
                params={"filter": f"email='{args.email}'"},
            )
            user = r.json()["items"][0]
            print(f"reusing existing user {user['id']}")
        elif r.status_code >= 400:
            print(f"user create failed: {r.status_code} {r.text[:300]}", file=sys.stderr)
            return 1
        else:
            user = r.json()
            print(f"created user {user['id']}")

        # issue an API key (plaintext printed once); the physical collection is
        # prefixed when the app targets a shared PocketBase instance
        plaintext = "waotp_" + secrets.token_hex(20)
        r = http.post(
            f"/api/collections/{wa_collection('api_keys')}/records",
            headers=headers,
            json={
                "owner": user["id"],
                "key_hash": hashlib.sha256(plaintext.encode()).hexdigest(),
                "last4": plaintext[-4:],
                "label": args.label,
                "active": True,
            },
        )
        if r.status_code >= 400:
            print(f"api key create failed: {r.status_code} {r.text[:300]}", file=sys.stderr)
            return 1

        print("\n=== API KEY (shown once — store it now) ===")
        print(plaintext)
        print("===========================================")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
