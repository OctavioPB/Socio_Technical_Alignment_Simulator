"""FastAPI /admin router — database management and synthetic data seeding.

Endpoints:
    GET    /admin/stats        — graph + Redis statistics
    POST   /admin/seed         — seed synthetic demo data (idempotent)
    DELETE /admin/graph        — wipe all nodes and relationships
    DELETE /admin/redis        — flush all stas:* Redis keys
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from neo4j import AsyncDriver

from apps.api.core.config import settings
from apps.api.services.seeder import clear_graph, clear_redis, get_graph_stats, seed_graph

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])


def _get_driver(request: Request) -> AsyncDriver:
    return request.app.state.neo4j_driver  # type: ignore[no-any-return]


@router.get(
    "/stats",
    summary="Graph and cache statistics",
)
async def stats(driver: AsyncDriver = Depends(_get_driver)) -> dict:
    """Return current node/edge counts and Redis key count."""
    try:
        return await get_graph_stats(driver, settings.redis_url)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Stats query failed: {exc}",
        )


@router.post(
    "/seed",
    status_code=status.HTTP_200_OK,
    summary="Seed synthetic demo data",
)
async def seed(driver: AsyncDriver = Depends(_get_driver)) -> dict:
    """Insert 4 teams (24 engineers, ~150 edges) into Neo4j.

    Uses MERGE — safe to run multiple times. Existing data is not removed first;
    call DELETE /admin/graph beforehand for a clean slate.
    """
    try:
        result = await seed_graph(driver)
        logger.info("Admin seed complete: %s", result)
        return result
    except Exception as exc:
        logger.exception("Seed failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Seed failed: {exc}",
        )


@router.delete(
    "/graph",
    status_code=status.HTTP_200_OK,
    summary="Wipe all graph nodes and relationships",
)
async def delete_graph(driver: AsyncDriver = Depends(_get_driver)) -> dict:
    """Delete every node and relationship in Neo4j. Irreversible."""
    try:
        result = await clear_graph(driver)
        logger.warning("Admin graph clear: %s", result)
        return result
    except Exception as exc:
        logger.exception("Graph clear failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Clear failed: {exc}",
        )


@router.delete(
    "/redis",
    status_code=status.HTTP_200_OK,
    summary="Flush all stas:* Redis cache keys",
)
async def delete_redis_cache() -> dict:
    """Delete every key matching stas:* from Redis (candidate profiles, sim results)."""
    try:
        result = await clear_redis(settings.redis_url)
        logger.info("Admin Redis clear: %s", result)
        return result
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )
    except Exception as exc:
        logger.exception("Redis clear failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Redis clear failed: {exc}",
        )
