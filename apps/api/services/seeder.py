"""Synthetic data seeder for demo and testing.

Generates 4 teams (24 engineers total) with realistic collaboration edges.
Uses a fixed random seed so results are identical across runs.
"""

from __future__ import annotations

import logging
import random
from typing import Literal

from neo4j import AsyncDriver

logger = logging.getLogger(__name__)

_SENIORITY_RANK: dict[str, int] = {"junior": 0, "mid": 1, "senior": 2, "staff": 3}

_RelType = Literal["REVIEWS_PR_OF", "RESOLVES_DOUBT_FOR", "PAIR_PROGRAMS_WITH", "BLOCKS_TICKET_OF"]

_ALLOWED_REL_TYPES: frozenset[str] = frozenset(
    {"REVIEWS_PR_OF", "RESOLVES_DOUBT_FOR", "PAIR_PROGRAMS_WITH", "BLOCKS_TICKET_OF"}
)

# ── Synthetic team definitions ─────────────────────────────────────────────────

_TEAMS: list[dict] = [
    {
        "id": "platform-eng",
        "engineers": [
            {"id": "eng_plt_01", "name": "Priya Mehta",    "seniority": "staff",  "skills": ["python", "kubernetes", "terraform", "go", "prometheus", "kafka"]},
            {"id": "eng_plt_02", "name": "Dmitri Volkov",  "seniority": "senior", "skills": ["go", "kubernetes", "docker", "grpc-go", "postgresql"]},
            {"id": "eng_plt_03", "name": "Aisha Okonkwo",  "seniority": "senior", "skills": ["terraform", "python", "kafka", "postgresql", "redis"]},
            {"id": "eng_plt_04", "name": "Luca Ferrara",   "seniority": "mid",    "skills": ["python", "docker", "kafka", "prometheus", "fastapi"]},
            {"id": "eng_plt_05", "name": "Soo-Jin Park",   "seniority": "mid",    "skills": ["go", "kubernetes", "grpc-go", "postgresql"]},
            {"id": "eng_plt_06", "name": "Marcus Webb",    "seniority": "junior", "skills": ["python", "docker", "terraform"]},
        ],
    },
    {
        "id": "data-engineering",
        "engineers": [
            {"id": "eng_dat_01", "name": "Chen Wei",           "seniority": "staff",  "skills": ["python", "spark", "kafka", "airflow", "dbt", "neo4j"]},
            {"id": "eng_dat_02", "name": "Fatima Al-Rashid",   "seniority": "senior", "skills": ["python", "airflow", "spark", "pandas", "dbt", "postgresql"]},
            {"id": "eng_dat_03", "name": "James Okafor",       "seniority": "senior", "skills": ["kafka", "spark", "python", "flink", "postgresql"]},
            {"id": "eng_dat_04", "name": "Elena Vasquez",      "seniority": "mid",    "skills": ["python", "pandas", "airflow", "dbt", "postgresql"]},
            {"id": "eng_dat_05", "name": "Yuki Tanaka",        "seniority": "mid",    "skills": ["python", "spark", "pandas", "numpy", "jupyter"]},
            {"id": "eng_dat_06", "name": "Tobias Grün",        "seniority": "junior", "skills": ["python", "pandas", "jupyter"]},
        ],
    },
    {
        "id": "frontend",
        "engineers": [
            {"id": "eng_fe_01", "name": "Nadia Kowalski",  "seniority": "staff",  "skills": ["typescript", "react", "nextjs", "css", "playwright", "testing-library"]},
            {"id": "eng_fe_02", "name": "Omar Hassan",     "seniority": "senior", "skills": ["typescript", "react", "nextjs", "css", "vitest", "webpack"]},
            {"id": "eng_fe_03", "name": "Beatriz Santos",  "seniority": "senior", "skills": ["typescript", "react", "css", "testing-library"]},
            {"id": "eng_fe_04", "name": "Arjun Patel",     "seniority": "mid",    "skills": ["typescript", "react", "css", "javascript", "vitest"]},
            {"id": "eng_fe_05", "name": "Remi Dubois",     "seniority": "junior", "skills": ["javascript", "react", "css", "html"]},
        ],
    },
    {
        "id": "backend-api",
        "engineers": [
            {"id": "eng_bk_01", "name": "Samir Ghosh",       "seniority": "staff",  "skills": ["python", "fastapi", "postgresql", "redis", "kafka", "docker", "sqlalchemy"]},
            {"id": "eng_bk_02", "name": "Ingrid Lindqvist",  "seniority": "senior", "skills": ["python", "fastapi", "sqlalchemy", "postgresql", "pytest", "redis"]},
            {"id": "eng_bk_03", "name": "Kwame Asante",      "seniority": "senior", "skills": ["python", "fastapi", "kafka", "postgresql", "docker", "starlette"]},
            {"id": "eng_bk_04", "name": "Mei Lin Chen",      "seniority": "mid",    "skills": ["python", "fastapi", "sqlalchemy", "pytest", "redis"]},
            {"id": "eng_bk_05", "name": "Pavel Horák",       "seniority": "mid",    "skills": ["python", "fastapi", "postgresql", "docker", "uvicorn"]},
            {"id": "eng_bk_06", "name": "Amara Diallo",      "seniority": "mid",    "skills": ["python", "fastapi", "pytest", "redis", "kafka"]},
            {"id": "eng_bk_07", "name": "Finn McAllister",   "seniority": "junior", "skills": ["python", "fastapi", "postgresql", "pytest"]},
        ],
    },
]


