"""Jira block consumer — writes BLOCKS_TICKET_OF edges to Neo4j.

Idempotency via ProcessedEvent node keyed on event_id.
Edge weight is the cumulative blocking count; duration_hours is stored for analytics.
"""

from __future__ import annotations

import logging

from neo4j import AsyncDriver

from pipelines.kafka import topics
from pipelines.kafka.consumers.base import BaseTelemetryConsumer
from pipelines.kafka.serialization import JIRA_BLOCK_SCHEMA

logger = logging.getLogger(__name__)


class JiraBlockConsumer(BaseTelemetryConsumer):
    def __init__(self, bootstrap_servers: str, driver: AsyncDriver) -> None:
        super().__init__(
            topic=topics.JIRA_TICKET_BLOCKED,
            group_id=topics.GROUP_JIRA_BLOCK,
            bootstrap_servers=bootstrap_servers,
            driver=driver,
            avro_schema=JIRA_BLOCK_SCHEMA,
        )

    async def process(self, record: dict) -> bool:
        event_id: str = record["event_id"]
        blocker_id: str = record["blocker_id"]
        blocked_id: str = record["blocked_id"]
        duration_hours: float = record["duration_hours"]
        ts_ms: int = record["timestamp"]

        async with self.driver.session() as session:
            result = await session.run(
                """
                MERGE (ev:ProcessedEvent {id: $event_id})
                ON CREATE SET
                    ev.source     = 'jira',
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
                MATCH (blocker:Engineer {id: $blocker_id})
                MATCH (blocked:Engineer {id: $blocked_id})
                MERGE (blocker)-[r:BLOCKS_TICKET_OF]->(blocked)
                ON CREATE SET
                    r.weight           = 1,
                    r.total_hours      = $duration_hours,
                    r.first_event_at   = datetime({epochMillis: $ts_ms}),
                    r.last_event_at    = datetime({epochMillis: $ts_ms})
                ON MATCH SET
                    r.weight        = r.weight + 1,
                    r.total_hours   = r.total_hours + $duration_hours,
                    r.last_event_at = datetime({epochMillis: $ts_ms})
                RETURN r.weight AS weight
                """,
                {
                    "blocker_id": blocker_id,
                    "blocked_id": blocked_id,
                    "duration_hours": duration_hours,
                    "ts_ms": ts_ms,
                },
            )
            edge_row = await upsert.single()
            if edge_row is None:
                logger.warning(
                    "Engineers not found: blocker=%s blocked=%s — event_id=%s",
                    blocker_id,
                    blocked_id,
                    event_id,
                )
                return False

            logger.debug(
                "BLOCKS_TICKET_OF weight=%s blocker=%s blocked=%s duration=%.1fh",
                edge_row["weight"],
                blocker_id,
                blocked_id,
                duration_hours,
            )
            return True
