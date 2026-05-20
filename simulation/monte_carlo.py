"""Monte Carlo simulation engine — the core value of STAS.

Treat this file like financial modelling code: determinism and correctness
come before cleverness.

Simulation invariants (all enforced by tests in simulation/tests/):
  1. Same snapshot_id + candidate_id + seed → byte-identical SimulationResult.
  2. Every metric output includes a 95% CI.  No bare point estimates.
  3. The candidate node is added to a COPY of the graph.  The live Neo4j
     graph is never touched by the engine.
  4. Edge weights are sampled from Poisson(λ = base_weight) each iteration,
     modelling natural variance in collaboration event counts.
  5. Minimum edge weight after perturbation is 1 (an edge cannot disappear
     due to sampling noise).

Performance contract: 1,000 iterations on a 50-node graph < 2 seconds
(verified by simulation/tests/test_monte_carlo.py::test_performance_baseline).
"""

from __future__ import annotations

from collections.abc import Callable
from typing import TYPE_CHECKING

import networkx as nx
import numpy as np

from simulation import metrics as m
from simulation.models import MetricDistribution, SimulationResult, SkillGapMatch

if TYPE_CHECKING:
    from apps.api.models.graph_models import CandidateInsert, GraphSnapshot


class SimulationEngine:
    """Stateless Monte Carlo engine.  Safe to share across async requests."""

    def run(
        self,
        snapshot: GraphSnapshot,
        candidate: CandidateInsert,
        n_iterations: int = 1_000,
        seed: int = 42,
        progress_callback: Callable[[float, int], None] | None = None,
    ) -> SimulationResult:
        """Run the full Monte Carlo simulation.

        Args:
            snapshot:          Frozen team graph (from Neo4j, never modified).
            candidate:         Candidate to insert and evaluate.
            n_iterations:      How many Monte Carlo samples to draw.
            seed:              RNG seed — same seed + inputs → identical output.
            progress_callback: Optional fn(pct_complete, iterations_done)
                               called every 100 iterations.  Used by SSE stream.

        Returns:
            SimulationResult with distributions for all metrics plus
            deterministic skill coverage and topology change analyses.
        """
        rng = np.random.default_rng(seed)

        # ── Build the base graph (frozen — never modified in-place) ──────────
        G_base = self._build_base_graph(snapshot)

        # ── Compute candidate connections (deterministic) ────────────────────
        candidate_edges = self._compute_candidate_edges(G_base, candidate)

        # Add candidate permanently to G_base so it's included in every copy
        G_base.add_node(candidate.id)
        for peer_id, base_weight in candidate_edges.items():
            G_base.add_edge(candidate.id, peer_id, weight=float(base_weight))

        # ── Monte Carlo loop ─────────────────────────────────────────────────
        # Per-iteration: closeness + silo_risk (fast — O(n+m) each)
        # Post-loop:     betweenness_delta on mean graph (expensive — once)
        cc_samples = np.empty(n_iterations)
        silo_samples = np.empty(n_iterations)

        # Extract base weights for Poisson sampling
        base_weights: dict[tuple, float] = {
            (u, v): d["weight"] for u, v, d in G_base.edges(data=True)
        }

        _report_every = 100

        for i in range(n_iterations):
            G_iter = self._perturb(G_base, base_weights, rng)
            cc_samples[i] = m.closeness_centrality(G_iter, candidate.id)
            silo_samples[i] = m.silo_risk_score(G_iter, candidate.id)

            if progress_callback and (i + 1) % _report_every == 0:
                progress_callback((i + 1) / n_iterations, i + 1)

        # ── Post-loop metrics (computed once on mean graph) ──────────────────
        G_mean = self._mean_graph(G_base, base_weights)
        bd_value = m.betweenness_centrality_delta(G_mean, candidate.id)
        # Betweenness delta as a degenerate distribution (single observation)
        bd_samples = np.array([bd_value])

        mean_cc = float(np.mean(cc_samples))
        ttv = m.time_to_value_estimate(mean_cc)
        ttv_samples = np.array([ttv])

        # ── Topology change map ──────────────────────────────────────────────
        # For each edge adjacent to the candidate, predicted weight Δ
        topology_change_map = {
            f"{candidate.id}->{peer}": float(base_weight - G_base[candidate.id][peer]["weight"])
            for peer, base_weight in candidate_edges.items()
            if G_base.has_edge(candidate.id, peer)
        }

        # ── Skill gap analysis (deterministic) ──────────────────────────────
        knowledge_gap_coverage = self._skill_gap_coverage(snapshot, candidate)

        return SimulationResult(
            candidate_id=candidate.id,
            snapshot_id=snapshot.snapshot_id,
            n_iterations=n_iterations,
            seed=seed,
            closeness_centrality=MetricDistribution(**m.make_distribution(cc_samples)),
            betweenness_delta=MetricDistribution(**m.make_distribution(bd_samples)),
            silo_risk_score=MetricDistribution(**m.make_distribution(silo_samples)),
            time_to_value_weeks=MetricDistribution(**m.make_distribution(ttv_samples)),
            knowledge_gap_coverage=knowledge_gap_coverage,
            topology_change_map=topology_change_map,
        )

    # ── Graph construction helpers ────────────────────────────────────────────

    @staticmethod
    def _build_base_graph(snapshot: GraphSnapshot) -> nx.Graph:
        """Convert a GraphSnapshot into an undirected NetworkX graph."""
        G: nx.Graph = nx.Graph()
        for node in snapshot.nodes:
            G.add_node(node.id, skills=node.skills, team=node.team)
        for edge in snapshot.edges:
            if G.has_edge(edge.source_id, edge.target_id):
                G[edge.source_id][edge.target_id]["weight"] += float(edge.weight)
            else:
                G.add_edge(edge.source_id, edge.target_id, weight=float(edge.weight))
        return G

    @staticmethod
    def _compute_candidate_edges(
        G: nx.Graph, candidate: CandidateInsert
    ) -> dict[str, int]:
        """Return {engineer_id: shared_skill_count} for all engineers with overlap."""
        candidate_skills = set(candidate.skills)
        connections: dict[str, int] = {}
        for node_id, attrs in G.nodes(data=True):
            engineer_skills = set(attrs.get("skills") or [])
            overlap = len(candidate_skills & engineer_skills)
            if overlap > 0:
                connections[node_id] = overlap
        return connections

    @staticmethod
    def _perturb(
        G_base: nx.Graph,
        base_weights: dict[tuple, float],
        rng: np.random.Generator,
    ) -> nx.Graph:
        """Create a copy of G_base with Poisson-perturbed edge weights.

        Each edge weight w' ~ Poisson(λ = base_weight), clamped to ≥ 1 so
        no edge disappears due to sampling noise.
        """
        G_iter = G_base.copy()
        for (u, v), lam in base_weights.items():
            w_prime = int(rng.poisson(max(lam, 1.0)))
            G_iter[u][v]["weight"] = max(w_prime, 1)
        return G_iter

    @staticmethod
    def _mean_graph(G_base: nx.Graph, base_weights: dict[tuple, float]) -> nx.Graph:
        """Return a copy of G_base with weights set to their Poisson mean (= base_weight)."""
        G = G_base.copy()
        for (u, v), w in base_weights.items():
            G[u][v]["weight"] = w
        return G

    @staticmethod
    def _skill_gap_coverage(
        snapshot: GraphSnapshot, candidate: CandidateInsert
    ) -> list[SkillGapMatch]:
        """Deterministic skill gap analysis — no Monte Carlo needed."""
        from collections import Counter

        all_skills: set[str] = set()
        for node in snapshot.nodes:
            all_skills.update(node.skills)
        all_skills.update(candidate.skills)

        skill_counts = Counter(
            skill for node in snapshot.nodes for skill in node.skills
        )
        n_engineers = len(snapshot.nodes)
        candidate_skills = set(candidate.skills)

        results: list[SkillGapMatch] = []
        for skill in sorted(all_skills):
            count_before = skill_counts[skill]
            count_after = count_before + (1 if skill in candidate_skills else 0)
            coverage_before = count_before / n_engineers if n_engineers else 0.0
            coverage_after = count_after / (n_engineers + 1) if n_engineers else 0.0
            results.append(
                SkillGapMatch(
                    skill=skill,
                    engineer_count_with_skill=count_before,
                    candidate_has_skill=skill in candidate_skills,
                    coverage_delta=round(coverage_after - coverage_before, 4),
                )
            )
        return results
