# ADR-004 — Observability Stack

**Date:** 2026-05-18  
**Status:** Accepted  
**Deciders:** Engineering Lead, Infra Lead

---

## Context

With STAS approaching production, we need visibility into simulation throughput, API latency, NLP extraction performance, and Kafka consumer health. Prior to Sprint 9, the telemetry consumer emitted Prometheus metrics from port 9090, but no API metrics existed and there was no Grafana dashboard.

## Decision

### 1. Prometheus Metrics (FastAPI)

`apps/api/core/metrics.py` defines four STAS-specific metrics:

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `stas_simulation_duration_seconds` | Histogram | `team_id` | Monte Carlo wall-clock |
| `stas_nlp_extraction_latency_seconds` | Histogram | `cached` | Claude API + GitHub fetch |
| `stas_graph_rebuild_duration_seconds` | Histogram | — | Airflow DAG (future) |
| `stas_kafka_consumer_lag_seconds` | Gauge | `topic`, `consumer_group` | Consumer health |
| `stas_http_request_duration_seconds` | Histogram | `method`, `path`, `status_code` | Per-route latency |

`MetricsMiddleware` (Starlette) records HTTP duration for every request. Path labels are normalised (`/{id}`, `/{candidate_id}`) to prevent label explosion from UUIDs.

The `GET /metrics` endpoint (Prometheus text format) is served by the API only when `METRICS_ENABLED=true`.

### 2. Structured JSON Logging

`apps/api/core/logging_config.py` configures `python-json-logger` to emit structured JSON log records with:

- `timestamp` (ISO-8601)
- `level`
- `logger` (dotted module path)  
- `message`
- `trace_id` (injected per-request from `ContextVar`)
- `service: stas-api` (static)

In development (`LOG_FORMAT=text`), falls back to coloured human-readable format. **Zero PII in log output** — `nlp_agent.py` never logs `github_url`, `candidate_id`, or transcript content.

### 3. Grafana Dashboard (Provisioned)

`docker/grafana/provisioning/` contains auto-provisioned Grafana datasource (Prometheus) and dashboard (`stas_overview.json`) with 6 panels:

- Simulation throughput (req/min, including rate-limited)
- Simulation duration p50/p95/p99
- NLP extraction latency p50/p95
- API p99 latency by endpoint
- Kafka consumer lag (max per topic)
- HTTP error rate (4xx/5xx per minute)

Grafana accessible at `http://localhost:3001` (dev). Default password via `GRAFANA_ADMIN_PASSWORD` env var.

### 4. Sentry (Frontend + API)

Frontend: Next.js instrumentation hooks (`instrumentation.ts`, `sentry.*.config.ts`) capture uncaught errors and performance traces. `NEXT_PUBLIC_SENTRY_DSN` env var enables Sentry.

API: `sentry-sdk[fastapi]` integrated in `main.py` lifespan when `SENTRY_DSN` is set. `send_default_pii=False` enforced.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| OpenTelemetry only | OTEL collector is additional infra; Prometheus native is simpler for our scale |
| Datadog APM | Cost; vendor lock-in; Prometheus is open-source and self-hosted |
| ELK stack for logs | Over-engineered for STAS scale; structured JSON + grep is sufficient until log volume grows |
| Custom metrics endpoint | prometheus_client is the Python standard; no reason to reinvent |

## Consequences

- `prometheus-client`, `python-json-logger`, `sentry-sdk[fastapi]` added to `pyproject.toml`
- `METRICS_ENABLED`, `LOG_LEVEL`, `LOG_FORMAT`, `SENTRY_DSN`, `ENVIRONMENT` added to `Settings`
- Docker Compose gains Prometheus (port 9091) and Grafana (port 3001) services
- Prometheus scrapes `api:8000/metrics` and `telemetry:9090/metrics`
