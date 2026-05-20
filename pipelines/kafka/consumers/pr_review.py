"""PR review consumer — writes REVIEWS_PR_OF edges to Neo4j.

Idempotency: each event_id is recorded as a ProcessedEvent node.
  - First processing: writes edge, increments weight.
  - Repeat processing: no-op (returns False).

Edge weight = cumulative count. Sprint 3 Airflow DAG recomputes rolling 90-day window.
"""

from __future__ import annotations

import logging

from neo4j import AsyncDriver

from pipelines.kafka import topics
from pipelines.kafka.consumers.base import BaseTelemetryConsumer
from pipelines.kafka.serialization import PR_REVIEW_SCHEMA

logger = logging.getLogger(__name__)


class PrReviewConsumer(BaseTelemetryConsumer):
    def __init__(self, bootstrap_servers: str, driver: AsyncDriver) -> None:
        super().__init__(
            topic=topics.PR_REVIEWED,
            group_id=topics.GROUP_PR_REVIEW,
            bootstrap_servers=bootstrap_servers,
            driver=driver,
            avro_schema=PR_REVIEW_SCHEMA,
        )

    async def process(self, record: dict) -> bool:
        event_id: str = record["event_id"]
        reviewer_id: str = record["reviewer_id"]
        author_id: str = record["author_id"]
        ts_ms: int = record["timestamp"]  # epoch ms from Avro timestamp-millis

        async with self.driver.session() as session:
            # Atomic idempotency check-and-mark
            result = await session.run(
                """
                MERGE (ev:ProcessedEvent {id: $event_id})
                ON CREATE SET
                    ev.source    = 'github',
                    ev.topic     = $topic,
                    ev.is_new    = true,
                    ev.created_at = datetime()
                RETURN ev.is_new AS is_new
                """,
                {"event_id": event_id, "topic": self.topic},
            )
            row = await result.single()
            if not row or not row["is_new"]:
                logger.debug("Skipping duplicate event_id=%s", event_id)
                return False

            # Upsert REVIEWS_PR_OF edge; engineers must already exist in graph
            upsert = await session.run(
                """
                MATCH (reviewer:Engineer {id: $reviewer_id})
                MATCH (author:Engineer   {id: $author_id})
                MERGE (reviewer)-[r:REVIEWS_PR_OF]->(author)
                ON CREATE SET
                    r.weight         = 1,
                    r.first_event_at = datetime({epochMillis: $ts_ms}),
                    r.last_event_at  = datetime({epochMillis: $ts_ms})
                ON MATCH SET
                    r.weight        = r.weight + 1,
                    r.last_event_at = datetime({epochMillis: $ts_ms})
                RETURN r.weight AS weight
                """,
                {
                    "reviewer_id": reviewer_id,
                    "author_id": author_id,
                    "ts_ms": ts_ms,
                },
            )
            edge_row = await upsert.single()
            if edge_row is None:
                logger.warning(
                    "Engineers not found in graph: reviewer=%s author=%s — event_id=%s",
                    reviewer_id,
                    author_id,
                    event_id,
                )
                return False

            logger.debug(
                "REVIEWS_PR_OF weight=%s reviewer=%s author=%s",
                edge_row["weight"],
                reviewer_id,
                author_id,
            )
            return True
