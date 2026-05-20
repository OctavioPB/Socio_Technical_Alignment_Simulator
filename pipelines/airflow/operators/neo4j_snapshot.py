"""Neo4jSnapshotOperator — atomic graph snapshot with rollback support.

Stores a versioned :GraphSnapshot node in Neo4j containing the full
adjacency matrix and closeness centrality scores for a team (or all teams).
Snapshots older than 30 days are pruned on each run to bound storage.

execute() returns the snapshot_id string via XCom so downstream tasks
can reference this specific version. rollback() deletes the node when a
caller wants to undo a dangling partial snapshot after downstream failure.
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime
from typing import Any

try:
    from airflow.models import BaseOperator  # type: ignore[import]

    _BASE: type = BaseOperator
except ImportError:
    _BASE = object  # tests outside the Airflow container use this fallback


class Neo4jSnapshotOperator(_BASE):  # type: ignore[misc]
    """Airflow operator — atomically snapshot the knowledge graph to Neo4j."""

    ui_color = "#003366"

    def __init__(
        self,
        task_id: str,
        team_id: str,
        neo4j_uri: str | None = None,
        neo4j_user: str | None = None,
        neo4j_password: str | None = None,
        **kwargs: Any,
    ) -> None:
        if _BASE is not object:
            super().__init__(task_id=task_id, **kwargs)
        else:
            self.task_id = task_id

        self.team_id = team_id
        self._neo4j_uri = neo4j_uri
        self._neo4j_user = neo4j_user
        self._neo4j_password = neo4j_password

    # ── Config ────────────────────────────────────────────────────────────────

    def _get_driver(self) -> Any:
        from neo4j import GraphDatabase  # type: ignore[import]

        return GraphDatabase.driver(
            self._neo4j_uri or os.environ.get("NEO4J_URI", "bolt://localhost:7687"),
            auth=(
                self._neo4j_user or os.environ.get("NEO4J_USER", "neo4j"),
                self._neo4j_password or os.environ.get("NEO4J_PASSWORD", "changeme_dev"),
            ),
        )

    def _log(self, msg: str, *args: object) -> None:
        try:
            self.log.info(msg, *args)  # type: ignore[attr-defined]
        except AttributeError:
            print(msg % args if args else msg)

    # ── Airflow entry point ───────────────────────────────────────────────────

    def execute(self, context: Any) -> str:  # noqa: ARG002
        driver = self._get_driver()
        try:
            snapshot_id = self._take_snapshot(driver)
        finally:
            driver.close()
        return snapshot_id

    # ── Core logic (testable without Airflow) ─────────────────────────────────

    def _take_snapshot(self, driver: Any) -> str:
        snapshot_id = str(uuid.uuid4())
        captured_at = datetime.utcnow().isoformat()

        with driver.session() as session:
            nodes = self._fetch_nodes(session)
            edges = self._fetch_edges(session)
            centrality = compute_closeness_centrality(nodes, edges)

            # Prune snapshots older than 30 days to bound storage
            session.run(
                """
                MATCH (s:GraphSnapshot {team_id: $team_id})
                WHERE s.captured_at < datetime() - duration('P30D')
                DELETE s
                """,
                {"team_id": self.team_id},
            )

            # Single CREATE — if it fails, no partial state is left
            session.run(
                """
                CREATE (s:GraphSnapshot {
                    snapshot_id:     $snapshot_id,
                    team_id:         $team_id,
                    captured_at:     datetime($captured_at),
                    node_count:      $node_count,
                    edge_count:      $edge_count,
                    centrality_json: $centrality_json,
                    nodes_json:      $nodes_json,
                    edges_json:      $edges_json
                })
                """,
                {
                    "snapshot_id": snapshot_id,
                    "team_id": self.team_id,
                    "captured_at": captured_at,
                    "node_count": len(nodes),
                    "edge_count": len(edges),
                    "centrality_json": json.dumps(centrality),
                    "nodes_json": json.dumps(nodes),
                    "edges_json": json.dumps(edges),
                },
            )

        self._log(
            "Snapshot %s written: %d nodes, %d edges (team=%s)",
            snapshot_id[:8],
            len(nodes),
            len(edges),
            self.team_id,
        )
        return snapshot_id

    def _fetch_nodes(self, session: Any) -> list[dict]:
        if self.team_id == "all":
            result = session.run(
                """
                MATCH (e:Engineer)
                RETURN e.id AS id, e.team AS team, e.seniority AS seniority
                ORDER BY e.id
                """
            )
        else:
            result = session.run(
                """
                MATCH (e:Engineer {team: $team})
                RETURN e.id AS id, e.team AS team, e.seniority AS seniority
                ORDER BY e.id
                """,
                {"team": self.team_id},
            )
        return [dict(r) for r in result]

    def _fetch_edges(self, session: Any) -> list[dict]:
        # Relationship types are Cypher literals — not user input
        _rels = "REVIEWS_PR_OF|RESOLVES_DOUBT_FOR|BLOCKS_TICKET_OF|PAIR_PROGRAMS_WITH"
        if self.team_id == "all":
            result = session.run(
                f"""
                MATCH (s:Engineer)-[r:{_rels}]->(t:Engineer)
                RETURN s.id AS source, t.id AS target,
                       type(r) AS rel, coalesce(r.weight, 1) AS weight
                """
            )
        else:
            result = session.run(
                f"""
                MATCH (s:Engineer {{team: $team}})-[r:{_rels}]->(t:Engineer {{team: $team}})
                RETURN s.id AS source, t.id AS target,
                       type(r) AS rel, coalesce(r.weight, 1) AS weight
                """,
                {"team": self.team_id},
            )
        return [dict(r) for r in result]

    def rollback(self, snapshot_id: str) -> None:
        """Delete a snapshot node — for use in on_failure_callback."""
        driver = self._get_driver()
        try:
            with driver.session() as session:
                session.run(
                    "MATCH (s:GraphSnapshot {snapshot_id: $id}) DELETE s",
                    {"id": snapshot_id},
                )
        finally:
            driver.close()
        self._log("Rolled back snapshot %s", snapshot_id[:8])


# ── Pure-Python helper (testable without Neo4j or Airflow) ───────────────────


def compute_closeness_centrality(
    nodes: list[dict], edges: list[dict]
) -> list[dict]:
    """Compute NetworkX closeness centrality for a list of node/edge dicts."""
    import networkx as nx  # type: ignore[import]

    G: nx.Graph = nx.Graph()
    G.add_nodes_from(n["id"] for n in nodes)
    for e in edges:
        src, tgt, w = e["source"], e["target"], float(e.get("weight", 1))
        if G.has_edge(src, tgt):
            G[src][tgt]["weight"] += w
        else:
            G.add_edge(src, tgt, weight=w)

    closeness = nx.closeness_centrality(G)
    return [
        {"engineer_id": n["id"], "closeness": round(closeness.get(n["id"], 0.0), 6)}
        for n in nodes
    ]
