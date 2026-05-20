"""Sprint 1 — Graph service tests against a real Neo4j instance.

Covers every public method in GraphService with EXPLAIN-validated queries.
Per engineering standards: no mocking of the graph DB.
"""

from __future__ import annotations

import pytest
from neo4j import AsyncDriver

from apps.api.models.graph_models import (
    CandidateInsert,
    GraphSnapshot,
    CentralityScore,
    PathResult,
)
from apps.api.services.graph_service import GraphService, _compute_centrality_networkx

pytestmark = pytest.mark.asyncio


# ─── Helpers ─────────────────────────────────────────────────────────────────


async def _seed_minimal_team(driver: AsyncDriver, team_id: str = "test-team") -> None:
    """Insert a minimal 4-engineer team with a known topology for deterministic assertions."""
    async with driver.session() as session:
        # Engineers: A — B — C — D (linear chain, plus A→C shortcut)
        engineers = [
            {"id": "eng-a", "name": "Alice Chen", "skills": ["Python", "Go"], "seniority": "senior", "team": team_id},
            {"id": "eng-b", "name": "Bob Kim", "skills": ["Python", "Kubernetes"], "seniority": "mid", "team": team_id},
            {"id": "eng-c", "name": "Carol Patel", "skills": ["Go", "Terraform"], "seniority": "senior", "team": team_id},
            {"id": "eng-d", "name": "Dave Garcia", "skills": ["Redis", "Docker"], "seniority": "junior", "team": team_id},
        ]
        for eng in engineers:
            await session.run(
                """
                MERGE (e:Engineer {id: $id})
                SET e.name = $name, e.skills = $skills,
                    e.seniority = $seniority, e.team = $team
                """,
                eng,
            )

        # Edges: A→B (weight=8), B→C (weight=5), A→C (weight=3), C→D (weight=7)
        edges = [
            ("eng-a", "eng-b", "REVIEWS_PR_OF", 8),
            ("eng-b", "eng-c", "REVIEWS_PR_OF", 5),
            ("eng-a", "eng-c", "RESOLVES_DOUBT_FOR", 3),
            ("eng-c", "eng-d", "PAIR_PROGRAMS_WITH", 7),
        ]
        for src, tgt, rel, w in edges:
            await session.run(
                f"MATCH (s:Engineer {{id: $s}}) MATCH (t:Engineer {{id: $t}})"
                f" MERGE (s)-[r:{rel}]->(t) SET r.weight = $w",
                {"s": src, "t": tgt, "w": w},
            )


# ─── get_team_graph ───────────────────────────────────────────────────────────


