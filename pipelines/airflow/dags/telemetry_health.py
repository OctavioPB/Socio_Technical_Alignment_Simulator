"""stas_telemetry_health — hourly Kafka pipeline health check.

Checks that telemetry consumers are keeping up with incoming events and that
dead-letter queues are not accumulating. Fires a Slack alert when thresholds
are breached.

Thresholds (configurable via env vars):
  STAS_LAG_THRESHOLD   — max messages consumer may lag behind latest offset
                         (default 1000 ≈ 5 min at normal throughput)
  STAS_DLQ_THRESHOLD   — max messages allowed in any DLQ (default 10)

Schedule: every hour | SLA: 10 minutes
"""

from __future__ import annotations

import asyncio
import os
from datetime import timedelta

from airflow.decorators import dag, task
from airflow.utils.dates import days_ago

_ALL_TOPICS = (
    "stas.github.pr.reviewed",
    "stas.slack.thread.resolved",
    "stas.jira.ticket.blocked",
)
_ALL_DLQ_TOPICS = (
    "stas.dlq.stas-pr-review-consumer",
    "stas.dlq.stas-slack-thread-consumer",
    "stas.dlq.stas-jira-block-consumer",
)


def _slack_alert(context: dict) -> None:
    webhook = os.environ.get("SLACK_ALERT_WEBHOOK_URL", "")
    if not webhook:
        return
    import requests

    dag_id = context["dag"].dag_id
    task_id = context["task_instance"].task_id
    run_id = context.get("run_id", "")
    requests.post(
        webhook,
        json={
            "text": (
                f":red_circle: *STAS* — `{dag_id}` / `{task_id}` failed"
                f" (run: `{run_id}`)"
            )
        },
        timeout=5,
    )


@dag(
    dag_id="stas_telemetry_health",
    schedule="0 * * * *",
    start_date=days_ago(1),
    catchup=False,
    default_args={
        "owner": "stas-team",
        "retries": 1,
        "retry_delay": timedelta(minutes=2),
        "sla": timedelta(minutes=10),
        "on_failure_callback": _slack_alert,
    },
    tags=["stas", "telemetry", "health"],
    doc_md=__doc__,
)
def stas_telemetry_health() -> None:
    @task
    def check_consumer_lag() -> dict:
        """Return messages-behind-latest per topic.

        For each source topic, compares the committed offset of the STAS health
        check consumer group against the latest offset.  A high lag value means
        the telemetry consumers are falling behind ingest.
        """
        bootstrap = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")

        async def _measure() -> dict:
            from aiokafka import AIOKafkaConsumer, TopicPartition

            lag: dict[str, int] = {}
            for topic in _ALL_TOPICS:
                # Lightweight end-offset consumer (no group)
                scanner = AIOKafkaConsumer(
                    bootstrap_servers=bootstrap,
                    auto_offset_reset="latest",
                )
                await scanner.start()
                try:
                    partitions = scanner.partitions_for_topic(topic) or set()
                    tps = [TopicPartition(topic, p) for p in sorted(partitions)]
                    end_offsets: dict = await scanner.end_offsets(tps)
                finally:
                    await scanner.stop()

                if not tps:
                    lag[topic] = 0
                    continue

                # Check committed offsets for the production consumer group
                group_id = f"stas-{topic.replace('.', '-')}-consumer"
                checker = AIOKafkaConsumer(
                    topic,
                    bootstrap_servers=bootstrap,
                    group_id=group_id,
                    auto_offset_reset="latest",
                    enable_auto_commit=False,
                )
                await checker.start()
                try:
                    committed = {
                        tp: (await checker.committed(tp) or 0) for tp in tps
                    }
                finally:
                    await checker.stop()

                lag[topic] = sum(
                    max(0, end_offsets[tp] - committed[tp]) for tp in tps
                )
            return lag

        return asyncio.run(_measure())

    @task
    def check_dlq_depth() -> dict:
        """Return the latest-offset (≈ depth) of each DLQ topic.

        DLQ messages are never consumed automatically, so the latest offset
        is a reliable proxy for unprocessed failure count.
        """
        bootstrap = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")

        async def _measure() -> dict:
            from aiokafka import AIOKafkaConsumer, TopicPartition

            depths: dict[str, int] = {}
            consumer = AIOKafkaConsumer(
                bootstrap_servers=bootstrap,
                auto_offset_reset="latest",
            )
            await consumer.start()
            try:
                for dlq in _ALL_DLQ_TOPICS:
                    partitions = consumer.partitions_for_topic(dlq) or set()
                    if not partitions:
                        depths[dlq] = 0
                        continue
                    tps = [TopicPartition(dlq, p) for p in sorted(partitions)]
                    end_offsets = await consumer.end_offsets(tps)
                    depths[dlq] = sum(end_offsets.values())
            finally:
                await consumer.stop()
            return depths

        return asyncio.run(_measure())

    @task
    def send_alert_if_breached(lag: dict, dlq_depth: dict) -> None:
        """Fire a Slack alert if any health threshold is exceeded."""
        lag_threshold = int(os.environ.get("STAS_LAG_THRESHOLD", "1000"))
        dlq_threshold = int(os.environ.get("STAS_DLQ_THRESHOLD", "10"))

        breaches: list[str] = []

        for topic, messages_behind in lag.items():
            if messages_behind > lag_threshold:
                breaches.append(
                    f"Consumer lag on `{topic}`: {messages_behind} msgs"
                    f" (threshold: {lag_threshold})"
                )

        for dlq, depth in dlq_depth.items():
            if depth > dlq_threshold:
                breaches.append(
                    f"DLQ `{dlq}`: {depth} msgs (threshold: {dlq_threshold})"
                )

        if not breaches:
            return

        webhook = os.environ.get("SLACK_ALERT_WEBHOOK_URL", "")
        if not webhook:
            import logging

            logging.warning("STAS health breach (no webhook configured): %s", breaches)
            return

        import requests

        requests.post(
            webhook,
            json={
                "text": (
                    ":fire: *STAS Telemetry Health Alert*\n"
                    + "\n".join(f"• {b}" for b in breaches)
                )
            },
            timeout=5,
        )

    consumer_lag = check_consumer_lag()
    dlq = check_dlq_depth()
    send_alert_if_breached(consumer_lag, dlq)


stas_telemetry_health_dag = stas_telemetry_health()