# ── Edge generation ────────────────────────────────────────────────────────────


def _generate_edges(
    engineers: list[dict], rng: random.Random
) -> list[tuple[str, str, str, float]]:
    """Return a list of (src_id, rel_type, tgt_id, weight) for a team."""
    edges: list[tuple[str, str, str, float]] = []

    for i in range(len(engineers)):
        for j in range(len(engineers)):
            if i >= j:
                continue

            e1 = engineers[i]
            e2 = engineers[j]
            r1 = _SENIORITY_RANK[e1["seniority"]]
            r2 = _SENIORITY_RANK[e2["seniority"]]
            skill_overlap = len(set(e1["skills"]) & set(e2["skills"]))

            # REVIEWS_PR_OF — senior → junior preferred; peers review each other
            if r1 > r2:
                edges.append((e1["id"], "REVIEWS_PR_OF", e2["id"], float(rng.randint(2, 6) + (r1 - r2))))
            elif r2 > r1:
                edges.append((e2["id"], "REVIEWS_PR_OF", e1["id"], float(rng.randint(2, 6) + (r2 - r1))))
            else:
                edges.append((e1["id"], "REVIEWS_PR_OF", e2["id"], float(rng.randint(1, 4))))
                edges.append((e2["id"], "REVIEWS_PR_OF", e1["id"], float(rng.randint(1, 4))))

            # RESOLVES_DOUBT_FOR — higher seniority mentors lower (70 % chance)
            if r1 > r2 and rng.random() > 0.3:
                edges.append((e1["id"], "RESOLVES_DOUBT_FOR", e2["id"], float(rng.randint(1, 5))))
            elif r2 > r1 and rng.random() > 0.3:
                edges.append((e2["id"], "RESOLVES_DOUBT_FOR", e1["id"], float(rng.randint(1, 5))))

            # PAIR_PROGRAMS_WITH — skill overlap ≥ 2 and 60 % chance
            if skill_overlap >= 2 and rng.random() > 0.4:
                edges.append((
                    e1["id"], "PAIR_PROGRAMS_WITH", e2["id"],
                    float(skill_overlap + rng.randint(0, 2)),
                ))

            # BLOCKS_TICKET_OF — sparse (~18 %)
            if rng.random() > 0.82:
                edges.append((e1["id"], "BLOCKS_TICKET_OF", e2["id"], float(rng.randint(1, 3))))

    return edges


# ── Public API ────────────────────────────────────────────────────────────────


