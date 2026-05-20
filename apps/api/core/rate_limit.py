"""Per-tenant API rate limiting using slowapi (limits library).

Limits:
  - Simulation runs:        100/hour  per tenant (org_id or IP)
  - Candidate extractions:   20/hour  per tenant
  - Graph reads:            600/hour  per tenant (10/min effective)

Backend: Redis (shared state across API replicas). Falls back to in-memory
if Redis is unavailable — suitable for single-replica deployments only.

Usage in routers:
    from apps.api.core.rate_limit import limiter, SIM_RUN_LIMIT

    @router.post("/run")
    @limiter.limit(SIM_RUN_LIMIT)
    async def run_simulation(request: Request, ...):
        ...
"""

from __future__ import annotations

import logging

from slowapi import Limiter
from slowapi.util import get_remote_address

from apps.api.core.config import settings

logger = logging.getLogger(__name__)

# ── Limit strings ─────────────────────────────────────────────────────────────

SIM_RUN_LIMIT = f"{settings.rate_limit_sim_per_hour}/hour"
EXTRACT_LIMIT = f"{settings.rate_limit_extract_per_hour}/hour"
GRAPH_READ_LIMIT = "600/hour"


def _get_tenant_key(request) -> str:  # type: ignore[no-untyped-def]
    """Use org_id from JWT claims if available, else fall back to IP."""
    claims = getattr(request.state, "jwt_claims", None)
    if claims and getattr(claims, "org_id", None):
        return f"tenant:{claims.org_id}"
    return get_remote_address(request)


def _build_limiter() -> Limiter:
    try:
        return Limiter(
            key_func=_get_tenant_key,
            storage_uri=settings.redis_url,
            default_limits=["1000/hour"],
        )
    except Exception as exc:
        logger.warning("Rate limiter Redis unavailable (%s) — using in-memory backend.", exc)
        return Limiter(
            key_func=_get_tenant_key,
            default_limits=["1000/hour"],
        )


limiter = _build_limiter()
