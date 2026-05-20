"""Slack thread consumer — writes RESOLVES_DOUBT_FOR edges to Neo4j.

Only processes events where resolved=True.
Idempotency via ProcessedEvent node keyed on event_id.
"""

from __future__ import annotations

import logging

from neo4j import AsyncDriver

from pipelines.kafka import topics
from pipelines.kafka.consumers.base import BaseTelemetryConsumer
from pipelines.kafka.serialization import SLACK_THREAD_SCHEMA

logger = logging.getLogger(__name__)


class SlackThreadConsumer(BaseTelemetryConsumer):
    def __init__(self, bootstrap_servers: str, driver: AsyncDriver) -> None:
        super().__init__(
            topic=topics.SLACK_THREAD_RESOLVED,
            group_id=topics.GROUP_SLACK_THREAD,
            bootstrap_servers=bootstrap_servers,
            driver=driver,
            avro_schema=SLACK_THREAD_SCHEMA,
        )

    async def process(self, record: dict) -> bool:
        event_id: str = record["event_id"]
        helper_id: str = record["helper_id"]
        asker_id: str = record["asker_id"]
        resolved: bool = record["resolved"]
        ts_ms: int = record["timestamp"]

        # Only unresolved threads don't contribute to knowledge flow
        if not resolved:
            logger.debug("Skipping unresolved thread event_id=%s", event_id)
            return False

        async with self.driver.session() as session:
            result = await session.run(
                """
                MERGE (ev:ProcessedEvent {id: $event_id})
                ON CREATE SET
                    ev.source     = 'slack',
                    ev.topic      = $topic,
                    ev.is_new     = true,
                    ev.created_at = datetime()
                RETURN ev.is_new AS is_new
                """,
                {"event_id": event_id, "topic": self.topic},
            )
            row = await result.single()
            if not row or not row["is_new"]:
                return False

            upsert = await session.run(
                """
                MATCH (helper:Engineer {id: $helper_id})
                MATCH (asker:Engineer  {id: $asker_id})
                MERGE (helper)-[r:RESOLVES_DOUBT_FOR]->(asker)
                ON CREATE SET
                    r.weight         = 1,
                    r.first_event_at = datetime({epochMillis: $ts_ms}),
                    r.last_event_at  = datetime({epochMillis: $ts_ms})
                ON MATCH SET
                    r.weight        = r.weight + 1,
                    r.last_event_at = datetime({epochMillis: $ts_ms})
                RETURN r.weight AS weight
                """,
                {"helper_id": helper_id, "asker_id": asker_id, "ts_ms": ts_ms},
            )
            edge_row = await upsert.single()
            if edge_row is None:
                logger.warning(
                    "Engineers not found: helper=%s asker=%s — event_id=%s",
                    helper_id,
                    asker_id,
                    event_id,
                )
                return False

            logger.debug(
                "RESOLVES_DOUBT_FOR weight=%s helper=%s asker=%s",
                edge_row["weight"],
                helper_id,
                asker_id,
            )
            return True
