"""Minimal async PocketBase REST client used as the superuser/system account.

All waotp collections are admin-only, so every read/write here goes through
superuser auth. Tokens are fetched lazily and refreshed once on 401.
"""

import httpx


class PocketBaseError(Exception):
    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(f"PocketBase {status_code}: {message[:300]}")


def wa_collection(name: str) -> str:
    """Logical collection name -> physical (prefixed) name on the PB instance."""
    from ..core.config import get_settings
    return f"{get_settings().pb_collections_prefix}{name}"


def pb_literal(value: str) -> str:
    """Quote a value as a PocketBase filter string literal, or refuse to.

    Filters are built by string interpolation, so any value that reaches one
    has to be safe to embed. A single quote would terminate the literal, and a
    backslash could escape the terminator depending on how the parser treats
    it — so both are rejected outright rather than escaped, on the principle
    that a value which needs escaping should not be in a filter at all.

    Values written here are record ids, phone numbers, sha256 hex digests and
    validated provider message ids: none of them legitimately contain either
    character, so a rejection means something upstream is wrong.
    """
    if "'" in value or "\\" in value:
        raise ValueError("value is not safe to embed in a PocketBase filter")
    return f"'{value}'"


class PBClient:
    def __init__(
        self,
        base_url: str,
        email: str,
        password: str,
        client: httpx.AsyncClient | None = None,
    ):
        self.base_url = base_url.rstrip("/")
        self._email = email
        self._password = password
        self._token: str | None = None
        # Read timeout must cover slow remote PB auth (bcrypt can take >15s on
        # small VPSes); the token is cached for the process lifetime after.
        self._client = client or httpx.AsyncClient(
            timeout=httpx.Timeout(45.0, connect=10.0)
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def _auth(self) -> None:
        r = await self._client.post(
            f"{self.base_url}/api/collections/_superusers/auth-with-password",
            json={"identity": self._email, "password": self._password},
        )
        if r.status_code != 200:
            raise PocketBaseError(r.status_code, "superuser auth failed")
        self._token = r.json()["token"]

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict | None = None,
        json_body: dict | None = None,
        token: str | None = None,
        retry_auth: bool = True,
    ) -> dict:
        if token is None and not self._token:
            await self._auth()
        headers = {"Authorization": token if token is not None else self._token}
        r = await self._client.request(
            method,
            f"{self.base_url}{path}",
            headers=headers,
            params=params,
            json=json_body,
        )
        if r.status_code == 401 and retry_auth and token is None:
            self._token = None
            await self._auth()
            return await self._request(
                method, path, params=params, json_body=json_body, retry_auth=False
            )
        if r.status_code >= 400:
            raise PocketBaseError(r.status_code, r.text)
        if r.status_code == 204:
            return {}
        return r.json()

    # -- record helpers -----------------------------------------------------

    async def list(
        self,
        collection: str,
        *,
        filter: str | None = None,
        fields: str | None = None,
        expand: str | None = None,
        sort: str | None = None,
        page: int = 1,
        per_page: int = 1,
    ) -> dict:
        params: dict = {"page": page, "perPage": per_page}
        if filter:
            params["filter"] = filter
        if fields:
            params["fields"] = fields
        if expand:
            params["expand"] = expand
        if sort:
            params["sort"] = sort
        return await self._request(
            "GET", f"/api/collections/{collection}/records", params=params
        )

    async def get_one(self, collection: str, record_id: str) -> dict:
        return await self._request("GET", f"/api/collections/{collection}/records/{record_id}")

    async def create(self, collection: str, data: dict) -> dict:
        return await self._request(
            "POST", f"/api/collections/{collection}/records", json_body=data
        )

    async def update(self, collection: str, record_id: str, data: dict) -> dict:
        return await self._request(
            "PATCH", f"/api/collections/{collection}/records/{record_id}", json_body=data
        )

    async def delete(self, collection: str, record_id: str) -> None:
        await self._request("DELETE", f"/api/collections/{collection}/records/{record_id}")

    # -- user token validation (dashboard auth) ------------------------------

    async def auth_refresh(self, user_token: str) -> dict:
        """Validate a wa-otp developer token; returns {"token": ..., "record": ...}.

        Targets the app's own auth collection ({prefix}users when running on a
        shared instance), NOT other apps' user pools. Raises
        PocketBaseError(401, ...) when the token is invalid/expired.
        """
        return await self._request(
            "POST",
            f"/api/collections/{wa_collection('users')}/auth-refresh",
            token=user_token,
        )
