"""Graph service — all Cypher queries for the knowledge graph.

Rules enforced here:
- Every query is parameterized. Relationship types are never interpolated from
  user input; they are Cypher literals or come from an allowlist.
- All public methods are async.
- No business logic lives in routers — only here and in simulation/.
"""

from __future__ import annotations

import uuid
from datetime import datetime

import networkx as nx
from neo4j import AsyncDriver

from apps.api.core.config import settings
from apps.api.models.graph_models import (
    CandidateInsert,
    CentralityScore,
    EngineerNode,
    GraphEdge,
    GraphSnapshot,
    PathResult,
)

# Relationship types used in the knowledge graph — treated as an allowlist.
# Cypher cannot parameterize relationship types, so we validate against this set
# before composing any query that includes a dynamic type.
_ALLOWED_REL_TYPES: frozenset[str] = frozenset(
    {"REVIEWS_PR_OF", "RESOLVES_DOUBT_FOR", "BLOCKS_TICKET_OF", "PAIR_PROGRAMS_WITH"}
)


class GraphService:
    def __init__(self, driver: AsyncDriver) -> None:
        self._driver = driver

    # ─── Team graph ───────────────────────────────────────────────────────────

    async def list_teams(self) -> list[str]:
        """Return a sorted list of all team identifiers present in the graph."""
        async with self._driver.session() as session:
            result = await session.run(
                "MATCH (e:Engineer) RETURN DISTINCT e.team AS team ORDER BY team"
            )
            records = await result.data()
        return [r["team"] for r in records]

    async def get_team_graph(self, team_id: str) -> GraphSnapshot:
        """Return the full adjacency snapshot for a team."""
        async with self._driver.session() as session:
            nodes = await self._fetch_team_nodes(session, team_id)
            edges = await self._fetch_team_edges(session, team_id)

        return GraphSnapshot(
            team_id=team_id,
            snapshot_id=str(uuid.uuid4()),
            captured_at=datetime.utcnow(),
            nodes=nodes,
            edges=edges,
        )

    async def _fetch_team_nodes(self, session, team_id: str) -> list[EngineerNode]:
        result = await session.run(
            """
            MATCH (e:Engineer {team: $team_id})
            RETURN e.id AS id,
                   e.name AS name,
                   e.skills AS skills,
                   e.seniority AS seniority,
                   e.team AS team
            ORDER BY e.id
            """,
            {"team_id": team_id},
        )
        records = await result.data()
        return [EngineerNode(**r) for r in records]

    async def _fetch_team_edges(self, session, team_id: str) -> list[GraphEdge]:
        # Relationship types are Cypher literals — not user input.
        result = await session.run(
            """
            MATCH (s:Engineer {team: $team_id})
                  -[r:REVIEWS_PR_OF|RESOLVES_DOUBT_FOR|BLOCKS_TICKET_OF|PAIR_PROGRAMS_WITH]->
                  (t:Engineer {team: $team_id})
            RETURN s.id AS source_id,
                   t.id AS target_id,
                   type(r) AS relationship,
                   r.weight AS weight
            """,
            {"team_id": team_id},
        )
        records = await result.data()
        return [GraphEdge(**r) for r in records]

    # ─── Shortest paths ───────────────────────────────────────────────────────

    async def get_shortest_paths(self, from_id: str, to_id: str) -> list[PathResult]:
        """Geodesic shortest path(s) between two engineers (undirected traversal)."""
        async with self._driver.session() as session:
            result = await session.run(
                """
                MATCH (from:Engineer {id: $from_id}), (to:Engineer {id: $to_id})
                MATCH path = shortestPath(
                    (from)-[:REVIEWS_PR_OF|RESOLVES_DOUBT_FOR|BLOCKS_TICKET_OF|PAIR_PROGRAMS_WITH*..30]-(to)
                )
                RETURN [n IN nodes(path) | n.id] AS path_nodes,
                       length(path) AS distance
                """,
                {"from_id": from_id, "to_id": to_id},
            )
            records = await result.data()

        if not records:
            return []

        return [
            PathResult(
                from_id=from_id,
                to_id=to_id,
                distance=r["distance"],
                path=r["path_nodes"],
            )
            for r in records
        ]

    # ─── Centrality ───────────────────────────────────────────────────────────

    async def get_centrality_scores(self, team_id: str) -> list[CentralityScore]:
        """Compute closeness + betweenness centrality for all engineers in a team.

        Routing decision:
          ≤ SIMULATION_GDS_THRESHOLD nodes → NetworkX (in-process, no extra infra)
          >   "       "         "   nodes → Neo4j GDS gds.closeness.stream()
        """
        snapshot = await self.get_team_graph(team_id)
        if snapshot.node_count <= settings.simulation_gds_threshold:
            return _compute_centrality_networkx(snapshot)
        return await self._compute_centrality_gds(team_id, snapshot)

    async def _compute_centrality_gds(
        self, team_id: str, snapshot: GraphSnapshot
    ) -> list[CentralityScore]:
        """GDS path — requires the graph-data-science Neo4j plugin."""
        graph_name = f"stas_centrality_{team_id}"
        async with self._driver.session() as session:
            # Drop stale projection if it exists
            await session.run(
                "CALL gds.graph.drop($name, false) YIELD graphName",
                {"name": graph_name},
            )
            # Cypher projection filtered to team
            await session.run(
                """
                CALL gds.graph.project.cypher(
                    $name,
                    'MATCH (n:Engineer) WHERE n.team = $team RETURN id(n) AS id',
                    'MATCH (s:Engineer)-[r:REVIEWS_PR_OF|RESOLVES_DOUBT_FOR|BLOCKS_TICKET_OF|PAIR_PROGRAMS_WITH]-(t:Engineer)
                     WHERE s.team = $team AND t.team = $team
                     RETURN id(s) AS source, id(t) AS target, coalesce(r.weight, 1.0) AS weight',
                    {parameters: {team: $team_id}}
                ) YIELD graphName
                """,
                {"name": graph_name, "team_id": team_id},
            )

            closeness_result = await session.run(
                """
                CALL gds.closeness.stream($name)
                YIELD nodeId, score
                RETURN gds.util.asNode(nodeId).id AS engineer_id, score AS closeness
                """,
                {"name": graph_name},
            )
            closeness_map = {r["engineer_id"]: r["closeness"] for r in await closeness_result.data()}

            betweenness_result = await session.run(
                """
                CALL gds.betweenness.stream($name)
                YIELD nodeId, score
                RETURN gds.util.asNode(nodeId).id AS engineer_id, score AS betweenness
                """,
                {"name": graph_name},
            )
            betweenness_map = {
                r["engineer_id"]: r["betweenness"] for r in await betweenness_result.data()
            }

            degree_result = await session.run(
                """
                MATCH (e:Engineer {team: $team_id})-[r]-()
                RETURN e.id AS engineer_id, count(r) AS degree
                """,
                {"team_id": team_id},
            )
            degree_map = {r["engineer_id"]: r["degree"] for r in await degree_result.data()}

            await session.run("CALL gds.graph.drop($name)", {"name": graph_name})

        return [
            CentralityScore(
                engineer_id=node.id,
                closeness=closeness_map.get(node.id, 0.0),
                betweenness=betweenness_map.get(node.id, 0.0),
                degree=degree_map.get(node.id, 0),
            )
            for node in snapshot.nodes
        ]

    # ─── Candidate simulation support ─────────────────────────────────────────

    async def insert_candidate_node(self, candidate: CandidateInsert) -> str:
        """Temporarily insert a candidate into the graph.

        Projects SHARES_DOMAIN_WITH edges to engineers with overlapping skills.
        The node is flagged is_temporary=true so it can be bulk-cleaned on
        simulation teardown. Caller must invoke delete_candidate_node() when done.

        Returns the candidate node ID.
        """
        async with self._driver.session() as session:
            await session.run(
                """
                MERGE (c:Candidate {id: $id})
                SET c.name = $name,
                    c.skills = $skills,
                    c.github_url = $github_url,
                    c.collaboration_vector = $collaboration_vector,
                    c.team_id = $team_id,
                    c.is_temporary = true,
                    c.inserted_at = datetime()
                """,
                {
                    "id": candidate.id,
                    "name": candidate.name,
                    "skills": candidate.skills,
                    "github_url": candidate.github_url,
                    "collaboration_vector": candidate.collaboration_vector,
                    "team_id": candidate.team_id,
                },
            )

            # Project edges based on skill overlap — weight = shared skill count
            await session.run(
                """
                MATCH (c:Candidate {id: $candidate_id})
                MATCH (e:Engineer {team: $team_id})
                WITH c, e,
                     [skill IN c.skills WHERE skill IN e.skills] AS shared_skills
                WHERE size(shared_skills) > 0
                MERGE (e)-[r:SHARES_DOMAIN_WITH]->(c)
                SET r.weight = size(shared_skills),
                    r.shared_skills = shared_skills
                """,
                {"candidate_id": candidate.id, "team_id": candidate.team_id},
            )

        return candidate.id

    async def delete_candidate_node(self, candidate_id: str) -> None:
        """Remove a temporary candidate node and all its projected edges."""
        async with self._driver.session() as session:
            await session.run(
                """
                MATCH (c:Candidate {id: $id, is_temporary: true})
                DETACH DELETE c
                """,
                {"id": candidate_id},
            )

    async def cleanup_stale_candidates(self) -> int:
        """Remove all temporary candidates older than 1 hour. Returns count deleted."""
        async with self._driver.session() as session:
            result = await session.run(
                """
                MATCH (c:Candidate {is_temporary: true})
                WHERE c.inserted_at < datetime() - duration('PT1H')
                WITH c, c.id AS candidate_id
                DETACH DELETE c
                RETURN count(candidate_id) AS deleted
                """,
            )
            record = await result.single()
            return record["deleted"] if record else 0


# ─── NetworkX centrality (≤ threshold nodes) ─────────────────────────────────


def _compute_centrality_networkx(snapshot: GraphSnapshot) -> list[CentralityScore]:
    """In-process centrality computation via NetworkX for small graphs."""
    G: nx.Graph = nx.Graph()

    for node in snapshot.nodes:
        G.add_node(node.id)

    for edge in snapshot.edges:
        if G.has_edge(edge.source_id, edge.target_id):
            # Accumulate weights for multi-edges (e.g. REVIEWS + RESOLVES between same pair)
            G[edge.source_id][edge.target_id]["weight"] += edge.weight
        else:
            G.add_edge(edge.source_id, edge.target_id, weight=edge.weight)

    closeness = nx.closeness_centrality(G)
    betweenness = nx.betweenness_centrality(G, normalized=True, weight="weight")
    degree = dict(G.degree())

    return [
        CentralityScore(
            engineer_id=node.id,
            closeness=round(closeness.get(node.id, 0.0), 6),
            betweenness=round(betweenness.get(node.id, 0.0), 6),
            degree=degree.get(node.id, 0),
        )
        for node in snapshot.nodes
    ]
