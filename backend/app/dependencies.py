"""Per-IP and per-key in-memory sliding-window rate limiters and the X-Api-Key
dependency.

API keys are stored sha256-hashed; lookup results are cached 60s, and *unknown*
hashes are cached negatively (shorter TTL) so a flood of invented keys cannot
be turned into a flood of PocketBase queries. Both limiters are process-local
(single uvicorn worker on the small VPS) — swap for Redis if that ever changes.
"""

import asyncio
import ipaddress
import time
from collections import OrderedDict, deque

import httpx
from fastapi import Request, Security
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer

from .core.config import get_settings
from .core.errors import (
    InvalidApiKey,
    InvalidUserToken,
    KeyDisabled,
    RateLimited,
    UpstreamUnavailable,
)
from .core.security import sha256_hex
from .services.pocketbase import PocketBaseError, wa_collection
from .services.settings import get_app_settings

_API_KEY_TTL = 60.0
_api_key_cache: dict[str, tuple[dict, float]] = {}

# Negative cache for key hashes PocketBase did not recognise. Without it, every
# request carrying a made-up key costs a control-plane query, so an
# unauthenticated caller can amplify one HTTP request into one database lookup.
# Short TTL: a key issued seconds ago must start working promptly.
_UNKNOWN_KEY_TTL = 30.0
# Bounded so the cache itself cannot be grown without limit by an attacker
# inventing keys. On overflow the oldest entries are dropped first.
_UNKNOWN_KEY_MAX = 4096
_unknown_key_cache: dict[str, float] = {}


class LockPool:
    """A bounded pool of asyncio.Lock, keyed by anything hashable.

    The keys here are owner ids and (owner, phone) pairs — both influenced by
    requests — so an unbounded dict of locks is a slow memory leak any caller
    with a valid key can drive: every distinct phone number they name allocates
    an entry that is never freed.

    Eviction is conservative. It only ever removes a lock that is **not
    currently held**, and never the key being requested, because dropping a lock
    that someone is waiting on would hand two coroutines their own lock for the
    same key and silently break the mutual exclusion this exists to provide.
    If every candidate is held, the pool grows past its bound rather than
    breaking correctness — memory is recoverable, a lost quota guard is not.
    """

    def __init__(self, max_size: int = 4096) -> None:
        self._max = max_size
        self._locks: OrderedDict = OrderedDict()

    def get(self, key) -> asyncio.Lock:
        lock = self._locks.get(key)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[key] = lock
            self._evict(exempt=key)
        else:
            self._locks.move_to_end(key)
        return lock

    def _evict(self, exempt) -> None:
        if len(self._locks) <= self._max:
            return
        for candidate in list(self._locks.keys()):
            if candidate == exempt:
                continue
            if not self._locks[candidate].locked():
                del self._locks[candidate]
                return

    def clear(self) -> None:
        self._locks.clear()

    def __len__(self) -> int:
        return len(self._locks)


# One entry per owner (sends) / (owner, phone) pair (verifies).
_owner_locks = LockPool()
_verify_locks = LockPool()


def owner_lock(owner_id: str) -> asyncio.Lock:
    """Serializes /v1/otp/send per OWNER (quota -> delivery -> ledger writes).

    Per owner, not per API key, and that distinction is the whole point: the
    monthly cap and the per-phone throttle are both owner-scoped, while one
    owner may hold several active keys. Keying the lock on the key would let
    two concurrent sends on two different keys of the same owner each pass the
    quota check before either wrote its ledger row — the exact double-spend
    this lock exists to prevent.
    """
    return _owner_locks.get(owner_id)


def verify_lock(owner_id: str, phone: str) -> asyncio.Lock:
    """Serializes /v1/otp/verify per (owner, phone): two concurrent verifies of
    the same code must not both consume the single-use row (double spend)."""
    return _verify_locks.get((owner_id, phone))


