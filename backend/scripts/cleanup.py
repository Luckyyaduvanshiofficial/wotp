#!/usr/bin/env python
"""Prune expired OTP codes and old audit rows.

Retention is a privacy decision as much as a storage one: the `messages`
collection is a record of which phone numbers this installation sent codes to
and when. Keep it as long as you need it, and no longer.

Usage:
    .venv/bin/python scripts/cleanup.py --dry-run          # count, delete nothing
    .venv/bin/python scripts/cleanup.py --yes              # apply the defaults
    .venv/bin/python scripts/cleanup.py --yes \
        --otp-retention-days 1 --message-retention-days 30

In Docker:
    docker compose exec api python scripts/cleanup.py --dry-run

THE ONE GUARD THAT MATTERS: this will never delete a `messages` row from the
current UTC month, whatever retention you ask for. Those rows are the monthly
send cap's source of truth (`monthly_used` counts billable rows in the current
month), so pruning them would silently hand the installation back quota it has
already spent. `--message-retention-days` is therefore an upper bound on what
may be pruned, not an instruction to prune that aggressively.

Collections this never touches: api_keys, settings, tg_links, users. Keys and
link records are live data, not logs.
"""

import argparse
import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Rows fetched per round trip. Small enough that a delete run is interruptible
# without losing much work, large enough not to hammer the control plane.
PAGE = 200

DEFAULT_OTP_RETENTION_DAYS = 1
DEFAULT_MESSAGE_RETENTION_DAYS = 90


def month_start(now: datetime) -> datetime:
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def message_cutoff(now: datetime, retention_days: int) -> datetime:
    """Newest `created` value an audit row may have and still be pruned.

    Capped at the start of the current UTC month so a short retention window
    cannot delete rows the monthly cap is still counting.
    """
    requested = now - timedelta(days=max(0, retention_days))
    return min(requested, month_start(now))


def otp_cutoff(now: datetime, retention_days: int) -> datetime:
    """OTP rows are keyed on `expires`, not `created`: once a code is expired
    it can never verify again, so it is safe to remove after a grace period."""
    return now - timedelta(days=max(0, retention_days))


def _pb_date(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


async def prune_collection(pb, collection: str, date_field: str, cutoff: datetime, *,
                           dry_run: bool) -> int:
    """Delete rows older than `cutoff`. Returns the number removed (or counted)."""
    flt = f"{date_field}<'{_pb_date(cutoff)}'"

    if dry_run:
        res = await pb.list(collection, filter=flt, per_page=1)
        return int(res.get("totalItems", 0))

    removed = 0
    while True:
        # Re-query the oldest page each round rather than paging by offset:
        # deleting rows shifts every later offset, which would skip records.
        res = await pb.list(collection, filter=flt, sort="created", per_page=PAGE)
        items = res.get("items") or []
        if not items:
            return removed
        for row in items:
            await pb.delete(collection, row["id"])
            removed += 1


async def prune(pb, *, otp_days: int, message_days: int, dry_run: bool,
                now: datetime | None = None) -> dict:
    from app.services.pocketbase import wotp_collection

    now = now or datetime.now(timezone.utc)
    expired_cutoff = otp_cutoff(now, otp_days)
    audit_cutoff = message_cutoff(now, message_days)

    otp_removed = await prune_collection(
        pb, wotp_collection("otp_codes"), "expires", expired_cutoff, dry_run=dry_run
    )
    messages_removed = await prune_collection(
        pb, wotp_collection("messages"), "created", audit_cutoff, dry_run=dry_run
    )
    return {
        "otp_codes": otp_removed,
        "messages": messages_removed,
        "otp_cutoff": _pb_date(expired_cutoff),
        "message_cutoff": _pb_date(audit_cutoff),
    }


async def run(args) -> int:
    from app.core.config import get_settings
    from app.services.pocketbase import PBClient

    cfg = get_settings()
    pb = PBClient(cfg.pb_url, cfg.pb_superuser_email, cfg.pb_superuser_password)
    try:
        result = await prune(
            pb,
            otp_days=args.otp_retention_days,
            message_days=args.message_retention_days,
            dry_run=args.dry_run,
        )
    finally:
        await pb.close()

    verb = "would remove" if args.dry_run else "removed"
    print(f"expired otp_codes (expires < {result['otp_cutoff']}): "
          f"{verb} {result['otp_codes']}")
    print(f"audit messages   (created < {result['message_cutoff']}): "
          f"{verb} {result['messages']}")
    if args.dry_run:
        print("\ndry run — nothing was deleted. Re-run with --yes to apply.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Prune expired OTP codes and old audit rows.",
        epilog=(
            "Never deletes messages rows from the current UTC month: they are "
            "what the monthly send cap counts. api_keys, settings, tg_links and "
            "users are never touched."
        ),
    )
    parser.add_argument("--otp-retention-days", type=int,
                        default=DEFAULT_OTP_RETENTION_DAYS,
                        help=f"keep expired codes this long (default "
                             f"{DEFAULT_OTP_RETENTION_DAYS})")
    parser.add_argument("--message-retention-days", type=int,
                        default=DEFAULT_MESSAGE_RETENTION_DAYS,
                        help=f"keep audit rows this long (default "
                             f"{DEFAULT_MESSAGE_RETENTION_DAYS})")
    parser.add_argument("--dry-run", action="store_true",
                        help="count what would be removed and exit")
    parser.add_argument("--yes", action="store_true",
                        help="required to actually delete anything")
    args = parser.parse_args()

    if not args.dry_run and not args.yes:
        print("refusing to delete without --yes (or use --dry-run to preview).",
              file=sys.stderr)
        return 1

    try:
        return asyncio.run(run(args))
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