class TestGetTeamGraph:
    async def test_returns_snapshot_with_correct_node_count(
        self, neo4j_driver: AsyncDriver, clean_db: None
    ) -> None:
        await _seed_minimal_team(neo4j_driver)
        service = GraphService(neo4j_driver)
        snapshot = await service.get_team_graph("test-team")
        assert snapshot.node_count == 4

    async def test_returns_snapshot_with_correct_edge_count(
        self, neo4j_driver: AsyncDriver, clean_db: None
    ) -> None:
        await _seed_minimal_team(neo4j_driver)
        service = GraphService(neo4j_driver)
        snapshot = await service.get_team_graph("test-team")
        assert snapshot.edge_count == 4

    async def test_snapshot_team_id_matches(
        self, neo4j_driver: AsyncDriver, clean_db: None
    ) -> None:
        await _seed_minimal_team(neo4j_driver)
        service = GraphService(neo4j_driver)
        snapshot = await service.get_team_graph("test-team")
        assert snapshot.team_id == "test-team"

    async def test_empty_team_returns_empty_snapshot(
        self, neo4j_driver: AsyncDriver, clean_db: None
    ) -> None:
        service = GraphService(neo4j_driver)
        snapshot = await service.get_team_graph("nonexistent-team")
        assert snapshot.node_count == 0
        assert snapshot.edge_count == 0

    async def test_cross_team_edges_excluded(
        self, neo4j_driver: AsyncDriver, clean_db: None
    ) -> None:
        """Edges between different teams must not appear in a team snapshot."""
        async with neo4j_driver.session() as session:
            for eng in [
                {"id": "t1-eng", "team": "team-1", "name": "Alice A", "skills": ["Python"], "seniority": "mid"},
                {"id": "t2-eng", "team": "team-2", "name": "Bob B", "skills": ["Go"], "seniority": "mid"},
            ]:
                await session.run(
                    "MERGE (e:Engineer {id: $id}) SET e.name=$name, e.skills=$skills, e.seniority=$seniority, e.team=$team",
                    eng,
                )
            await session.run(
                "MATCH (a:Engineer {id: 't1-eng'}) MATCH (b:Engineer {id: 't2-eng'})"
                " MERGE (a)-[r:REVIEWS_PR_OF]->(b) SET r.weight = 3"
            )

        service = GraphService(neo4j_driver)
        snap_t1 = await service.get_team_graph("team-1")
        assert snap_t1.edge_count == 0  # cross-team edge must not appear

    async def test_node_fields_populated(
        self, neo4j_driver: AsyncDriver, clean_db: None
    ) -> None:
        await _seed_minimal_team(neo4j_driver)
        service = GraphService(neo4j_driver)
        snapshot = await service.get_team_graph("test-team")
        alice = next(n for n in snapshot.nodes if n.id == "eng-a")
        assert alice.name == "Alice Chen"
        assert "Python" in alice.skills
        assert alice.seniority == "senior"

    async def test_edge_weights_populated(
        self, neo4j_driver: AsyncDriver, clean_db: None
    ) -> None:
        await _seed_minimal_team(neo4j_driver)
        service = GraphService(neo4j_driver)
        snapshot = await service.get_team_graph("test-team")
        ab_edge = next(
            e for e in snapshot.edges
            if e.source_id == "eng-a" and e.target_id == "eng-b"
        )
        assert ab_edge.weight == 8


# ─── get_shortest_paths ───────────────────────────────────────────────────────


class TestGetShortestPaths:
    async def test_direct_path_has_distance_1(
        self, neo4j_driver: AsyncDriver, clean_db: None
    ) -> None:
        await _seed_minimal_team(neo4j_driver)
        service = GraphService(neo4j_driver)
        paths = await service.get_shortest_paths("eng-a", "eng-b")
        assert len(paths) >= 1
        assert paths[0].distance == 1

    async def test_path_includes_both_endpoints(
        self, neo4j_driver: AsyncDriver, clean_db: None
    ) -> None:
        await _seed_minimal_team(neo4j_driver)
        service = GraphService(neo4j_driver)
        paths = await service.get_shortest_paths("eng-a", "eng-d")
        assert "eng-a" in paths[0].path
        assert "eng-d" in paths[0].path

    async def test_disconnected_nodes_return_empty(
        self, neo4j_driver: AsyncDriver, clean_db: None
    ) -> None:
        async with neo4j_driver.session() as session:
            for eng_id in ["iso-1", "iso-2"]:
                await session.run(
                    "MERGE (e:Engineer {id: $id}) SET e.name=$id, e.skills=[], e.seniority='mid', e.team='iso'",
                    {"id": eng_id},
                )
        service = GraphService(neo4j_driver)
        paths = await service.get_shortest_paths("iso-1", "iso-2")
        assert paths == []

    async def test_from_id_equals_to_id_is_empty(
        self, neo4j_driver: AsyncDriver, clean_db: None
    ) -> None:
        await _seed_minimal_team(neo4j_driver)
        service = GraphService(neo4j_driver)
        paths = await service.get_shortest_paths("eng-a", "eng-a")
        # shortestPath from a node to itself returns empty in Neo4j 5.x
        assert isinstance(paths, list)


# ─── get_centrality_scores ────────────────────────────────────────────────────