def invalidate_api_key(key_hash: str) -> None:
    """Drop a resolved key from the 60 s auth cache (regenerate/deactivate)."""
    _api_key_cache.pop(key_hash, None)


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = {}

    def check(self, key: str, limit: int, window_seconds: float = 60.0) -> bool:
        now = time.monotonic()
        hits = self._hits.setdefault(key, deque())
        while hits and now - hits[0] > window_seconds:
            hits.popleft()
        if len(hits) >= limit:
            return False
        hits.append(now)
        return True

    def reset(self) -> None:
        self._hits.clear()


rate_limiter = RateLimiter()
# Separate bucket namespace for per-IP limits so an IP and a key id that
# happen to share a string can never collide.
_ip_rate_limiter = RateLimiter()


def client_ip(request: Request) -> str:
    """Best-effort client address for rate limiting.

    `X-Forwarded-For` is client-supplied and therefore spoofable: trusting it
    unconditionally would let anyone bypass per-IP limits by rotating the
    header. It is only consulted when TRUST_PROXY_HEADERS is set, which should
    be true only when this app genuinely runs behind a reverse proxy.

    When it is trusted, the **right-most** entry is used, not the left-most.
    A proxy that overwrites the header leaves exactly one entry (either choice
    is then equivalent), while a proxy that appends leaves the client's own
    forged prefix to the left — reading left-most would hand the attacker a
    free rate-limit bypass. The value must also parse as an IP address, so a
    header full of garbage degrades to the socket peer rather than becoming a
    fresh limiter bucket per request.
    """
    if get_settings().trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            candidate = forwarded.split(",")[-1].strip()
            try:
                ipaddress.ip_address(candidate)
            except ValueError:
                pass
            else:
                return candidate
    return request.client.host if request.client else "unknown"


def _is_known_unknown(key_hash: str, now: float) -> bool:
    expires = _unknown_key_cache.get(key_hash)
    if expires is None:
        return False
    if now >= expires:
        del _unknown_key_cache[key_hash]
        return False
    return True


def _remember_unknown(key_hash: str, now: float) -> None:
    if len(_unknown_key_cache) >= _UNKNOWN_KEY_MAX:
        # Drop what has already expired; if that frees nothing, drop the
        # oldest insertion so the cache can never grow without bound.
        stale = [k for k, exp in _unknown_key_cache.items() if now >= exp]
        if stale:
            for k in stale:
                del _unknown_key_cache[k]
        else:
            del _unknown_key_cache[next(iter(_unknown_key_cache))]
    _unknown_key_cache[key_hash] = now + _UNKNOWN_KEY_TTL


class IdempotencyStore:
    """Replay cache for POST /v1/otp/send's optional Idempotency-Key header.

    Process-local like the rate limiter (single uvicorn worker; entries are
    lost on restart — a retry after a restart just sends a new code). Entries
    expire with the code TTL so a replay can never outlive the code it
    returned: past expiry, a retry must send a fresh code, not replay a dead
    one.

    An entry is (status_code, body), not just a body, because one failure is
    cached deliberately: the case where the provider accepted the message and
    the ledger write afterwards failed. That message was delivered, so a naive
    retry puts a second code on the user's phone — replaying the original error
    is the point. Ordinary failures (provider rejection, throttle, not-linked)
    are never cached and stay genuinely retryable.
    """

    def __init__(self) -> None:
        self._entries: dict[tuple[str, str], tuple[float, int, dict]] = {}

    def get(self, key: tuple[str, str]) -> tuple[int, dict] | None:
        entry = self._entries.get(key)
        if entry is None:
            return None
        expires, status, body = entry
        if time.monotonic() >= expires:
            del self._entries[key]
            return None
        return status, body

    def put(self, key: tuple[str, str], status: int, body: dict, ttl_seconds: float) -> None:
        if len(self._entries) > 10_000:  # bound memory: drop expired first
            now = time.monotonic()
            for stale in [k for k, (exp, _, _) in self._entries.items() if exp <= now]:
                del self._entries[stale]
        self._entries[key] = (time.monotonic() + ttl_seconds, status, body)

    def reset(self) -> None:
        self._entries.clear()


