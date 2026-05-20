"""JWT authentication dependency for FastAPI routes.

Verifies Clerk-issued JWTs using JWKS public key fetching.

Usage:
    @router.get("/protected")
    async def endpoint(claims: JWTClaims = Depends(require_auth)):
        tenant_id = claims.org_id or claims.sub

In dev: set CLERK_JWKS_URL="" to bypass validation (returns dummy claims).
In prod: set CLERK_JWKS_URL to your Clerk JWKS endpoint, e.g.:
    https://<clerk-domain>/.well-known/jwks.json
"""

from __future__ import annotations

import logging
import time
from typing import Annotated

import httpx
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwk, jwt
from pydantic import BaseModel

from apps.api.core.config import settings

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=False)

# JWKS key cache: {kid: public_key, "_fetched_at": timestamp}
_JWKS_CACHE: dict[str, object] = {}
_JWKS_CACHE_TTL = 3600  # 1 hour


class JWTClaims(BaseModel):
    sub: str
    org_id: str | None = None
    email: str | None = None
    exp: int = 0


async def _fetch_jwks() -> dict[str, object]:
    """Fetch and cache the JWKS key set from Clerk."""
    now = time.time()
    fetched_at = _JWKS_CACHE.get("_fetched_at", 0)
    if _JWKS_CACHE and now - float(str(fetched_at)) < _JWKS_CACHE_TTL:
        return {k: v for k, v in _JWKS_CACHE.items() if k != "_fetched_at"}

    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.get(settings.clerk_jwks_url)
        resp.raise_for_status()
        data = resp.json()

    _JWKS_CACHE.clear()
    for key_data in data.get("keys", []):
        kid = key_data.get("kid", "default")
        _JWKS_CACHE[kid] = jwk.construct(key_data)
    _JWKS_CACHE["_fetched_at"] = now  # type: ignore[assignment]

    return {k: v for k, v in _JWKS_CACHE.items() if k != "_fetched_at"}


async def require_auth(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Security(_bearer)]
) -> JWTClaims:
    """Dependency: verifies the Bearer JWT and returns parsed claims.

    Raises HTTP 401 if the token is missing, expired, or has an invalid signature.
    Bypassed when CLERK_JWKS_URL is unset (dev mode only).
    """
    # Dev bypass — explicitly opt out of auth by leaving CLERK_JWKS_URL empty
    if not settings.clerk_jwks_url:
        return JWTClaims(sub="dev-user", org_id="dev-org")

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    try:
        header = jwt.get_unverified_header(token)
        kid = header.get("kid", "default")
        keys = await _fetch_jwks()
        public_key = keys.get(kid)
        if public_key is None:
            # Try re-fetching once — key rotation
            _JWKS_CACHE.clear()
            keys = await _fetch_jwks()
            public_key = keys.get(kid)
        if public_key is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unknown signing key.",
            )

        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
        return JWTClaims(
            sub=payload["sub"],
            org_id=payload.get("org_id"),
            email=payload.get("email"),
            exp=payload.get("exp", 0),
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except httpx.HTTPError as exc:
        logger.warning("JWKS fetch failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth service unavailable.",
        ) from exc
