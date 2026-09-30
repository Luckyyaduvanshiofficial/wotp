#!/bin/sh
# PocketBase entrypoint: bootstrap the superuser once, then serve.
#
# Why a marker file instead of running `superuser upsert` on every boot:
# upsert sets the password to whatever is in the environment, so doing it
# unconditionally would silently revert a password the operator later changed in
# the admin UI. Creating it once per data volume, and never again, avoids that
# whole class of surprise.
set -eu

DATA_DIR="${PB_DATA_DIR:-/pb/pb_data}"
MARKER="${DATA_DIR}/.superuser-provisioned"

if [ ! -f "$MARKER" ]; then
    if [ -z "${PB_SUPERUSER_EMAIL:-}" ] || [ -z "${PB_SUPERUSER_PASSWORD:-}" ]; then
        echo "error: this looks like a fresh PocketBase data directory, but" >&2
        echo "       PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD are not set." >&2
        echo "" >&2
        echo "       The API cannot reach PocketBase without a superuser, so" >&2
        echo "       refusing to start. Set both in your .env — see" >&2
        echo "       backend/.env.example." >&2
        exit 1
    fi

    if [ "${#PB_SUPERUSER_PASSWORD}" -lt 8 ]; then
        echo "error: PB_SUPERUSER_PASSWORD must be at least 8 characters" >&2
        echo "       (PocketBase enforces this)." >&2
        exit 1
    fi

    # `superuser upsert` is only called on a fresh volume, so it always means
    # "create". Existing data is never overwritten.
    /pb/pocketbase superuser upsert "$PB_SUPERUSER_EMAIL" "$PB_SUPERUSER_PASSWORD"

    # Only touch the marker after a successful create, so a failed boot is
    # retried on the next start instead of being remembered as done.
    touch "$MARKER"
    echo "created PocketBase superuser ${PB_SUPERUSER_EMAIL}"
fi

exec /pb/pocketbase serve --http=0.0.0.0:8090 --dir="$DATA_DIR"