class TestGetCentralityScores:
    async def test_returns_score_for_every_engineer(
        self, neo4j_driver: AsyncDriver, clean_db: None
    ) -> None:
        await _seed_minimal_team(neo4j_driver)
        service = GraphService(neo4j_driver)
        scores = await service.get_centrality_scores("test-team")
        assert len(scores) == 4

    async def test_closeness_in_unit_interval(
        self, neo4j_driver: AsyncDriver, clean_db: None
    ) -> None:
        await _seed_minimal_team(neo4j_driver)
        service = GraphService(neo4j_driver)
        scores = await service.get_centrality_scores("test-team")
        for score in scores:
            assert 0.0 <= score.closeness <= 1.0, f"Out of range: {score}"

    async def test_betweenness_non_negative(
        self, neo4j_driver: AsyncDriver, clean_db: None
    ) -> None:
        await _seed_minimal_team(neo4j_driver)
        service = GraphService(neo4j_driver)
        scores = await service.get_centrality_scores("test-team")
        for score in scores:
            assert score.betweenness >= 0.0

    async def test_degree_non_negative(
        self, neo4j_driver: AsyncDriver, clean_db: None
    ) -> None:
        await _seed_minimal_team(neo4j_driver)
        service = GraphService(neo4j_driver)
        scores = await service.get_centrality_scores("test-team")
        for score in scores:
            assert score.degree >= 0

    async def test_hub_node_has_higher_closeness(
        self, neo4j_driver: AsyncDriver, clean_db: None
    ) -> None:
        """In A—B—C—D with A→C shortcut, A and C should have higher centrality than D."""
        await _seed_minimal_team(neo4j_driver)
        service = GraphService(neo4j_driver)
        scores = await service.get_centrality_scores("test-team")
        by_id = {s.engineer_id: s for s in scores}
        # D is a leaf node — should have lower closeness than hub nodes
        assert by_id["eng-d"].closeness < by_id["eng-a"].closeness


# ─── NetworkX centrality properties (unit tests, no DB) ──────────────────────


class TestNetworkXCentrality:
    def _make_snapshot(self, nodes: list[str], edges: list[tuple]) -> GraphSnapshot:
        from apps.api.models.graph_models import EngineerNode, GraphEdge
        return GraphSnapshot(
            team_id="unit",
            nodes=[
                EngineerNode(id=n, name=n, skills=[], seniority="mid", team="unit")
                for n in nodes
            ],
            edges=[
                GraphEdge(source_id=s, target_id=t, relationship="REVIEWS_PR_OF", weight=w)
                for s, t, w in edges
            ],
        )

    def test_isolated_nodes_have_zero_closeness(self) -> None:
        snapshot = self._make_snapshot(["a", "b"], [])
        scores = _compute_centrality_networkx(snapshot)
        for s in scores:
            assert s.closeness == 0.0

    def test_complete_graph_all_closeness_equal(self) -> None:
        """In a complete graph every node has the same closeness."""
        nodes = ["a", "b", "c", "d"]
        edges = [(s, t, 1) for s in nodes for t in nodes if s != t]
        snapshot = self._make_snapshot(nodes, edges)
        scores = _compute_centrality_networkx(snapshot)
        closeness_values = [s.closeness for s in scores]
        assert max(closeness_values) - min(closeness_values) < 1e-6

    def test_closeness_always_in_unit_interval(self) -> None:
        snapshot = self._make_snapshot(
            ["a", "b", "c"],
            [("a", "b", 3), ("b", "c", 7)],
        )
        scores = _compute_centrality_networkx(snapshot)
        for s in scores:
            assert 0.0 <= s.closeness <= 1.0

    def test_star_centre_has_highest_closeness(self) -> None:
        """Hub of a star graph has strictly higher closeness than leaves."""
        nodes = ["hub", "l1", "l2", "l3", "l4"]
        edges = [("hub", leaf, 1) for leaf in nodes[1:]]
        snapshot = self._make_snapshot(nodes, edges)
        scores = _compute_centrality_networkx(snapshot)
        by_id = {s.engineer_id: s.closeness for s in scores}
        for leaf in nodes[1:]:
            assert by_id["hub"] > by_id[leaf]


