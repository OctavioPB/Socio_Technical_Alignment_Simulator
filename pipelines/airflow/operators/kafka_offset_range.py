"""KafkaOffsetRangeOperator — bounded event replay via timestamp-based offset lookup.

Returns a dict mapping partition number → {topic, start_offset, end_offset,
start_timestamp_ms} via XCom.  Downstream rebuild tasks use this to consume
only the events that fall within the rebuild window, avoiding a full topic
replay on every DAG run.
"""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, timedelta
from typing import Any

try:
    from airflow.models import BaseOperator  # type: ignore[import]

    _BASE: type = BaseOperator
except ImportError:
    _BASE = object


class KafkaOffsetRangeOperator(_BASE):  # type: ignore[misc]
    """Airflow operator — look up Kafka offset range for a lookback window."""

    ui_color = "#C8982A"

    def __init__(
        self,
        task_id: str,
        topic: str,
        lookback_hours: int = 24,
        kafka_bootstrap_servers: str | None = None,
        **kwargs: Any,
    ) -> None:
        if _BASE is not object:
            super().__init__(task_id=task_id, **kwargs)
        else:
            self.task_id = task_id

        self.topic = topic
        self.lookback_hours = lookback_hours
        self._bootstrap_servers = kafka_bootstrap_servers

    @property
    def bootstrap_servers(self) -> str:
        return self._bootstrap_servers or os.environ.get(
            "KAFKA_BOOTSTRAP_SERVERS", "localhost:9092"
        )

    def _log(self, msg: str, *args: object) -> None:
        try:
            self.log.info(msg, *args)  # type: ignore[attr-defined]
        except AttributeError:
            print(msg % args if args else msg)

    # ── Airflow entry point ───────────────────────────────────────────────────

    def execute(self, context: Any) -> dict:  # noqa: ARG002
        result = asyncio.run(self._fetch_offset_range())
        self._log("Offset range for %s: %s", self.topic, result)
        return result

    # ── Core logic (testable without Airflow) ─────────────────────────────────

    async def _fetch_offset_range(self) -> dict:
        from aiokafka import AIOKafkaConsumer  # type: ignore[import]

        consumer = AIOKafkaConsumer(
            bootstrap_servers=self.bootstrap_servers,
            auto_offset_reset="earliest",
        )
        await consumer.start()
        try:
            return await self._resolve_offsets(consumer)
        finally:
            await consumer.stop()

    async def _resolve_offsets(self, consumer: Any) -> dict:
        from aiokafka import TopicPartition  # type: ignore[import]

        partitions = consumer.partitions_for_topic(self.topic) or set()
        if not partitions:
            self._log("No partitions found for topic %s — returning empty range", self.topic)
            return {}

        tps = [TopicPartition(self.topic, p) for p in sorted(partitions)]
        cutoff_ms = int(
            (datetime.utcnow() - timedelta(hours=self.lookback_hours)).timestamp() * 1000
        )

        offsets_for_time = await consumer.offsets_for_times({tp: cutoff_ms for tp in tps})
        end_offsets = await consumer.end_offsets(tps)

        return {
            tp.partition: {
                "topic": self.topic,
                "start_offset": offsets_for_time[tp].offset if offsets_for_time[tp] else 0,
                "end_offset": end_offsets[tp],
                "start_timestamp_ms": cutoff_ms,
            }
            for tp in tps
        }
