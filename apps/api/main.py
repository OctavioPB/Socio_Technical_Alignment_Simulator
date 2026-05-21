from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from apps.api.core.config import settings
from apps.api.core.logging_config import configure_logging
from apps.api.core.metrics import MetricsMiddleware, metrics_router
from apps.api.core.neo4j_driver import create_driver
from apps.api.core.rate_limit import limiter
from apps.api.routers import admin, analysis, candidates, graph, simulation, telemetry

# ── Logging (must happen before any other logger.X calls) ─────────────────────
configure_logging(level=settings.log_level, fmt=settings.log_format)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # ── Sentry (prod only) ─────────────────────────────────────────────────
    if settings.sentry_dsn:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration

        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.environment,
            release=settings.release,
            traces_sample_rate=0.1,
            integrations=[StarletteIntegration(), FastApiIntegration()],
            send_default_pii=False,
        )
        logger.info("Sentry initialised (environment=%s)", settings.environment)

    # ── Vault secret injection (prod only) ─────────────────────────────────
    if settings.vault_addr and settings.vault_token:
        await _load_vault_secrets()

    # ── Neo4j ──────────────────────────────────────────────────────────────
    driver = create_driver()
    await driver.verify_connectivity()
    app.state.neo4j_driver = driver

    # ── Kafka producer (optional — degraded mode if Kafka is unavailable) ──
    app.state.kafka_producer = None
    try:
        from aiokafka import AIOKafkaProducer

        producer = AIOKafkaProducer(bootstrap_servers=settings.kafka_bootstrap_servers)
        await producer.start()
        app.state.kafka_producer = producer
        logger.info("Kafka producer connected to %s", settings.kafka_bootstrap_servers)
    except Exception:
        logger.warning(
            "Kafka unavailable at %s — telemetry webhooks will not publish events.",
            settings.kafka_bootstrap_servers,
        )

    yield

    # ── Shutdown ────────────────────────────────────────────────────────────
    if app.state.kafka_producer:
        await app.state.kafka_producer.stop()
    await driver.close()


async def _load_vault_secrets() -> None:
    """Fetch secrets from HashiCorp Vault and overlay onto settings at runtime."""
    try:
        import hvac  # type: ignore[import]

        client = hvac.Client(url=settings.vault_addr, token=settings.vault_token)
        secret = client.secrets.kv.v2.read_secret_version(path=settings.vault_path)
        data: dict = secret["data"]["data"]

        # Overlay secrets — only recognised keys
        overlay_map = {
            "neo4j_password": "neo4j_password",
            "anthropic_api_key": "anthropic_api_key",
            "github_webhook_secret": "GITHUB_WEBHOOK_SECRET",
            "slack_signing_secret": "SLACK_SIGNING_SECRET",
            "jira_webhook_secret": "JIRA_WEBHOOK_SECRET",
        }
        for vault_key, settings_key in overlay_map.items():
            if vault_key in data:
                object.__setattr__(settings, settings_key.lower(), data[vault_key])
        logger.info("Vault secrets loaded from %s", settings.vault_path)
    except Exception as exc:
        logger.error("Vault secret load failed: %s — proceeding with env vars", exc)


app = FastAPI(
    title="STAS API",
    description="Socio-Technical Alignment Simulator — Graph + Simulation API",
    version="0.4.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── Rate limiter state ─────────────────────────────────────────────────────────
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": f"Rate limit exceeded: {exc.detail}. Retry after the limit window."},
        headers={"Retry-After": "3600"},
    )


# ── Middleware ─────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if settings.metrics_enabled:
    app.add_middleware(MetricsMiddleware)

# ── Routers ────────────────────────────────────────────────────────────────────
app.include_router(graph.router)
app.include_router(telemetry.router)
app.include_router(simulation.router)
app.include_router(candidates.router)
app.include_router(analysis.router)
app.include_router(admin.router)

if settings.metrics_enabled:
    app.include_router(metrics_router)


@app.get("/health", tags=["ops"])
async def health() -> dict[str, str]:
    kafka_ok = app.state.kafka_producer is not None
    return {
        "status": "ok",
        "service": "stas-api",
        "version": "0.4.0",
        "environment": settings.environment,
        "kafka": "connected" if kafka_ok else "degraded",
    }
