"""Tests for the Monte Carlo engine (simulation/monte_carlo.py).

Verifies:
  - Determinism: same seed + input → identical SimulationResult
  - Correctness invariants: C_C ∈ [0,1], CI ordering, ttv > 0
  - Performance baseline: 1 000 iterations on 50-node graph < 2 s
  - Skill gap coverage logic
"""

from __future__ import annotations

import time
from datetime import datetime

import pytest

from apps.api.models.graph_models import (
    CandidateInsert,
    EngineerNode,
    GraphEdge,
    GraphSnapshot,
)
from simulation.monte_carlo import SimulationEngine

_engine = SimulationEngine()

# ── Fixtures ──────────────────────────────────────────────────────────────────


def _make_snapshot(
    n_engineers: int = 10,
    edge_density: float = 0.4,
    seed: int = 0,
) -> GraphSnapshot:
    import numpy as np

    rng = np.random.default_rng(seed)
    skills_pool = ["python", "go", "kafka", "neo4j", "react", "typescript", "docker"]

    nodes = [
        EngineerNode(
            id=f"eng_{i:03d}",
            name=f"Engineer {i}",
            skills=list(rng.choice(skills_pool, size=3, replace=False)),
            seniority="mid",
            team="platform",
        )
        for i in range(n_engineers)
    ]

    edges: list[GraphEdge] = []
    for i in range(n_engineers):
        for j in range(i + 1, n_engineers):
            if rng.random() < edge_density:
                edges.append(
                    GraphEdge(
                        source_id=nodes[i].id,
                        target_id=nodes[j].id,
                        relationship="REVIEWS_PR_OF",
                        weight=float(rng.integers(1, 10)),
                    )
                )

    return GraphSnapshot(
        team_id="platform",
        snapshot_id="test-snapshot-001",
        captured_at=datetime(2026, 1, 1),
        nodes=nodes,
        edges=edges,
    )


def _make_candidate(skills: list[str] | None = None) -> CandidateInsert:
    return CandidateInsert(
        id="cand_test_001",
        name="Test Candidate",
        skills=skills or ["python", "kafka", "docker"],
        team_id="platform",
    )


# ── Determinism ───────────────────────────────────────────────────────────────


class TestDeterminism:
    def test_same_seed_produces_identical_mean_cc(self) -> None:
        snapshot = _make_snapshot()
        candidate = _make_candidate()
        r1 = _engine.run(snapshot, candidate, n_iterations=200, seed=42)
        r2 = _engine.run(snapshot, candidate, n_iterations=200, seed=42)
        assert r1.closeness_centrality.mean == r2.closeness_centrality.mean

    def test_same_seed_produces_identical_result_structure(self) -> None:
        snapshot = _make_snapshot()
        candidate = _make_candidate()
        r1 = _engine.run(snapshot, candidate, n_iterations=100, seed=7)
        r2 = _engine.run(snapshot, candidate, n_iterations=100, seed=7)
        assert r1.closeness_centrality == r2.closeness_centrality
        assert r1.silo_risk_score == r2.silo_risk_score

    def test_different_seeds_produce_different_distributions(self) -> None:
        snapshot = _make_snapshot(n_engineers=15)
        candidate = _make_candidate()
        r1 = _engine.run(snapshot, candidate, n_iterations=500, seed=1)
        r2 = _engine.run(snapshot, candidate, n_iterations=500, seed=2)
        # Different seeds → different samples → different means (with overwhelming prob)
        assert r1.closeness_centrality.mean != r2.closeness_centrality.mean

    def test_snapshot_id_preserved_in_result(self) -> None:
        snapshot = _make_snapshot()
        candidate = _make_candidate()
        result = _engine.run(snapshot, candidate, seed=0)
        assert result.snapshot_id == snapshot.snapshot_id

    def test_candidate_id_preserved_in_result(self) -> None:
        snapshot = _make_snapshot()
        candidate = _make_candidate()
        result = _engine.run(snapshot, candidate, seed=0)
        assert result.candidate_id == candidate.id


# ── Metric invariants ─────────────────────────────────────────────────────────


