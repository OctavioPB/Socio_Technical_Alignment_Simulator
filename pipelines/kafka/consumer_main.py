"""Standalone telemetry consumer runner.

Starts three consumers concurrently (one per Kafka topic) and exports
Prometheus metrics on port 9090.

Usage:
    python -m pipelines.kafka.consumer_main
    docker compose run --rm telemetry
"""

from __future__ import annotations

import asyncio
import logging
import os
import signal

from neo4j import AsyncGraphDatabase
from prometheus_client import start_http_server

from pipelines.kafka.consumers.jira_block import JiraBlockConsumer
from pipelines.kafka.consumers.pr_review import PrReviewConsumer
from pipelines.kafka.consumers.slack_thread import SlackThreadConsumer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)

METRICS_PORT = int(os.environ.get("METRICS_PORT", "9090"))
NEO4J_URI = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "changeme_dev")
KAFKA_BOOTSTRAP = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")


async def main() -> None:
    driver = AsyncGraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    await driver.verify_connectivity()
    logger.info("Neo4j connection verified.")

    start_http_server(METRICS_PORT)
    logger.info("Prometheus metrics available on port %d.", METRICS_PORT)

    consumers = [
        PrReviewConsumer(KAFKA_BOOTSTRAP, driver),
        SlackThreadConsumer(KAFKA_BOOTSTRAP, driver),
        JiraBlockConsumer(KAFKA_BOOTSTRAP, driver),
    ]

    loop = asyncio.get_running_loop()
    stop_event = asyncio.Event()

    def _handle_signal() -> None:
        logger.info("Shutdown signal received.")
        stop_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _handle_signal)

    consumer_tasks = [asyncio.create_task(c.run()) for c in consumers]

    # Wait until a stop signal or any consumer crashes
    done, pending = await asyncio.wait(
        [asyncio.create_task(stop_event.wait()), *consumer_tasks],
        return_when=asyncio.FIRST_COMPLETED,
    )

    logger.info("Stopping consumers…")
    for task in pending:
        task.cancel()
    await asyncio.gather(*pending, return_exceptions=True)
    await driver.close()
    logger.info("Shutdown complete.")


if __name__ == "__main__":
    asyncio.run(main())
