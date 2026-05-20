"""Sprint 2 — Telemetry consumer integration tests.

Tests invoke consumer.process() directly against a real Neo4j instance.
No Kafka required — we test the graph mutation logic, idempotency, and
DLQ-triggering (exception on unknown engineers) in isolation.
"""

from __future__ import annotations

import time
import uuid

import pytest
from neo4j import AsyncDriver

from pipelines.kafka.consumers.jira_block import JiraBlockConsumer
from pipelines.kafka.consumers.pr_review import PrReviewConsumer
from pipelines.kafka.consumers.slack_thread import SlackThreadConsumer

pytestmark = pytest.mark.asyncio

_NOW_MS = int(time.time() * 1000)


def _make_pr_event(
    reviewer_id: str = "reviewer-eng",
    author_id: str = "author-eng",
    event_id: str | None = None,
) -> dict:
    return {
        "event_id": event_id or str(uuid.uuid4()),
        "reviewer_id": reviewer_id,
        "author_id": author_id,
        "repo": "org/test-repo",
        "pr_number": 42,
        "timestamp": _NOW_MS,
    }


def _make_slack_event(
    helper_id: str = "reviewer-eng",
    asker_id: str = "author-eng",
    resolved: bool = True,
    event_id: str | None = None,
) -> dict:
    return {
        "event_id": event_id or str(uuid.uuid4()),
        "helper_id": helper_id,
        "asker_id": asker_id,
        "channel": "C0TEST",
        "thread_ts": f"{int(time.time())}.000000",
        "resolved": resolved,
        "timestamp": _NOW_MS,
    }


def _make_jira_event(
    blocker_id: str = "reviewer-eng",
    blocked_id: str = "author-eng",
    event_id: str | None = None,
) -> dict:
    return {
        "event_id": event_id or str(uuid.uuid4()),
        "blocker_id": blocker_id,
        "blocked_id": blocked_id,
        "issue_key": "TEST-123",
        "duration_hours": 4.0,
        "timestamp": _NOW_MS,
    }


def _make_consumer(cls, driver: AsyncDriver):
    """Construct a consumer without connecting to Kafka."""
    consumer = cls.__new__(cls)
    consumer.topic = "test.topic"
    consumer.group_id = "test-group"
    consumer.bootstrap_servers = "mock:9092"
    consumer.driver = driver
    consumer.dlq_topic = "test.dlq"
    consumer._consumer = None
    consumer._producer = None
    consumer._running = False
    match cls.__name__:
        case "PrReviewConsumer":
            from pipelines.kafka.serialization import PR_REVIEW_SCHEMA
            consumer.avro_schema = PR_REVIEW_SCHEMA
        case "SlackThreadConsumer":
            from pipelines.kafka.serialization import SLACK_THREAD_SCHEMA
            consumer.avro_schema = SLACK_THREAD_SCHEMA
        case "JiraBlockConsumer":
            from pipelines.kafka.serialization import JIRA_BLOCK_SCHEMA
            consumer.avro_schema = JIRA_BLOCK_SCHEMA
    return consumer


# ─── PR Review consumer ───────────────────────────────────────────────────────


class TestPrReviewConsumer:
    async def test_process_creates_reviews_pr_of_edge(
        self, neo4j_driver: AsyncDriver, seeded_engineers: list[str]
    ) -> None:
        consumer = _make_consumer(PrReviewConsumer, neo4j_driver)
        written = await consumer.process(_make_pr_event())
        assert written is True

        async with neo4j_driver.session() as session:
            result = await session.run(
                "MATCH (:Engineer {id:'reviewer-eng'})-[r:REVIEWS_PR_OF]->(:Engineer {id:'author-eng'})"
                " RETURN r.weight AS w"
            )
            row = await result.single()
            assert row is not None
            assert row["w"] == 1

    async def test_process_increments_weight_on_second_event(
        self, neo4j_driver: AsyncDriver, seeded_engineers: list[str]
    ) -> None:
        consumer = _make_consumer(PrReviewConsumer, neo4j_driver)
        await consumer.process(_make_pr_event(event_id="evt-001"))
        await consumer.process(_make_pr_event(event_id="evt-002"))

        async with neo4j_driver.session() as session:
            result = await session.run(
                "MATCH (:Engineer {id:'reviewer-eng'})-[r:REVIEWS_PR_OF]->(:Engineer {id:'author-eng'})"
                " RETURN r.weight AS w"
            )
            row = await result.single()
            assert row["w"] == 2

    async def test_idempotent_same_event_id_not_double_counted(
        self, neo4j_driver: AsyncDriver, seeded_engineers: list[str]
    ) -> None:
        consumer = _make_consumer(PrReviewConsumer, neo4j_driver)
        event = _make_pr_event(event_id="idempotent-evt-001")
        written1 = await consumer.process(event)
        written2 = await consumer.process(event)
        assert written1 is True
        assert written2 is False  # skipped on second processing

        async with neo4j_driver.session() as session:
            result = await session.run(
                "MATCH (:Engineer)-[r:REVIEWS_PR_OF]->(:Engineer) RETURN r.weight AS w"
            )
            row = await result.single()
            assert row["w"] == 1  # not 2

    async def test_processed_event_node_created(
        self, neo4j_driver: AsyncDriver, seeded_engineers: list[str]
    ) -> None:
        consumer = _make_consumer(PrReviewConsumer, neo4j_driver)
        event_id = str(uuid.uuid4())
        await consumer.process(_make_pr_event(event_id=event_id))

        async with neo4j_driver.session() as session:
            result = await session.run(
                "MATCH (ev:ProcessedEvent {id: $id}) RETURN ev.source AS src",
                {"id": event_id},
            )
            row = await result.single()
            assert row is not None
            assert row["src"] == "github"

    async def test_unknown_engineers_returns_false(
        self, neo4j_driver: AsyncDriver, clean_db: None
    ) -> None:
        """If engineers don't exist in the graph, process() returns False (no edge, no crash)."""
        consumer = _make_consumer(PrReviewConsumer, neo4j_driver)
        event = _make_pr_event(reviewer_id="ghost-1", author_id="ghost-2")
        written = await consumer.process(event)
        assert written is False