class TestMetricInvariants:
    def test_closeness_mean_in_unit_interval(self) -> None:
        result = _engine.run(_make_snapshot(20), _make_candidate(), n_iterations=200, seed=0)
        assert 0.0 <= result.closeness_centrality.mean <= 1.0

    def test_ci_is_ordered(self) -> None:
        result = _engine.run(_make_snapshot(), _make_candidate(), n_iterations=500, seed=0)
        lo, hi = result.closeness_centrality.ci_95
        assert lo <= result.closeness_centrality.mean <= hi

    def test_percentiles_are_monotone(self) -> None:
        result = _engine.run(_make_snapshot(), _make_candidate(), n_iterations=200, seed=0)
        p = result.closeness_centrality.percentiles
        assert p["p5"] <= p["p25"] <= p["p50"] <= p["p75"] <= p["p95"]

    def test_time_to_value_is_positive(self) -> None:
        result = _engine.run(_make_snapshot(), _make_candidate(), n_iterations=100, seed=0)
        assert result.time_to_value_weeks.mean > 0

    def test_n_iterations_stored_correctly(self) -> None:
        result = _engine.run(_make_snapshot(), _make_candidate(), n_iterations=150, seed=0)
        assert result.n_iterations == 150

    def test_seed_stored_correctly(self) -> None:
        result = _engine.run(_make_snapshot(), _make_candidate(), seed=99)
        assert result.seed == 99

    def test_isolated_candidate_has_low_centrality(self) -> None:
        """Candidate with no overlapping skills → no edges → C_C ≈ 0."""
        snapshot = _make_snapshot(n_engineers=8)
        isolated = CandidateInsert(
            id="cand_isolated",
            name="Isolated",
            skills=["cobol", "fortran"],  # no overlap with team
            team_id="platform",
        )
        result = _engine.run(snapshot, isolated, n_iterations=200, seed=0)
        assert result.closeness_centrality.mean == pytest.approx(0.0)


# ── Skill gap coverage ────────────────────────────────────────────────────────


class TestSkillGapCoverage:
    def test_candidate_skills_flagged(self) -> None:
        snapshot = _make_snapshot(n_engineers=5, seed=0)
        candidate = _make_candidate(skills=["cobol"])  # unique skill
        result = _engine.run(snapshot, candidate, n_iterations=50, seed=0)
        cobol_entry = next(
            (g for g in result.knowledge_gap_coverage if g.skill == "cobol"), None
        )
        assert cobol_entry is not None
        assert cobol_entry.candidate_has_skill is True

    def test_coverage_delta_positive_for_new_skill(self) -> None:
        snapshot = _make_snapshot(n_engineers=5, seed=0)
        candidate = _make_candidate(skills=["cobol"])
        result = _engine.run(snapshot, candidate, n_iterations=50, seed=0)
        cobol_entry = next(
            g for g in result.knowledge_gap_coverage if g.skill == "cobol"
        )
        assert cobol_entry.coverage_delta > 0

    def test_topology_change_map_keys_reference_candidate(self) -> None:
        snapshot = _make_snapshot(n_engineers=8, seed=0)
        candidate = _make_candidate()
        result = _engine.run(snapshot, candidate, n_iterations=50, seed=0)
        # All keys in topology_change_map should reference the candidate
        for key in result.topology_change_map:
            assert key.startswith(candidate.id + "->")


# ── Progress callback ─────────────────────────────────────────────────────────


class TestProgressCallback:
    def test_callback_fires_at_expected_intervals(self) -> None:
        events: list[tuple[float, int]] = []

        def cb(pct: float, n: int) -> None:
            events.append((pct, n))

        _engine.run(
            _make_snapshot(),
            _make_candidate(),
            n_iterations=300,
            seed=0,
            progress_callback=cb,
        )
        # Callback fires every 100 iterations → 3 events for 300 iters
        assert len(events) == 3
        assert events[-1] == pytest.approx((1.0, 300))

    def test_no_callback_does_not_raise(self) -> None:
        # Sanity: None callback must not cause any error
        _engine.run(_make_snapshot(), _make_candidate(), n_iterations=50, seed=0)


# ── Performance baseline ──────────────────────────────────────────────────────


class TestPerformance:
    @pytest.mark.slow
    def test_1000_iterations_50_nodes_under_2_seconds(self) -> None:
        snapshot = _make_snapshot(n_engineers=50, edge_density=0.4, seed=99)
        candidate = _make_candidate()

        start = time.perf_counter()
        _engine.run(snapshot, candidate, n_iterations=1_000, seed=42)
        elapsed = time.perf_counter() - start

        assert elapsed < 2.0, (
            f"Performance regression: 1 000 iters on 50-node graph took"
            f" {elapsed:.2f}s (limit: 2.00s)"
        )
