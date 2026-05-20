"""Prometheus metrics for the STAS API.

Exposes GET /metrics (Prometheus scrape endpoint) and provides
named histograms/gauges for instrumentation across services.

Metrics defined here:
  stas_simulation_duration_seconds   — histogram, labels: team_id
  stas_nlp_extraction_latency_seconds — histogram, labels: cached
  stas_graph_rebuild_duration_seconds — histogram
  stas_kafka_consumer_lag_seconds    — gauge, labels: topic, consumer_group
  stas_http_request_duration_seconds — histogram, labels: method, path, status_code

Usage in services:
    from apps.api.core.metrics import SIM_DURATION, NLP_LATENCY
    with SIM_DURATION.labels(team_id="platform").time():
        result = engine.run(...)
"""

from __future__ import annotations

import time
from typing import Awaitable, Callable

from fastapi import APIRouter
from fastapi.responses import Response
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    Counter,
    Gauge,
    Histogram,
    generate_latest,
)
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response as StarletteResponse

# ── Metric definitions ────────────────────────────────────────────────────────

SIM_DURATION = Histogram(
    "stas_simulation_duration_seconds",
    "Monte Carlo simulation wall-clock duration",
    ["team_id"],
    buckets=[0.1, 0.5, 1, 2, 5, 10, 30, 60],
)

NLP_LATENCY = Histogram(
    "stas_nlp_extraction_latency_seconds",
    "Claude NLP agent extraction latency (end-to-end, including GitHub fetch)",
    ["cached"],
    buckets=[1, 2, 5, 10, 20, 30, 60],
)

GRAPH_REBUILD_DURATION = Histogram(
    "stas_graph_rebuild_duration_seconds",
    "Duration of full graph rebuild pipeline (Airflow DAG)",
    buckets=[10, 30, 60, 120, 300, 600],
)

KAFKA_LAG = Gauge(
    "stas_kafka_consumer_lag_seconds",
    "Estimated consumer lag in seconds for a Kafka topic",
    ["topic", "consumer_group"],
)

HTTP_REQUEST_DURATION = Histogram(
    "stas_http_request_duration_seconds",
    "HTTP request duration",
    ["method", "path", "status_code"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
)

HTTP_REQUEST_COUNT = Counter(
    "stas_http_requests_total",
    "Total HTTP requests",
    ["method", "path", "status_code"],
)


# ── Starlette middleware ───────────────────────────────────────────────────────

_PATH_ALLOWLIST = {
    "/simulation/run",
    "/simulation/run-stream",
    "/candidates/extract",
    "/graph/teams",
    "/graph/metrics",
    "/health",
}


class MetricsMiddleware(BaseHTTPMiddleware):
    """Record HTTP duration for all requests."""

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[StarletteResponse]],
    ) -> StarletteResponse:
        start = time.perf_counter()
        response = await call_next(request)
        duration = time.perf_counter() - start

        # Normalise path — strip path params to reduce cardinality
        path = _normalise_path(request.url.path)
        method = request.method
        status = str(response.status_code)

        HTTP_REQUEST_DURATION.labels(method=method, path=path, status_code=status).observe(duration)
        HTTP_REQUEST_COUNT.labels(method=method, path=path, status_code=status).inc()

        return response


def _normalise_path(path: str) -> str:
    """Replace UUID/ID segments with {id} to avoid label explosion."""
    import re
    path = re.sub(r"/[0-9a-f\-]{8,}", "/{id}", path)
    path = re.sub(r"/cand_[a-z0-9]+", "/{candidate_id}", path)
    return path


# ── /metrics endpoint ─────────────────────────────────────────────────────────

metrics_router = APIRouter(tags=["ops"])


@metrics_router.get("/metrics", include_in_schema=False)
async def metrics() -> Response:
    """Prometheus scrape endpoint."""
    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST,
    )