idempotency_store = IdempotencyStore()

# Declared as security objects (not plain Header) so FastAPI registers them
# in the OpenAPI securitySchemes — the Authorize button in /docs then works.
_api_key_header = APIKeyHeader(
    name="X-Api-Key",
    auto_error=False,
    description="Developer API key (waotp_…); shown once at creation.",
)
_dashboard_bearer = HTTPBearer(
    auto_error=False,
    description="PocketBase dashboard session token (login on the dashboard).",
)


async def resolve_api_key(request: Request, x_api_key: str | None) -> dict:
    """Returns {"api_key": row, "owner": user_row, "config": app_cfg}.

    The per-IP limiter runs FIRST, before the credential is looked at. That
    ordering is the whole point: it is the only gate that also applies to a
    caller presenting no valid credential, so it must not sit behind the
    credential check. The per-key limiter then applies on top of it.
    """
    # Cached for 60s and falls back to env values when PocketBase is down, so
    # this does not put a control-plane query on every unauthenticated request.
    app_cfg = await get_app_settings(request.app.state.pb)
    limit_enabled = get_settings().rate_limit_enabled

    if limit_enabled and not _ip_rate_limiter.check(
        client_ip(request), app_cfg["ratelimit_per_ip_per_min"]
    ):
        raise RateLimited(retry_after_seconds=60)

    if not x_api_key:
        raise InvalidApiKey(missing_header=True)

    key_hash = sha256_hex(x_api_key)
    now = time.monotonic()

    cached = _api_key_cache.get(key_hash)
    if cached and now - cached[1] < _API_KEY_TTL:
        api_key, owner = cached[0]
    else:
        # A key already known to be unknown: answer 401 without touching the
        # control plane. Without this, inventing keys is a free way to
        # generate database load.
        if _is_known_unknown(key_hash, now):
            raise InvalidApiKey()

        pb = request.app.state.pb
        res = await pb.list(wa_collection("api_keys"), filter=f"key_hash='{key_hash}'", per_page=1)
        items = res.get("items") or []
        if not items:
            _remember_unknown(key_hash, now)
            raise InvalidApiKey()
        api_key = items[0]
        if not api_key.get("active"):
            raise KeyDisabled()
        # owner lives in the app's own auth collection ({prefix}users when
        # running on a shared instance) — never in other apps' user pools
        owner = await pb.get_one(wa_collection("users"), api_key["owner"])
        if owner.get("status") == "suspended":
            raise KeyDisabled()
        _api_key_cache[key_hash] = ((api_key, owner), now)

    # Per-key budget sits on top of the per-IP one, so a leaked key cannot be
    # rotated to escape the IP gate (and one key cannot spend everyone's IP
    # budget on its own).
    if limit_enabled and not rate_limiter.check(api_key["id"], app_cfg["ratelimit_per_min"]):
        raise RateLimited(retry_after_seconds=60)

    return {"api_key": api_key, "owner": owner, "config": app_cfg}


async def require_api_key(
    request: Request, x_api_key: str | None = Security(_api_key_header)
) -> dict:
    return await resolve_api_key(request, x_api_key)


async def require_pb_user(
    request: Request, credentials: HTTPAuthorizationCredentials | None = Security(_dashboard_bearer)
) -> dict:
    """Dashboard auth: PocketBase user token in Authorization: Bearer <token>."""
    if credentials is None:
        raise InvalidUserToken()
    token = credentials.credentials
    try:
        res = await request.app.state.pb.auth_refresh(token)
    except PocketBaseError as exc:
        if exc.status_code == 401:
            raise InvalidUserToken() from exc
        raise UpstreamUnavailable() from exc
    except httpx.HTTPError as exc:  # PB unreachable is not a bad token
        raise UpstreamUnavailable() from exc
    return res.get("record") or {}