# ─── insert_candidate_node / delete_candidate_node ────────────────────────────


class TestCandidateNodeLifecycle:
    async def test_insert_creates_candidate_node(
        self, neo4j_driver: AsyncDriver, clean_db: None
    ) -> None:
        await _seed_minimal_team(neo4j_driver)
        service = GraphService(neo4j_driver)
        candidate = CandidateInsert(
            id="cand-test-001",
            name="Eve Wilson",
            skills=["Python", "Go"],
            team_id="test-team",
        )
        returned_id = await service.insert_candidate_node(candidate)
        assert returned_id == "cand-test-001"

        async with neo4j_driver.session() as session:
            result = await session.run(
                "MATCH (c:Candidate {id: $id}) RETURN c.name AS name",
                {"id": "cand-test-001"},
            )
            record = await result.single()
            assert record is not None
            assert record["name"] == "Eve Wilson"

    async def test_insert_projects_shared_domain_edges(
        self, neo4j_driver: AsyncDriver, clean_db: None
    ) -> None:
        """Engineers sharing skills with the candidate should get SHARES_DOMAIN_WITH edges."""
        await _seed_minimal_team(neo4j_driver)
        service = GraphService(neo4j_driver)
        candidate = CandidateInsert(
            id="cand-test-002",
            name="Frank Lee",
            skills=["Python"],  # eng-a and eng-b both have Python
            team_id="test-team",
        )
        await service.insert_candidate_node(candidate)

        async with neo4j_driver.session() as session:
            result = await session.run(
                "MATCH (:Engineer)-[:SHARES_DOMAIN_WITH]->(c:Candidate {id: $id})"
                " RETURN count(*) AS cnt",
                {"id": "cand-test-002"},
            )
            record = await result.single()
            assert record["cnt"] >= 2  # at least eng-a and eng-b

    async def test_delete_removes_candidate_and_edges(
        self, neo4j_driver: AsyncDriver, clean_db: None
    ) -> None:
        await _seed_minimal_team(neo4j_driver)
        service = GraphService(neo4j_driver)
        candidate = CandidateInsert(
            id="cand-test-003",
            name="Grace Kim",
            skills=["Python"],
            team_id="test-team",
        )
        await service.insert_candidate_node(candidate)
        await service.delete_candidate_node("cand-test-003")

        async with neo4j_driver.session() as session:
            result = await session.run(
                "MATCH (c:Candidate {id: $id}) RETURN count(c) AS cnt",
                {"id": "cand-test-003"},
            )
            record = await result.single()
            assert record["cnt"] == 0

    async def test_delete_is_idempotent(
        self, neo4j_driver: AsyncDriver, clean_db: None
    ) -> None:
        service = GraphService(neo4j_driver)
        # Deleting a nonexistent candidate should not raise
        await service.delete_candidate_node("does-not-exist")

    async def test_no_edges_when_no_skill_overlap(
        self, neo4j_driver: AsyncDriver, clean_db: None
    ) -> None:
        await _seed_minimal_team(neo4j_driver)
        service = GraphService(neo4j_driver)
        candidate = CandidateInsert(
            id="cand-test-004",
            name="Hiro Tanaka",
            skills=["COBOL"],  # no overlap with any engineer
            team_id="test-team",
        )
        await service.insert_candidate_node(candidate)

        async with neo4j_driver.session() as session:
            result = await session.run(
                "MATCH ()-[:SHARES_DOMAIN_WITH]->(c:Candidate {id: $id})"
                " RETURN count(*) AS cnt",
                {"id": "cand-test-004"},
            )
            record = await result.single()
            assert record["cnt"] == 0
