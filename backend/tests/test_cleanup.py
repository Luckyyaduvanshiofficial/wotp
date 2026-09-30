"""Retention pruning.

Two things are worth testing here beyond "it deletes old rows":

1. The cutoff maths, including the guard that refuses to prune the current
   month's audit rows — those are what the monthly cap counts.
2. That pruning actually walks the whole backlog rather than the first page,
   and that a dry run deletes nothing.
"""

import asyncio
from datetime import datetime, timedelta, timezone

from scripts.cleanup import (
    message_cutoff,
    month_start,
    otp_cutoff,
    prune,
)

NOW = datetime(2026, 9, 20, 12, 0, 0, tzinfo=timezone.utc)


def test_message_cutoff_never_enters_the_current_month():
    """A 1-day retention must not delete rows the monthly cap still counts."""
    cutoff = message_cutoff(NOW, 1)
    assert cutoff == month_start(NOW) == datetime(2026, 9, 1, tzinfo=timezone.utc)
    assert cutoff < NOW


def test_message_cutoff_uses_the_longer_window_when_it_is_older():
    cutoff = message_cutoff(NOW, 90)
    assert cutoff == datetime(2026, 6, 22, 12, 0, 0, tzinfo=timezone.utc)
    assert cutoff < month_start(NOW)


def test_message_cutoff_is_never_in_the_future():
    """0 days means "keep nothing old", not "delete everything"."""
    cutoff = message_cutoff(NOW, 0)
    assert cutoff <= NOW
    assert cutoff == month_start(NOW)


def test_otp_cutoff_is_a_plain_trailing_window():
    cutoff = otp_cutoff(NOW, 1)
    assert cutoff == NOW - timedelta(days=1)


def test_negative_retention_is_clamped():
    assert message_cutoff(NOW, -5) == month_start(NOW)
    assert otp_cutoff(NOW, -5) == NOW


class _FakePB:
    """Minimal record store: enough to exercise paging and deletion."""

    def __init__(self):
        self.records: dict[str, dict[str, dict]] = {}
        self.deleted: list[tuple[str, str]] = []

    def add(self, collection, record):
        self.records.setdefault(collection, {})[record["id"]] = dict(record)

    async def list(self, collection, *, filter=None, sort=None, per_page=1, **kw):
        rows = list(self.records.get(collection, {}).values())
        if filter:
            field, _, raw = filter.partition("<")
            raw = raw.strip().strip("'")
            rows = [r for r in rows if str(r.get(field) or "") < raw]
        rows.sort(key=lambda r: str(r.get("created") or ""))
        return {"items": rows[:per_page], "totalItems": len(rows)}

    async def delete(self, collection, record_id):
        self.deleted.append((collection, record_id))
        self.records.get(collection, {}).pop(record_id, None)


def _seed(pb, collection, count, date_field, values):
    for i, value in enumerate(values):
        pb.add(collection, {"id": f"{collection}-{i}", date_field: value,
                            "created": value})


def test_dry_run_deletes_nothing():
    pb = _FakePB()
    _seed(pb, "otp_codes", 3, "expires",
          ["2020-01-01 00:00:00"] * 3)
    _seed(pb, "messages", 3, "created",
          ["2020-01-01 00:00:00"] * 3)

    result = asyncio.run(prune(pb, otp_days=1, message_days=90, dry_run=True, now=NOW))
    assert result["otp_codes"] == 3
    assert result["messages"] == 3
    assert pb.deleted == []


def test_prunes_the_whole_backlog_not_just_one_page():
    pb = _FakePB()
    count = 250  # deliberately more than the 200-row page
    _seed(pb, "otp_codes", count, "expires", ["2020-01-01 00:00:00"] * count)

    result = asyncio.run(prune(pb, otp_days=1, message_days=90, dry_run=False, now=NOW))
    assert result["otp_codes"] == count
    assert len(pb.deleted) == count
    assert pb.records["otp_codes"] == {}


def test_prunes_expired_codes_but_keeps_live_ones():
    pb = _FakePB()
    _seed(pb, "otp_codes", 2, "expires",
          ["2020-01-01 00:00:00", "2099-01-01 00:00:00"])

    result = asyncio.run(prune(pb, otp_days=1, message_days=90, dry_run=False, now=NOW))
    assert result["otp_codes"] == 1
    assert [r["id"] for r in pb.records["otp_codes"].values()] == ["otp_codes-1"]


def test_current_month_audit_rows_survive_any_retention():
    """The monthly cap reads these; pruning them would restore spent quota."""
    pb = _FakePB()
    _seed(pb, "messages", 2, "created",
          ["2026-09-02 00:00:00",  # this month — must survive
           "2026-08-30 00:00:00"])  # last month

    result = asyncio.run(prune(pb, otp_days=1, message_days=1, dry_run=False, now=NOW))
    assert result["messages"] == 1
    remaining = [r["created"] for r in pb.records["messages"].values()]
    assert remaining == ["2026-09-02 00:00:00"]
