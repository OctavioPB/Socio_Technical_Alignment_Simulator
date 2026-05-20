"""FastAPI router — /simulation endpoints.

POST /simulation/run              — synchronous (≤ 200 nodes, ≤ 1 000 iterations)
POST /simulation/run-stream       — SSE stream with progress for large runs
GET  /simulation/results/{id}     — retrieve a cached result by result_id
POST /simulation/share/{id}       — create a shareable token for a result
GET  /simulation/report/{token}   — fetch a shared result by token (no auth)
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from neo4j import AsyncDriver

from apps.api.core.config import settings
from apps.api.core.rate_limit import SIM_RUN_LIMIT, limiter
from apps.api.services.simulation_engine import SimulationService
from simulation.models import SimulationRequest, SimulationResult

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/simulation", tags=["simulation"])

_SYNC_NODE_LIMIT = 200
_SYNC_ITER_LIMIT = 1_000


# ── Dependency ────────────────────────────────────────────────────────────────


def _get_driver(request: Request) -> AsyncDriver:
    return request.app.state.neo4j_driver


def _get_service(driver: AsyncDriver = Depends(_get_driver)) -> SimulationService:
    return SimulationService(driver)


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post(
    "/run",
    response_model=SimulationResult,
    summary="Run a synchronous simulation (small graphs)",
    status_code=status.HTTP_200_OK,
)
@limiter.limit(SIM_RUN_LIMIT)
async def run_simulation(
    request: Request,
    body: SimulationRequest,
    service: SimulationService = Depends(_get_service),
) -> SimulationResult:
    """Synchronous endpoint for graphs ≤ 200 nodes and ≤ 1 000 iterations.

    For larger runs use POST /simulation/run-stream.
    """
    if body.n_iterations > _SYNC_ITER_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"n_iterations={body.n_iterations} exceeds the sync limit"
                f" ({_SYNC_ITER_LIMIT}).  Use /simulation/run-stream instead."
            ),
        )
    return await service.run(
        team_id=body.team_id,
        candidate=body.candidate,
        n_iterations=body.n_iterations,
        seed=body.seed,
    )


@router.post(
    "/run-stream",
    summary="Stream a simulation (large graphs / many iterations)",
    response_class=StreamingResponse,
)
@limiter.limit(SIM_RUN_LIMIT)
async def run_simulation_stream(
    request: Request,
    body: SimulationRequest,
    service: SimulationService = Depends(_get_service),
) -> StreamingResponse:
    """SSE stream that emits progress events every 100 iterations, then the result.

    Event types:
      {"type": "progress", "pct": 0.25, "n": 250}
      {"type": "result",   "data": { ...SimulationResult... }}
      {"type": "error",    "detail": "..."}
    """

    async def event_stream() -> AsyncGenerator[str, None]:
        queue: asyncio.Queue[dict] = asyncio.Queue()
        loop = asyncio.get_event_loop()

        def _on_progress(pct: float, n: int) -> None:
            loop.call_soon_threadsafe(
                queue.put_nowait,
                {"type": "progress", "pct": round(pct, 2), "n": n},
            )

        async def _run() -> None:
            try:
                result = await service.run(
                    team_id=body.team_id,
                    candidate=body.candidate,
                    n_iterations=body.n_iterations,
                    seed=body.seed,
                    progress_callback=_on_progress,
                )
                await queue.put({"type": "result", "data": result.model_dump()})
            except Exception as exc:
                logger.exception("Simulation stream failed")
                await queue.put({"type": "error", "detail": str(exc)})

        sim_task = asyncio.create_task(_run())

        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=0.5)
            except asyncio.TimeoutError:
                # Keep the connection alive while simulation runs
                yield ": keepalive\n\n"
                continue

            yield f"data: {json.dumps(event)}\n\n"

            if event["type"] in ("result", "error"):
                break

        await sim_task  # propagate any unhandled exception

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get(
    "/results/{result_id}",
    response_model=SimulationResult,
    summary="Retrieve a cached simulation result",
)
async def get_result(
    result_id: str,
    service: SimulationService = Depends(_get_service),
) -> SimulationResult:
    """Fetch a previously completed simulation result from the Redis cache.

    Results are retained for 24 hours after the run completes.
    """
    result = await service.get_result(result_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Simulation result '{result_id}' not found or expired.",
        )
    return result


# ── Shareable report endpoints ────────────────────────────────────────────────

_REPORT_TTL = 86_400 * 7  # 7 days
_REPORT_KEY = "stas:report:{}"


async def _report_redis():
    """Return a redis.asyncio client for report storage, or None."""
    try:
        import redis.asyncio as aioredis  # type: ignore[import]

        client = aioredis.from_url(settings.redis_url, decode_responses=True)
        await client.ping()
        return client
    except Exception:
        logger.warning("Redis unavailable — shareable reports will not be stored.")
        return None


@router.post(
    "/share/{result_id}",
    response_model=dict[str, str],
    status_code=status.HTTP_201_CREATED,
    summary="Create a shareable token for a simulation result",
)
async def share_result(
    result_id: str,
    service: SimulationService = Depends(_get_service),
) -> dict[str, str]:
    """Generate a shareable URL token for a simulation result.

    The token grants read-only access to the report for 7 days without
    requiring authentication — suitable for sharing with hiring managers.
    """
    result = await service.get_result(result_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Simulation result '{result_id}' not found or expired.",
        )

    token = str(uuid.uuid4())
    client = await _report_redis()
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Redis unavailable — cannot create shareable report.",
        )
    try:
        await client.setex(_REPORT_KEY.format(token), _REPORT_TTL, result.model_dump_json())
    finally:
        await client.aclose()

    return {"token": token}


@router.get(
    "/report/{token}",
    response_model=SimulationResult,
    summary="Retrieve a shared simulation report by token (no auth required)",
)
async def get_shared_report(token: str) -> SimulationResult:
    """Fetch a shared simulation report using its token.

    No authentication is required — the token grants read-only access.
    Reports expire after 7 days.
    """
    client = await _report_redis()
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Redis unavailable.",
        )
    try:
        raw = await client.get(_REPORT_KEY.format(token))
    finally:
        await client.aclose()

    if not raw:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report token '{token}' not found or has expired.",
        )

    return SimulationResult.model_validate_json(raw)
