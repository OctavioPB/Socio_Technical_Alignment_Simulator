"""Abstract base consumer with DLQ routing, idempotency, and Prometheus metrics.

Contract for subclasses:
  - Implement process(record) to write the event to Neo4j.
  - Return True from process() if the event was written; False if skipped (idempotent).
  - Raise any exception to trigger DLQ routing.
"""

from __future__ import annotations

import json
import logging
import time
from abc import ABC, abstractmethod
from typing import Any

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from neo4j import AsyncDriver

from pipelines.kafka.metrics import (
    CONSUMER_LAG,
    EVENTS_FAILED,
    EVENTS_PROCESSED,
    EVENTS_SKIPPED,
)
from pipelines.kafka.serialization import deserialize

logger = logging.getLogger(__name__)


class BaseTelemetryConsumer(ABC):
    def __init__(
        self,
        topic: str,
        group_id: str,
        bootstrap_servers: str,
        driver: AsyncDriver,
        avro_schema: dict,
    ) -> None:
        self.topic = topic
        self.group_id = group_id
        self.bootstrap_servers = bootstrap_servers
        self.driver = driver
        self.avro_schema = avro_schema
        self.dlq_topic = f"stas.dlq.{group_id}"

        self._consumer: AIOKafkaConsumer | None = None
        self._producer: AIOKafkaProducer | None = None
        self._running = False

    # ─── Lifecycle ────────────────────────────────────────────────────────────

    async def start(self) -> None:
        self._consumer = AIOKafkaConsumer(
            self.topic,
            bootstrap_servers=self.bootstrap_servers,
            group_id=self.group_id,
            auto_offset_reset="earliest",
            enable_auto_commit=False,
        )
        self._producer = AIOKafkaProducer(bootstrap_servers=self.bootstrap_servers)
        await self._consumer.start()
        await self._producer.start()
        self._running = True
        logger.info("Consumer started topic=%s group=%s dlq=%s", self.topic, self.group_id, self.dlq_topic)

    async def stop(self) -> None:
        self._running = False
        if self._consumer:
            await self._consumer.stop()
        if self._producer:
            await self._producer.stop()
        logger.info("Consumer stopped topic=%s", self.topic)

    async def run(self) -> None:
        await self.start()
        try:
            async for message in self._consumer:  # type: ignore[union-attr]
                await self._handle_message(message)
                await self._update_lag(message)
        finally:
            await self.stop()

    # ─── Message handling ─────────────────────────────────────────────────────

    async def _handle_message(self, message: Any) -> None:
        try:
            record = deserialize(message.value, self.avro_schema)
            written = await self.process(record)
            await self._consumer.commit()  # type: ignore[union-attr]
            if written:
                EVENTS_PROCESSED.labels(topic=self.topic).inc()
            else:
                EVENTS_SKIPPED.labels(topic=self.topic).inc()
        except Exception:
            logger.exception(
                "Failed to process message from %s offset=%s — routing to DLQ",
                self.topic,
                message.offset,
            )
            await self._route_to_dlq(message)
            await self._consumer.commit()  # type: ignore[union-attr]
            EVENTS_FAILED.labels(topic=self.topic).inc()

    async def _route_to_dlq(self, message: Any) -> None:
        payload = json.dumps(
            {
                "original_topic": self.topic,
                "partition": message.partition,
                "offset": message.offset,
                "raw": message.value.decode("utf-8", errors="replace"),
            }
        ).encode()
        await self._producer.send_and_wait(self.dlq_topic, payload)  # type: ignore[union-attr]

    async def _update_lag(self, message: Any) -> None:
        try:
            partitions = self._consumer.assignment()  # type: ignore[union-attr]
            for tp in partitions:
                end_offsets = await self._consumer.end_offsets([tp])  # type: ignore[union-attr]
                committed = await self._consumer.committed(tp)  # type: ignore[union-attr]
                if committed is not None and tp in end_offsets:
                    lag = end_offsets[tp] - committed
                    CONSUMER_LAG.labels(topic=tp.topic, partition=tp.partition).set(lag)
        except Exception:
            pass  # lag tracking is best-effort

    # ─── Subclass contract ────────────────────────────────────────────────────

    @abstractmethod
    async def process(self, record: dict) -> bool:
        """Process a deserialized event. Return True if written, False if skipped."""
        ...
