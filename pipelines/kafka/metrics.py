"""Prometheus metrics for the telemetry consumer service.

Exported on port 9090 by consumer_main.py via prometheus_client.start_http_server().
Grafana dashboard scrapes this endpoint.

Metric naming follows the STAS convention: stas_{subsystem}_{name}_{unit}.
"""

from prometheus_client import Counter, Gauge

# ─── Event counters ───────────────────────────────────────────────────────────

EVENTS_PROCESSED = Counter(
    "stas_events_processed_total",
    "Total telemetry events successfully processed and written to Neo4j.",
    ["topic"],
)

EVENTS_FAILED = Counter(
    "stas_events_failed_total",
    "Total telemetry events that failed processing and were routed to DLQ.",
    ["topic"],
)

EVENTS_SKIPPED = Counter(
    "stas_events_skipped_total",
    "Total telemetry events skipped due to idempotency (already processed).",
    ["topic"],
)

# ─── Consumer lag ─────────────────────────────────────────────────────────────

CONSUMER_LAG = Gauge(
    "stas_kafka_consumer_lag_messages",
    "Kafka consumer lag in number of messages behind the latest offset.",
    ["topic", "partition"],
)

# ─── Neo4j write latency ──────────────────────────────────────────────────────

GRAPH_WRITE_LATENCY = Gauge(
    "stas_graph_write_latency_seconds",
    "Latency of individual Neo4j edge upsert operations.",
    ["relationship_type"],
)