async def seed_graph(driver: AsyncDriver) -> dict:
    """Seed synthetic team data into Neo4j. Idempotent via MERGE.

    Returns a summary dict with counts of what was written.
    """
    rng = random.Random(42)  # deterministic — same result every run

    all_engineers: list[dict] = []
    all_edges: list[tuple[str, str, str, float]] = []

    for team in _TEAMS:
        team_id = team["id"]
        team_engineers = [{"team": team_id, **eng} for eng in team["engineers"]]
        all_engineers.extend(team_engineers)
        all_edges.extend(_generate_edges(team["engineers"], rng))

    async with driver.session() as session:
        for eng in all_engineers:
            await session.run(
                """
                MERGE (e:Engineer {id: $id})
                SET e.name = $name,
                    e.skills = $skills,
                    e.seniority = $seniority,
                    e.team = $team
                """,
                eng,
            )
            logger.debug("Seeded engineer %s (%s)", eng["id"], eng["name"])

        for src_id, rel_type, tgt_id, weight in all_edges:
            if rel_type not in _ALLOWED_REL_TYPES:
                logger.warning("Skipping unknown rel type %s", rel_type)
                continue
            await session.run(
                f"""
                MATCH (s:Engineer {{id: $src_id}}), (t:Engineer {{id: $tgt_id}})
                MERGE (s)-[r:{rel_type}]->(t)
                SET r.weight = $weight
                """,
                {"src_id": src_id, "tgt_id": tgt_id, "weight": weight},
            )

    logger.info(
        "Seed complete — %d engineers, %d edges, %d teams",
        len(all_engineers), len(all_edges), len(_TEAMS),
    )
    return {
        "teams": [t["id"] for t in _TEAMS],
        "engineers_seeded": len(all_engineers),
        "edges_seeded": len(all_edges),
    }


async def clear_graph(driver: AsyncDriver) -> dict:
    """Delete all nodes and relationships. Returns counts of what was removed."""
    async with driver.session() as session:
        r = await session.run("MATCH (n) RETURN count(n) AS n")
        node_count = (await r.single() or {"n": 0})["n"]

        r = await session.run("MATCH ()-[r]->() RETURN count(r) AS n")
        edge_count = (await r.single() or {"n": 0})["n"]

        await session.run("MATCH (n) DETACH DELETE n")

    logger.info("Graph cleared — deleted %d nodes, %d edges", node_count, edge_count)
    return {"nodes_deleted": node_count, "edges_deleted": edge_count}


async def clear_redis(redis_url: str) -> dict:
    """Flush all stas:* keys from Redis. Returns count of deleted keys."""
    try:
        import redis.asyncio as aioredis  # type: ignore[import]

        client = aioredis.from_url(redis_url, decode_responses=True)
        await client.ping()
        keys: list[str] = await client.keys("stas:*")
        deleted = 0
        if keys:
            deleted = await client.delete(*keys)
        await client.aclose()
        logger.info("Redis cleared — deleted %d stas:* keys", deleted)
        return {"keys_deleted": deleted}
    except Exception as exc:
        logger.warning("Redis clear failed: %s", exc)
        raise RuntimeError(f"Redis unavailable: {exc}") from exc


async def get_graph_stats(driver: AsyncDriver, redis_url: str) -> dict:
    """Return current graph + cache statistics."""
    async with driver.session() as session:
        r = await session.run("MATCH (e:Engineer) RETURN count(e) AS n")
        engineers = (await r.single() or {"n": 0})["n"]

        r = await session.run("MATCH (e:Engineer) RETURN count(DISTINCT e.team) AS n")
        teams = (await r.single() or {"n": 0})["n"]

        r = await session.run("MATCH (c:Candidate) RETURN count(c) AS n")
        candidates = (await r.single() or {"n": 0})["n"]

        r = await session.run("MATCH ()-[rel]->() RETURN count(rel) AS n")
        edges = (await r.single() or {"n": 0})["n"]

    redis_keys = -1
    try:
        import redis.asyncio as aioredis  # type: ignore[import]

        client = aioredis.from_url(redis_url, decode_responses=True)
        await client.ping()
        keys: list[str] = await client.keys("stas:*")
        redis_keys = len(keys)
        await client.aclose()
    except Exception:
        pass

    return {
        "teams": teams,
        "engineers": engineers,
        "candidates": candidates,
        "edges": edges,
        "redis_keys": redis_keys,
    }
