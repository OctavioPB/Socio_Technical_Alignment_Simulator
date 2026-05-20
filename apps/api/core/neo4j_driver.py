"""Neo4j async driver — singleton managed via FastAPI lifespan.

The driver is stored on app.state so it lives for the process lifetime.
Individual requests obtain a session via the get_session dependency.
Tests override the driver by setting app.state.neo4j_driver directly.
"""

from neo4j import AsyncDriver, AsyncGraphDatabase

from apps.api.core.config import settings


def create_driver() -> AsyncDriver:
    return AsyncGraphDatabase.driver(
        settings.neo4j_uri,
        auth=(settings.neo4j_user, settings.neo4j_password),
        max_connection_pool_size=50,
    )
