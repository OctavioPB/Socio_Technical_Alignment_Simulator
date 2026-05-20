"""Graph test fixtures.

Connection strategy:
  - If NEO4J_URI is set in environment (CI, Docker), use that.
  - Otherwise spin up a testcontainer (local dev, no Docker Compose running).

All fixtures are session-scoped to start the container once per test run.
Each test gets a clean database via the `clean_db` function-scoped fixture.
"""

from __future__ import annotations

import os

import pytest
from neo4j import AsyncGraphDatabase, AsyncDriver

# ─── Connection ──────────────────────────────────────────────────────────────


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
    """Start a testcontainer only when no external URI is provided."""
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


# ─── Per-test database isolation ─────────────────────────────────────────────


@pytest.fixture()
async def clean_db(neo4j_driver: AsyncDriver) -> None:
    """Wipe all nodes and relationships before each test."""
    async with neo4j_driver.session() as session:
        await session.run("MATCH (n) DETACH DELETE n")
    yield
    async with neo4j_driver.session() as session:
        await session.run("MATCH (n) DETACH DELETE n")
