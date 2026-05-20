"""Seed Neo4j with synthetic team data for development and testing.

Produces 3 teams (12 + 10 + 13 = 35 engineers) with Poisson-distributed
interaction weights. Fully deterministic — seeded RNG.

Usage:
    python -m simulation.scripts.seed_graph
    make graph-seed
"""

from __future__ import annotations

import asyncio
import os
from itertools import combinations

import numpy as np
from neo4j import AsyncGraphDatabase

# ─── Seed for full reproducibility ────────────────────────────────────────────
RNG = np.random.default_rng(seed=42)

# ─── Team definitions ─────────────────────────────────────────────────────────
TEAMS: list[dict] = [
    {"id": "platform", "name": "Platform Engineering", "size": 12},
    {"id": "ml", "name": "Machine Learning", "size": 10},
    {"id": "data-eng", "name": "Data Engineering", "size": 13},
]

SKILLS_BY_TEAM: dict[str, list[str]] = {
    "platform": [
        "Python", "Go", "Kubernetes", "Terraform", "PostgreSQL",
        "Redis", "gRPC", "Docker", "Linux", "CI/CD", "Prometheus", "Vault",
    ],
    "ml": [
        "Python", "PyTorch", "TensorFlow", "MLflow", "CUDA",
        "NumPy", "pandas", "scikit-learn", "JAX", "Kubernetes",
    ],
    "data-eng": [
        "Python", "Spark", "dbt", "Airflow", "Kafka",
        "SQL", "BigQuery", "Snowflake", "Flink", "Avro", "DuckDB", "Terraform",
    ],
}

SENIORITIES = ["junior", "mid", "senior", "staff"]
# 15% junior · 35% mid · 35% senior · 15% staff
SENIORITY_WEIGHTS = [0.15, 0.35, 0.35, 0.15]

# ─── Name pools ───────────────────────────────────────────────────────────────
_FIRST = [
    "alex", "sam", "morgan", "jordan", "taylor", "chris", "casey",
    "riley", "quinn", "avery", "dakota", "blake", "drew", "reese",
    "cameron", "skyler", "jessie", "parker", "logan", "river",
]
_LAST = [
    "chen", "kim", "patel", "garcia", "johnson", "wong", "rodriguez",
    "lee", "martinez", "wilson", "brown", "davis", "miller", "anderson",
    "thomas", "white", "harris", "clark", "lewis", "walker",
]

# ─── Edge generation parameters ───────────────────────────────────────────────
EDGE_DENSITY = 0.40          # fraction of engineer pairs that interact
POISSON_LAMBDA = 5.0         # mean interactions per quarter for active pairs
# Probability that a given relationship type exists, given the pair is active
REL_PROBS: dict[str, float] = {
    "REVIEWS_PR_OF": 0.55,       # most common — GitHub-derived
    "RESOLVES_DOUBT_FOR": 0.30,  # Slack-derived
    "BLOCKS_TICKET_OF": 0.15,    # Jira-derived
    "PAIR_PROGRAMS_WITH": 0.08,  # rarest — always bidirectional
}


# ─── Data generation ──────────────────────────────────────────────────────────

def _make_handle(first: str, last: str, team_prefix: str, idx: int) -> str:
    return f"{first}-{last}-{team_prefix}{idx:02d}"


def generate_engineers(team: dict) -> list[dict]:
    team_id: str = team["id"]
    size: int = team["size"]
    skills_pool = SKILLS_BY_TEAM[team_id]
    prefix = team_id[:3]

    engineers = []
    for i in range(size):
        first = _FIRST[int(RNG.integers(0, len(_FIRST)))]
        last = _LAST[int(RNG.integers(0, len(_LAST)))]
        handle = _make_handle(first, last, prefix, i)

        n_skills = int(RNG.integers(2, 6))
        skills = RNG.choice(
            skills_pool, size=min(n_skills, len(skills_pool)), replace=False
        ).tolist()

        seniority = str(RNG.choice(SENIORITIES, p=SENIORITY_WEIGHTS))

        engineers.append(
            {
                "id": handle,
                "name": f"{first.capitalize()} {last.capitalize()}",
                "skills": skills,
                "seniority": seniority,
                "team": team_id,
            }
        )
    return engineers


def generate_edges(engineers: list[dict]) -> list[dict]:
    edges: list[dict] = []
    pairs = list(combinations(range(len(engineers)), 2))

    for i, j in pairs:
        eng_i = engineers[i]
        eng_j = engineers[j]

        if float(RNG.random()) > EDGE_DENSITY:
            continue  # this pair doesn't interact

        for rel_type, prob in REL_PROBS.items():
            if float(RNG.random()) >= prob:
                continue

            weight = int(RNG.poisson(POISSON_LAMBDA))
            if weight == 0:
                continue

            edges.append(
                {
                    "source_id": eng_i["id"],
                    "target_id": eng_j["id"],
                    "relationship": rel_type,
                    "weight": weight,
                }
            )

            if rel_type == "PAIR_PROGRAMS_WITH":
                # Pair programming is always bidirectional
                edges.append(
                    {
                        "source_id": eng_j["id"],
                        "target_id": eng_i["id"],
                        "relationship": rel_type,
                        "weight": weight,
                    }
                )
            elif float(RNG.random()) < 0.25:
                # 25% chance of a reverse edge (mutual code review etc.)
                rev_weight = int(RNG.poisson(POISSON_LAMBDA))
                if rev_weight > 0:
                    edges.append(
                        {
                            "source_id": eng_j["id"],
                            "target_id": eng_i["id"],
                            "relationship": rel_type,
                            "weight": rev_weight,
                        }
                    )

    return edges


# ─── Neo4j write ─────────────────────────────────────────────────────────────

_ALLOWED_REL_TYPES = frozenset(REL_PROBS)


async def _write_engineers(session, engineers: list[dict]) -> None:
    for eng in engineers:
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


async def _write_edges(session, edges: list[dict]) -> None:
    for edge in edges:
        rel_type = edge["relationship"]
        assert rel_type in _ALLOWED_REL_TYPES, f"Unexpected relationship type: {rel_type}"
        # rel_type comes only from _ALLOWED_REL_TYPES — not user input.
        await session.run(
            f"MATCH (s:Engineer {{id: $source_id}})"
            f" MATCH (t:Engineer {{id: $target_id}})"
            f" MERGE (s)-[r:{rel_type}]->(t)"
            f" SET r.weight = $weight",
            {
                "source_id": edge["source_id"],
                "target_id": edge["target_id"],
                "weight": edge["weight"],
            },
        )


async def seed(clear: bool = True) -> None:
    uri = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
    user = os.environ.get("NEO4J_USER", "neo4j")
    password = os.environ.get("NEO4J_PASSWORD", "changeme_dev")

    driver = AsyncGraphDatabase.driver(uri, auth=(user, password))
    try:
        await driver.verify_connectivity()

        async with driver.session() as session:
            if clear:
                print("Clearing existing graph data…")
                await session.run("MATCH (n) DETACH DELETE n")

            total_engineers = 0
            total_edges = 0

            for team in TEAMS:
                engineers = generate_engineers(team)
                edges = generate_edges(engineers)

                await _write_engineers(session, engineers)
                await _write_edges(session, edges)

                print(
                    f"  {team['id']:12s}  {len(engineers):2d} engineers  "
                    f"{len(edges):3d} edges"
                )
                total_engineers += len(engineers)
                total_edges += len(edges)

            print(f"\nTotal: {total_engineers} engineers · {total_edges} edges")
    finally:
        await driver.close()


if __name__ == "__main__":
    asyncio.run(seed())
