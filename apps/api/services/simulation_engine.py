"""Async service layer wrapping the Monte Carlo simulation engine.

Responsibilities:
  - Fetch a frozen GraphSnapshot from Neo4j via GraphService
  - Run the CPU-bound SimulationEngine in a thread pool (asyncio.to_thread)
  - Cache results in Redis (TTL = 24 h) keyed by result_id
  - Return cached results by result_id for GET /simulation/results/{id}
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Callable

from neo4j import AsyncDriver

from apps.api.core.config import settings
from apps.api.core.metrics import SIM_DURATION
from apps.api.models.graph_models import CandidateInsert
from apps.api.services.graph_service import GraphService
from simulation.models import SimulationResult
from simulation.monte_carlo import SimulationEngine

logger = logging.getLogger(__name__)

_engine = SimulationEngine()


class SimulationService:
    """Async façade over the synchronous SimulationEngine."""

    def __init__(self, driver: AsyncDriver) -> None:
        self._graph = GraphService(driver)

    async def run(
        self,
        team_id: str,
        candidate: CandidateInsert,
        n_iterations: int = 1_000,
        seed: int = 42,
        progress_callback: Callable[[float, int], None] | None = None,
    ) -> SimulationResult:
        """Run simulation; cache result in Redis; return SimulationResult."""
        snapshot = await self._graph.get_team_graph(team_id)

        with SIM_DURATION.labels(team_id=team_id).time():
            result: SimulationResult = await asyncio.to_thread(
                _engine.run,
                snapshot,
                candidate,
                n_iterations,
                seed,
                progress_callback,
            )

        await _cache_result(result)
        return result

    async def get_result(self, result_id: str) -> SimulationResult | None:
        """Retrieve a previously cached SimulationResult by result_id."""
        return await _load_result(result_id)


# ── Redis caching helpers ─────────────────────────────────────────────────────

_CACHE_TTL = 86_400  # 24 hours in seconds


async def _get_redis():  # type: ignore[return]
    """Return a redis.asyncio client, or None if Redis is unavailable."""
    try:
        import redis.asyncio as aioredis  # type: ignore[import]

        client = aioredis.from_url(settings.redis_url, decode_responses=True)
        await client.ping()
        return client
    except Exception:
        logger.warning("Redis unavailable — simulation results will not be cached.")
        return None


async def _cache_result(result: SimulationResult) -> None:
    client = await _get_redis()
    if client is None:
        return
    try:
        await client.setex(
            f"stas:sim:{result.result_id}",
            _CACHE_TTL,
            result.model_dump_json(),
        )
    except Exception as exc:
        logger.warning("Failed to cache simulation result %s: %s", result.result_id, exc)
    finally:
        await client.aclose()


async def _load_result(result_id: str) -> SimulationResult | None:
    client = await _get_redis()
    if client is None:
        return None
    try:
        raw = await client.get(f"stas:sim:{result_id}")
        if raw is None:
            return None
        return SimulationResult.model_validate(json.loads(raw))
    except Exception as exc:
        logger.warning("Failed to load simulation result %s: %s", result_id, exc)
        return None
    finally:
        await client.aclose()