# ─── Slack Thread consumer ────────────────────────────────────────────────────


class TestSlackThreadConsumer:
    async def test_resolved_thread_creates_edge(
        self, neo4j_driver: AsyncDriver, seeded_engineers: list[str]
    ) -> None:
        consumer = _make_consumer(SlackThreadConsumer, neo4j_driver)
        written = await consumer.process(_make_slack_event(resolved=True))
        assert written is True

        async with neo4j_driver.session() as session:
            result = await session.run(
                "MATCH ()-[r:RESOLVES_DOUBT_FOR]->() RETURN r.weight AS w"
            )
            row = await result.single()
            assert row["w"] == 1

    async def test_unresolved_thread_does_not_create_edge(
        self, neo4j_driver: AsyncDriver, seeded_engineers: list[str]
    ) -> None:
        consumer = _make_consumer(SlackThreadConsumer, neo4j_driver)
        written = await consumer.process(_make_slack_event(resolved=False))
        assert written is False

        async with neo4j_driver.session() as session:
            result = await session.run("MATCH ()-[r:RESOLVES_DOUBT_FOR]->() RETURN count(r) AS cnt")
            row = await result.single()
            assert row["cnt"] == 0

    async def test_idempotent_resolved_thread(
        self, neo4j_driver: AsyncDriver, seeded_engineers: list[str]
    ) -> None:
        consumer = _make_consumer(SlackThreadConsumer, neo4j_driver)
        event = _make_slack_event(resolved=True, event_id="slack-idem-001")
        await consumer.process(event)
        written = await consumer.process(event)
        assert written is False

        async with neo4j_driver.session() as session:
            result = await session.run("MATCH ()-[r:RESOLVES_DOUBT_FOR]->() RETURN r.weight AS w")
            row = await result.single()
            assert row["w"] == 1


# ─── Jira Block consumer ──────────────────────────────────────────────────────


class TestJiraBlockConsumer:
    async def test_block_event_creates_edge(
        self, neo4j_driver: AsyncDriver, seeded_engineers: list[str]
    ) -> None:
        consumer = _make_consumer(JiraBlockConsumer, neo4j_driver)
        written = await consumer.process(_make_jira_event())
        assert written is True

        async with neo4j_driver.session() as session:
            result = await session.run(
                "MATCH ()-[r:BLOCKS_TICKET_OF]->() RETURN r.weight AS w, r.total_hours AS h"
            )
            row = await result.single()
            assert row["w"] == 1
            assert row["h"] == pytest.approx(4.0)

    async def test_block_accumulates_duration(
        self, neo4j_driver: AsyncDriver, seeded_engineers: list[str]
    ) -> None:
        consumer = _make_consumer(JiraBlockConsumer, neo4j_driver)
        await consumer.process(_make_jira_event(event_id="jira-001"))

        event2 = _make_jira_event(event_id="jira-002")
        event2["duration_hours"] = 8.0
        await consumer.process(event2)

        async with neo4j_driver.session() as session:
            result = await session.run("MATCH ()-[r:BLOCKS_TICKET_OF]->() RETURN r.total_hours AS h")
            row = await result.single()
            assert row["h"] == pytest.approx(12.0)

    async def test_idempotent_block_event(
        self, neo4j_driver: AsyncDriver, seeded_engineers: list[str]
    ) -> None:
        consumer = _make_consumer(JiraBlockConsumer, neo4j_driver)
        event = _make_jira_event(event_id="jira-idem-001")
        await consumer.process(event)
        written = await consumer.process(event)
        assert written is False


# ─── Cross-consumer idempotency isolation ─────────────────────────────────────


class TestProcessedEventIsolation:
    async def test_same_event_id_shared_across_consumers(
        self, neo4j_driver: AsyncDriver, seeded_engineers: list[str]
    ) -> None:
        """ProcessedEvent nodes are global — an event_id used by the PR consumer
        blocks the Slack consumer from processing the same ID (defence-in-depth)."""
        shared_event_id = "shared-event-id-001"
        pr_consumer = _make_consumer(PrReviewConsumer, neo4j_driver)
        slack_consumer = _make_consumer(SlackThreadConsumer, neo4j_driver)

        await pr_consumer.process(_make_pr_event(event_id=shared_event_id))
        # The Slack consumer sees the ProcessedEvent node and skips
        written = await slack_consumer.process(
            _make_slack_event(resolved=True, event_id=shared_event_id)
        )
        assert written is False
