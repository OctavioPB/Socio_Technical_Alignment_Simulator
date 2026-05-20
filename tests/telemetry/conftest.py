"""Telemetry test fixtures.

Reuses the Neo4j testcontainer strategy from tests/graph/conftest.py.
Tests invoke consumer.process() directly — no Kafka required.
"""

from __future__ import annotations

import os

import pytest
from neo4j import AsyncGraphDatabase, AsyncDriver


@pytest.fixture(scope="session")
def neo4j_uri() -> str:
    return os.environ.get("NEO4J_URI", "")


@pytest.fixture(scope="session")
def neo4j_credentials() -> tuple[str, str]:
    return (
        os.environ.get("NEO4J_USER", "neo4j"),
        os.environ.get("NEO4J_PASSWORD", "testpassword"),
    )


@pytest.fixture(scope="session")
def _neo4j_container(neo4j_uri: str):
    if neo4j_uri:
        yield None
        return
    try:
        from testcontainers.neo4j import Neo4jContainer  # type: ignore[import-untyped]
    except ImportError:
        pytest.skip("testcontainers[neo4j] not installed")
    container = Neo4jContainer("neo4j:5.19-community", password="testpassword")
    container.start()
    yield container
    container.stop()


@pytest.fixture(scope="session")
def resolved_neo4j_uri(neo4j_uri: str, _neo4j_container) -> str:
    if neo4j_uri:
        return neo4j_uri
    return _neo4j_container.get_connection_url()


@pytest.fixture(scope="session")
async def neo4j_driver(
    resolved_neo4j_uri: str,
    neo4j_credentials: tuple[str, str],
) -> AsyncDriver:
    user, password = neo4j_credentials
    driver = AsyncGraphDatabase.driver(resolved_neo4j_uri, auth=(user, password))
    await driver.verify_connectivity()
    yield driver
    await driver.close()


@pytest.fixture()
async def clean_db(neo4j_driver: AsyncDriver) -> None:
    async with neo4j_driver.session() as session:
        await session.run("MATCH (n) DETACH DELETE n")
    yield
    async with neo4j_driver.session() as session:
        await session.run("MATCH (n) DETACH DELETE n")


@pytest.fixture()
async def seeded_engineers(neo4j_driver: AsyncDriver, clean_db: None) -> list[str]:
    """Seed two engineers and return their IDs."""
    ids = ["reviewer-eng", "author-eng"]
    async with neo4j_driver.session() as session:
        for i, eng_id in enumerate(ids):
            await session.run(
                "MERGE (e:Engineer {id: $id}) SET e.name=$name, e.skills=[], e.seniority='mid', e.team='test'",
                {"id": eng_id, "name": f"Engineer {i}"},
            )
    return ids
