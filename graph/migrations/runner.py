"""Apply Neo4j schema migrations in filename order.

Each migration file is a .cypher file containing semicolon-delimited statements.
Migrations are idempotent — safe to re-run.

Usage:
    python -m graph.migrations.runner
    NEO4J_URI=bolt://... python -m graph.migrations.runner
"""

import asyncio
import os
from pathlib import Path

from neo4j import AsyncGraphDatabase

MIGRATIONS_DIR = Path(__file__).parent


async def run_migrations() -> None:
    uri = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
    user = os.environ.get("NEO4J_USER", "neo4j")
    password = os.environ.get("NEO4J_PASSWORD", "changeme_dev")

    driver = AsyncGraphDatabase.driver(uri, auth=(user, password))
    try:
        await driver.verify_connectivity()
        migration_files = sorted(MIGRATIONS_DIR.glob("*.cypher"))
        if not migration_files:
            print("No migration files found.")
            return

        async with driver.session() as session:
            for mf in migration_files:
                statements = [s.strip() for s in mf.read_text().split(";") if s.strip()]
                for stmt in statements:
                    await session.run(stmt)
                print(f"  ✓ {mf.name}")

        print(f"Applied {len(migration_files)} migration(s).")
    finally:
        await driver.close()


if __name__ == "__main__":
    asyncio.run(run_migrations())
