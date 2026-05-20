"""Synthetic telemetry event producer for local development.

Queries Neo4j for real engineer IDs, generates realistic random events,
serializes them with Avro, and produces to the appropriate Kafka topic.

Usage:
    python -m pipelines.kafka.produce_events --source=github --count=500
    python -m pipelines.kafka.produce_events --source=slack  --count=200
    python -m pipelines.kafka.produce_events --source=jira   --count=100
    python -m pipelines.kafka.produce_events                 # all sources, defaults

make kafka-events ARGS="--source=github --count=500"
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import random
import time
import uuid
from datetime import datetime, timedelta, timezone
from itertools import combinations

from aiokafka import AIOKafkaProducer
from neo4j import AsyncGraphDatabase

from pipelines.kafka import topics
from pipelines.kafka.serialization import (
    JIRA_BLOCK_SCHEMA,
    PR_REVIEW_SCHEMA,
    SLACK_THREAD_SCHEMA,
    serialize,
)

logger = logging.getLogger(__name__)

NEO4J_URI = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "changeme_dev")
KAFKA_BOOTSTRAP = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")

REPOS = ["org/platform-core", "org/ml-infra", "org/data-pipeline", "org/api-gateway"]
JIRA_PREFIXES = ["PLAT", "ML", "DATA", "API"]
SLACK_CHANNELS = ["C01PLATFORM", "C02MLTEAM", "C03DATAENG", "C04GENERAL"]


# ─── Engineer ID lookup ───────────────────────────────────────────────────────


async def fetch_engineer_ids() -> list[str]:
    driver = AsyncGraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    try:
        async with driver.session() as session:
            result = await session.run("MATCH (e:Engineer) RETURN e.id AS id")
            return [r["id"] async for r in result]
    finally:
        await driver.close()


# ─── Event generators ─────────────────────────────────────────────────────────


def _ts_ms(days_ago_max: int = 90) -> int:
    """Random timestamp within the last N days, as epoch milliseconds."""
    delta = timedelta(days=random.uniform(0, days_ago_max))
    dt = datetime.now(tz=timezone.utc) - delta
    return int(dt.timestamp() * 1000)


def make_pr_review_event(engineer_ids: list[str]) -> dict:
    reviewer, author = random.sample(engineer_ids, 2)
    return {
        "event_id": str(uuid.uuid4()),
        "reviewer_id": reviewer,
        "author_id": author,
        "repo": random.choice(REPOS),
        "pr_number": random.randint(1, 9999),
        "timestamp": _ts_ms(),
    }


def make_slack_thread_event(engineer_ids: list[str]) -> dict:
    helper, asker = random.sample(engineer_ids, 2)
    return {
        "event_id": str(uuid.uuid4()),
        "helper_id": helper,
        "asker_id": asker,
        "channel": random.choice(SLACK_CHANNELS),
        "thread_ts": f"{int(time.time())}.{random.randint(100000, 999999)}",
        "resolved": random.random() > 0.15,  # 85% resolved
        "timestamp": _ts_ms(),
    }


def make_jira_block_event(engineer_ids: list[str]) -> dict:
    blocker, blocked = random.sample(engineer_ids, 2)
    prefix = random.choice(JIRA_PREFIXES)
    return {
        "event_id": str(uuid.uuid4()),
        "blocker_id": blocker,
        "blocked_id": blocked,
        "issue_key": f"{prefix}-{random.randint(100, 9999)}",
        "duration_hours": round(random.uniform(1.0, 72.0), 1),
        "timestamp": _ts_ms(),
    }


# ─── Producer ─────────────────────────────────────────────────────────────────


async def produce(source: str, count: int, engineer_ids: list[str]) -> None:
    match source:
        case "github":
            topic = topics.PR_REVIEWED
            schema = PR_REVIEW_SCHEMA
            make_event = make_pr_review_event
        case "slack":
            topic = topics.SLACK_THREAD_RESOLVED
            schema = SLACK_THREAD_SCHEMA
            make_event = make_slack_thread_event
        case "jira":
            topic = topics.JIRA_TICKET_BLOCKED
            schema = JIRA_BLOCK_SCHEMA
            make_event = make_jira_block_event
        case _:
            raise ValueError(f"Unknown source: {source!r}. Use github, slack, or jira.")

    producer = AIOKafkaProducer(bootstrap_servers=KAFKA_BOOTSTRAP)
    await producer.start()
    try:
        for i in range(count):
            event = make_event(engineer_ids)
            payload = serialize(event, schema)
            await producer.send_and_wait(topic, payload)
            if (i + 1) % 100 == 0:
                logger.info("  %s produced %d / %d", source, i + 1, count)
        logger.info("Produced %d events to %s", count, topic)
    finally:
        await producer.stop()


async def run(args: argparse.Namespace) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    engineer_ids = await fetch_engineer_ids()
    if len(engineer_ids) < 2:
        raise RuntimeError(
            "Need at least 2 engineers in Neo4j. Run: make graph-seed"
        )
    logger.info("Loaded %d engineer IDs from Neo4j.", len(engineer_ids))

    sources = [args.source] if args.source else ["github", "slack", "jira"]
    counts = {"github": args.count, "slack": args.count // 3, "jira": args.count // 6}

    for source in sources:
        n = args.count if args.source else counts[source]
        await produce(source, n, engineer_ids)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Produce synthetic telemetry events to Kafka.")
    parser.add_argument(
        "--source",
        choices=["github", "slack", "jira"],
        default=None,
        help="Event source. Omit to produce from all sources.",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=500,
        help="Number of events to produce (per source if --source is omitted). Default: 500.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    asyncio.run(run(parse_args()))
